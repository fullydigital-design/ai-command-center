// ============================================================
// HuggingFace Service — Abstraction layer for HF Model Hub
// ============================================================
//
// RIGHT NOW:  Simulated data for UI prototype.
// MIGRATION:  Swap to FastAPI calls that proxy HuggingFace API.
//
// FastAPI endpoints this maps to:
//   GET    /api/huggingface/models           → getModels()
//   GET    /api/huggingface/models/trending   → getTrendingModels()
//   GET    /api/huggingface/models/:id        → getModelDetails()
//   POST   /api/huggingface/models/:id/download → downloadModel()
//   GET    /api/huggingface/search            → searchModels()
//
// ─────────────────────────────────────────────────────────
// PYTHON BACKEND IMPLEMENTATION GUIDE
// ─────────────────────────────────────────────────────────
//
// Required pip packages:
//   pip install huggingface_hub requests
//
// 1. HUGGINGFACE API (huggingface_hub)
//    from huggingface_hub import HfApi, hf_hub_download
//    api = HfApi()
//
//    # Search models:
//    models = api.list_models(
//      search="flux lora",
//      sort="downloads",
//      direction=-1,
//      limit=50,
//      filter="text-to-image"
//    )
//
//    # Get model info:
//    info = api.model_info("black-forest-labs/FLUX.1-dev")
//    info.downloads, info.likes, info.last_modified, info.siblings (files)
//
//    # Download model file:
//    hf_hub_download(
//      repo_id="black-forest-labs/FLUX.1-dev",
//      filename="flux1-dev.safetensors",
//      local_dir="C:/_AI/_test_fresh_all_AI/models/checkpoints/"
//    )
//
// 2. VRAM ESTIMATION
//    Based on file size and precision:
//    - FP32: params * 4 bytes
//    - FP16/BF16: params * 2 bytes
//    - FP8: params * 1 byte
//    - GGUF Q4: ~params * 0.5 bytes
//    Rule of thumb: model file size ≈ VRAM needed + ~2GB overhead
//
// 3. RATE LIMITING
//    - Unauthenticated: 1000 requests/hour
//    - Authenticated (HF token): 10,000 requests/hour
//    - Cache results for 15 minutes
//
// ============================================================

import type { DataSource } from "./types";
import { getApiKey, hasApiKey } from "./apiKeys";
import type { FetchMeta } from "./apiKeys";
import { mockModels } from "./mocks/huggingface.mock";

// --- Environment detection (single source of truth: env.ts) ---
import { isTauriEnv, shouldTryBackend, getApiBase } from "./env";
import { fetchExternalAPI, fetchBackend } from "./fetchWithRetry";
import { createService } from "./createService";

// --- Live API cache ---
let hfLiveCache: { data: HFModel[]; ts: number } | null = null;
const HF_CACHE_TTL = 15 * 60 * 1000;
let hfLastFetchMeta: FetchMeta | null = null;

/** Get metadata about the last fetch for validation display. */
export function getHFFetchMeta(): FetchMeta | null {
  return hfLastFetchMeta;
}

/** Clear cache to force a fresh API call. */
export function clearHFCache(): void {
  hfLiveCache = null;
  hfLastFetchMeta = null;
}

/**
 * Fetch real models from HuggingFace API.
 * Works without token (1000 req/hr) or with token (10,000 req/hr).
 */
async function fetchLiveHFModels(): Promise<HFModel[] | null> {
  const token = getApiKey("huggingface");

  if (hfLiveCache && Date.now() - hfLiveCache.ts < HF_CACHE_TTL) {
    hfLastFetchMeta = {
      source: "cache",
      fetchedAt: new Date(hfLiveCache.ts).toISOString(),
      itemCount: hfLiveCache.data.length,
      endpoint: "huggingface.co/api (cached)",
    };
    return hfLiveCache.data;
  }

  const headers: Record<string, string> = {};
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  try {
    // Search for diffusion models sorted by downloads
    const searches = [
      "https://huggingface.co/api/models?search=flux+lora&sort=downloads&direction=-1&limit=10",
      "https://huggingface.co/api/models?search=sdxl+checkpoint&sort=downloads&direction=-1&limit=10",
      "https://huggingface.co/api/models?search=stable+diffusion+controlnet&sort=downloads&direction=-1&limit=5",
      "https://huggingface.co/api/models?search=flux+checkpoint&sort=likes&direction=-1&limit=5",
      "https://huggingface.co/api/models?search=wan+video+generation&sort=downloads&direction=-1&limit=5",
    ];

    const results = await Promise.allSettled(
      searches.map((url) =>
        fetchExternalAPI(url, { headers: Object.keys(headers).length > 0 ? headers : undefined })
          .then((r) => r.ok ? r.json() : [])
      )
    );

    const models: HFModel[] = [];
    const seen = new Set<string>();

    for (const result of results) {
      if (result.status !== "fulfilled") continue;
      for (const m of result.value) {
        if (seen.has(m.id)) continue;
        seen.add(m.id);
        models.push(mapHFApiModel(m));
      }
    }

    if (models.length === 0) {
      hfLastFetchMeta = {
        source: "live-api",
        fetchedAt: new Date().toISOString(),
        itemCount: 0,
        endpoint: "huggingface.co/api/models",
        error: "No models returned. HuggingFace API may be temporarily unavailable.",
      };
      return null;
    }

    hfLiveCache = { data: models, ts: Date.now() };
    hfLastFetchMeta = {
      source: "live-api",
      fetchedAt: new Date(hfLiveCache.ts).toISOString(),
      itemCount: hfLiveCache.data.length,
      endpoint: "huggingface.co/api/models",
    };
    return models;
  } catch (e) {
    console.warn("[HuggingFaceService] Live API failed:", e);
    hfLastFetchMeta = {
      source: "live-api",
      fetchedAt: new Date().toISOString(),
      itemCount: 0,
      endpoint: "huggingface.co/api/models",
      error: String(e),
    };
    return null;
  }
}

function inferModelType(m: any): HFModelType {
  const tags: string[] = m.tags || [];
  const name = (m.id || "").toLowerCase();
  if (tags.includes("lora") || name.includes("lora")) return "lora";
  if (tags.includes("controlnet") || name.includes("controlnet")) return "controlnet";
  if (tags.includes("vae") || name.includes("vae")) return "vae";
  if (tags.includes("text-encoder") || name.includes("text-encoder")) return "text-encoder";
  if (tags.includes("embedding") || name.includes("embedding")) return "embedding";
  if (tags.includes("upscaler") || name.includes("upscal")) return "upscaler";
  if (tags.includes("ip-adapter") || name.includes("ip-adapter") || name.includes("ipadapter")) return "ip-adapter";
  return "checkpoint";
}

function inferArchitecture(m: any): HFArchitecture {
  const tags: string[] = m.tags || [];
  const name = (m.id || "").toLowerCase();
  if (tags.includes("flux") || name.includes("flux")) return "flux";
  if (tags.includes("sdxl") || name.includes("sdxl")) return "sdxl";
  if (tags.includes("sd3") || name.includes("sd3")) return "sd3";
  if (name.includes("hunyuan")) return "hunyuan";
  if (name.includes("wan")) return "wan";
  if (tags.includes("stable-diffusion") || name.includes("sd-1") || name.includes("sd1.5")) return "sd15";
  return "other";
}

function formatDownloads(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

function estimateVramFit(sizeBytes: number): VRAMFit {
  const gb = sizeBytes / (1024 * 1024 * 1024);
  if (gb <= 12) return "green";
  if (gb <= 28) return "yellow";
  return "red";
}

function formatFileSize(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(0)} MB`;
  return `${(bytes / 1024).toFixed(0)} KB`;
}

function mapHFApiModel(m: any): HFModel {
  const tags: string[] = m.tags || [];
  const type = inferModelType(m);
  const arch = inferArchitecture(m);
  const parts = (m.id || "").split("/");
  const author = parts[0] || "unknown";
  const name = parts[1] || m.id;

  // Estimate file size from siblings if available
  let fileSizeBytes = 0;
  if (m.siblings) {
    for (const f of m.siblings) {
      if (f.rfilename?.endsWith(".safetensors") || f.rfilename?.endsWith(".ckpt") || f.rfilename?.endsWith(".bin")) {
        fileSizeBytes = Math.max(fileSizeBytes, f.size || 0);
      }
    }
  }
  // Fallback estimate based on type
  if (fileSizeBytes === 0) {
    fileSizeBytes = type === "lora" ? 200 * 1024 * 1024 : type === "vae" ? 335 * 1024 * 1024 : 6.5 * 1024 * 1024 * 1024;
  }

  const downloadTargets: Record<HFModelType, string> = {
    checkpoint: "checkpoints", lora: "loras", vae: "vae", controlnet: "controlnet",
    "text-encoder": "text_encoders", embedding: "embeddings", upscaler: "upscale_models", "ip-adapter": "ipadapter",
  };

  const compatTools: string[] = [];
  if (tags.includes("diffusers") || type === "checkpoint") compatTools.push("ComfyUI", "SwarmUI");
  if (type === "lora") compatTools.push("ComfyUI", "Kohya");
  if (compatTools.length === 0) compatTools.push("ComfyUI");

  return {
    id: m.id || m._id,
    repoId: m.id,
    name,
    author,
    description: m.description || m.cardData?.description || `${type} model for ${arch}`,
    type,
    architecture: arch,
    precision: "FP16",
    fileSize: formatFileSize(fileSizeBytes),
    fileSizeBytes,
    vramFit: estimateVramFit(fileSizeBytes),
    downloads: formatDownloads(m.downloads || 0),
    likes: m.likes || 0,
    lastUpdated: m.lastModified ? new Date(m.lastModified).toLocaleDateString() : "Unknown",
    trending: (m.likes || 0) > 500 || (m.downloads || 0) > 100000,
    pinned: false,
    tags: tags.filter((t: string) => !["region:us", "license:apache-2.0", "license:mit", "arxiv:*"].some(p => t.startsWith(p.replace("*", "")))).slice(0, 5),
    compatibleWith: compatTools,
    downloadTarget: downloadTargets[type] || "checkpoints",
    licenseType: tags.some((t: string) => t.startsWith("license:")) ? "open" : m.gated ? "gated" : "open",
    updatedAtISO: m.lastModified,
  };
}

// --- Types ---

export type HFModelType = "checkpoint" | "lora" | "vae" | "controlnet" | "text-encoder" | "embedding" | "upscaler" | "ip-adapter";
export type HFArchitecture = "all" | "flux" | "sdxl" | "sd15" | "wan" | "hunyuan" | "sd3" | "other";
export type HFPrecision = "FP32" | "FP16" | "BF16" | "FP8" | "GGUF-Q8" | "GGUF-Q5" | "GGUF-Q4" | "NF4";
export type VRAMFit = "green" | "yellow" | "red"; // fits easily / tight fit / won't fit in 32GB

export interface HFModel {
  id: string;
  repoId: string;           // e.g. "black-forest-labs/FLUX.1-dev"
  name: string;
  author: string;
  description: string;
  type: HFModelType;
  architecture: HFArchitecture;
  precision: HFPrecision;
  fileSize: string;          // e.g. "23.8 GB"
  fileSizeBytes: number;     // For VRAM calculation
  vramFit: VRAMFit;
  downloads: string;         // e.g. "1.2M"
  likes: number;
  lastUpdated: string;
  trending: boolean;
  pinned: boolean;
  tags: string[];
  compatibleWith: string[];  // ["ComfyUI", "SwarmUI", "Kohya", etc.]
  downloadTarget?: string;   // Target subfolder: "checkpoints", "loras", etc.
  licenseType: string;       // "open", "gated", "commercial"
  updatedAtISO?: string;     // ISO timestamp for exact date/time display
}

export interface HFCategoryDef {
  value: HFArchitecture;
  label: string;
}

export interface HFTypeDef {
  value: HFModelType | "all";
  label: string;
}

// ============================================================
// PUBLIC API
// ============================================================

export function getHFDataSource(): DataSource {
  if (isTauriEnv()) return "process";
  // HF API works without token (1000 req/hr) — always try live
  return hfLastFetchMeta?.source === "live-api" || hfLastFetchMeta?.source === "cache"
    ? "nvidia"
    : hasApiKey("huggingface")
      ? "nvidia"
      : "simulated";
}

export const getHFModels = createService<HFModel[]>({
  backendPath: "/huggingface/models",
  liveFetcher: () => fetchLiveHFModels(),
  mockData: () => [...mockModels],
  label: "huggingfaceService.getHFModels",
});

export async function downloadHFModel(modelId: string): Promise<boolean> {
  if (shouldTryBackend()) {
    try {
      const res = await fetchBackend(`${getApiBase()}/huggingface/models/${encodeURIComponent(modelId)}/download`, {
        method: "POST",
      });
      return res.ok;
    } catch { return false; }
  }
  await new Promise((r) => setTimeout(r, 3000));
  return true;
}

export function getHFModelUrl(repoId: string): string {
  return `https://huggingface.co/${repoId}`;
}

export function getHFArchitectures(): HFCategoryDef[] {
  return [
    { value: "all", label: "All" },
    { value: "flux", label: "FLUX" },
    { value: "sdxl", label: "SDXL" },
    { value: "sd15", label: "SD 1.5" },
    { value: "wan", label: "Wan" },
    { value: "hunyuan", label: "Hunyuan" },
    { value: "sd3", label: "SD3" },
    { value: "other", label: "Other" },
  ];
}

export function getHFTypes(): HFTypeDef[] {
  return [
    { value: "all", label: "All Types" },
    { value: "checkpoint", label: "Checkpoint" },
    { value: "lora", label: "LoRA" },
    { value: "vae", label: "VAE" },
    { value: "controlnet", label: "ControlNet" },
    { value: "text-encoder", label: "Text Encoder" },
    { value: "embedding", label: "Embedding" },
    { value: "upscaler", label: "Upscaler" },
    { value: "ip-adapter", label: "IP-Adapter" },
  ];
}

/**
 * Calculate VRAM fit based on file size and 32GB total VRAM.
 * green: model + 4GB overhead fits comfortably (< 26GB)
 * yellow: tight fit (26-30GB)
 * red: won't fit (> 30GB)
 */
export function calcVRAMFit(fileSizeBytes: number): VRAMFit {
  const sizeGB = fileSizeBytes / (1024 * 1024 * 1024);
  if (sizeGB < 20) return "green";
  if (sizeGB < 28) return "yellow";
  return "red";
}

// --- Mock data (extracted to mocks/huggingface.mock.ts) ---