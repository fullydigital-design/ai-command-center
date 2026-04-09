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

// --- Environment detection (single source of truth: env.ts) ---
import { isTauriEnv, shouldTryBackend, getApiBase } from "./env";
import { fetchExternalAPI, fetchBackend } from "./fetchWithRetry";

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

export async function getHFModels(): Promise<HFModel[]> {
  if (shouldTryBackend()) {
    try {
      const res = await fetchBackend(`${getApiBase()}/huggingface/models`);
      if (res.ok) return await res.json();
    } catch { /* fall through */ }
  }

  // Try live API with stored key
  const live = await fetchLiveHFModels();
  if (live) return live;

  return [...mockModels];
}

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

// --- Mock data ---

const mockModels: HFModel[] = [
  // === FLUX Models ===
  {
    id: "hf-1", repoId: "black-forest-labs/FLUX.1-dev", name: "FLUX.1 [dev]", author: "Black Forest Labs",
    description: "12B parameter rectified flow transformer for high-quality text-to-image generation",
    type: "checkpoint", architecture: "flux", precision: "FP16", fileSize: "23.8 GB", fileSizeBytes: 23.8 * 1024 ** 3,
    vramFit: "yellow", downloads: "2.8M", likes: 8420, lastUpdated: "2 weeks ago", trending: true, pinned: false,
    tags: ["text-to-image", "12B", "rectified-flow", "guidance-distilled"],
    compatibleWith: ["ComfyUI", "SwarmUI"], downloadTarget: "checkpoints", licenseType: "gated",
  },
  {
    id: "hf-2", repoId: "black-forest-labs/FLUX.1-schnell", name: "FLUX.1 [schnell]", author: "Black Forest Labs",
    description: "Fast 4-step variant of FLUX.1 for rapid generation — Apache 2.0 licensed",
    type: "checkpoint", architecture: "flux", precision: "FP16", fileSize: "23.8 GB", fileSizeBytes: 23.8 * 1024 ** 3,
    vramFit: "yellow", downloads: "1.5M", likes: 5210, lastUpdated: "1 month ago", trending: false, pinned: false,
    tags: ["text-to-image", "fast", "4-step", "apache-2.0"],
    compatibleWith: ["ComfyUI", "SwarmUI"], downloadTarget: "checkpoints", licenseType: "open",
  },
  {
    id: "hf-3", repoId: "black-forest-labs/FLUX.1-Fill-dev", name: "FLUX.1 Fill [dev]", author: "Black Forest Labs",
    description: "FLUX.1 inpainting/outpainting model for image editing and expansion",
    type: "checkpoint", architecture: "flux", precision: "FP16", fileSize: "23.8 GB", fileSizeBytes: 23.8 * 1024 ** 3,
    vramFit: "yellow", downloads: "420K", likes: 2180, lastUpdated: "3 weeks ago", trending: false, pinned: false,
    tags: ["inpainting", "outpainting", "image-editing"],
    compatibleWith: ["ComfyUI", "SwarmUI"], downloadTarget: "checkpoints", licenseType: "gated",
  },
  {
    id: "hf-4", repoId: "city96/FLUX.1-dev-gguf", name: "FLUX.1-dev GGUF", author: "city96",
    description: "GGUF quantized FLUX.1-dev — run on lower VRAM with minimal quality loss",
    type: "checkpoint", architecture: "flux", precision: "GGUF-Q5", fileSize: "8.2 GB", fileSizeBytes: 8.2 * 1024 ** 3,
    vramFit: "green", downloads: "890K", likes: 3450, lastUpdated: "1 week ago", trending: true, pinned: false,
    tags: ["gguf", "quantized", "low-vram", "flux"],
    compatibleWith: ["ComfyUI"], downloadTarget: "checkpoints", licenseType: "open",
  },
  {
    id: "hf-5", repoId: "XLabs-AI/flux-RealismLora", name: "FLUX Realism LoRA", author: "XLabs-AI",
    description: "Realism enhancement LoRA for FLUX.1 — photorealistic outputs with simple trigger",
    type: "lora", architecture: "flux", precision: "BF16", fileSize: "352 MB", fileSizeBytes: 352 * 1024 ** 2,
    vramFit: "green", downloads: "1.1M", likes: 4120, lastUpdated: "2 weeks ago", trending: true, pinned: false,
    tags: ["lora", "realism", "photorealistic", "flux"],
    compatibleWith: ["ComfyUI", "SwarmUI", "Kohya"], downloadTarget: "loras", licenseType: "open",
  },
  {
    id: "hf-6", repoId: "black-forest-labs/FLUX.1-Kontext-dev", name: "FLUX.1 Kontext [dev]", author: "Black Forest Labs",
    description: "FLUX Kontext — image-aware generation with context conditioning and editing",
    type: "checkpoint", architecture: "flux", precision: "FP16", fileSize: "23.8 GB", fileSizeBytes: 23.8 * 1024 ** 3,
    vramFit: "yellow", downloads: "680K", likes: 3890, lastUpdated: "5 days ago", trending: true, pinned: false,
    tags: ["kontext", "image-editing", "context-aware", "flux"],
    compatibleWith: ["ComfyUI", "SwarmUI"], downloadTarget: "checkpoints", licenseType: "gated",
  },

  // === SDXL Models ===
  {
    id: "hf-10", repoId: "stabilityai/stable-diffusion-xl-base-1.0", name: "SDXL Base 1.0", author: "Stability AI",
    description: "Stable Diffusion XL base model — 6.6B parameter UNet for high-resolution generation",
    type: "checkpoint", architecture: "sdxl", precision: "FP16", fileSize: "6.94 GB", fileSizeBytes: 6.94 * 1024 ** 3,
    vramFit: "green", downloads: "8.2M", likes: 12400, lastUpdated: "8 months ago", trending: false, pinned: false,
    tags: ["sdxl", "base-model", "1024px", "unet"],
    compatibleWith: ["ComfyUI", "SwarmUI", "Kohya"], downloadTarget: "checkpoints", licenseType: "open",
  },
  {
    id: "hf-11", repoId: "madebyollin/sdxl-vae-fp16-fix", name: "SDXL VAE (FP16 Fix)", author: "madebyollin",
    description: "Fixed FP16 VAE for SDXL — prevents NaN/black image outputs in half precision",
    type: "vae", architecture: "sdxl", precision: "FP16", fileSize: "335 MB", fileSizeBytes: 335 * 1024 ** 2,
    vramFit: "green", downloads: "3.1M", likes: 2890, lastUpdated: "6 months ago", trending: false, pinned: false,
    tags: ["vae", "sdxl", "fp16-fix", "essential"],
    compatibleWith: ["ComfyUI", "SwarmUI"], downloadTarget: "vae", licenseType: "open",
  },
  {
    id: "hf-12", repoId: "diffusers/controlnet-canny-sdxl-1.0", name: "ControlNet Canny SDXL", author: "diffusers",
    description: "Canny edge ControlNet for SDXL — precise structural guidance for generation",
    type: "controlnet", architecture: "sdxl", precision: "FP16", fileSize: "2.5 GB", fileSizeBytes: 2.5 * 1024 ** 3,
    vramFit: "green", downloads: "1.8M", likes: 1650, lastUpdated: "4 months ago", trending: false, pinned: false,
    tags: ["controlnet", "canny", "sdxl", "structure"],
    compatibleWith: ["ComfyUI", "SwarmUI"], downloadTarget: "controlnet", licenseType: "open",
  },

  // === Video Models ===
  {
    id: "hf-20", repoId: "Wan-AI/Wan2.1-T2V-14B", name: "Wan2.1 T2V 14B", author: "Wan-AI",
    description: "14 billion parameter text-to-video model — cinematic quality, long sequences",
    type: "checkpoint", architecture: "wan", precision: "BF16", fileSize: "28.3 GB", fileSizeBytes: 28.3 * 1024 ** 3,
    vramFit: "red", downloads: "340K", likes: 2100, lastUpdated: "1 week ago", trending: true, pinned: false,
    tags: ["video", "t2v", "14B", "cinematic"],
    compatibleWith: ["ComfyUI", "Musubi"], downloadTarget: "checkpoints", licenseType: "open",
  },
  {
    id: "hf-21", repoId: "Wan-AI/Wan2.1-I2V-14B-480P", name: "Wan2.1 I2V 14B", author: "Wan-AI",
    description: "Image-to-video model — animate still images into smooth video sequences",
    type: "checkpoint", architecture: "wan", precision: "BF16", fileSize: "28.3 GB", fileSizeBytes: 28.3 * 1024 ** 3,
    vramFit: "red", downloads: "280K", likes: 1850, lastUpdated: "1 week ago", trending: false, pinned: false,
    tags: ["video", "i2v", "14B", "animation"],
    compatibleWith: ["ComfyUI", "Musubi"], downloadTarget: "checkpoints", licenseType: "open",
  },
  {
    id: "hf-22", repoId: "Kijai/WanVideo_comfy", name: "Wan2.1 T2V 1.3B (Light)", author: "Wan-AI",
    description: "Lightweight 1.3B text-to-video model — fast generation, fits easily in VRAM",
    type: "checkpoint", architecture: "wan", precision: "BF16", fileSize: "2.6 GB", fileSizeBytes: 2.6 * 1024 ** 3,
    vramFit: "green", downloads: "520K", likes: 1200, lastUpdated: "2 weeks ago", trending: false, pinned: false,
    tags: ["video", "t2v", "1.3B", "fast", "low-vram"],
    compatibleWith: ["ComfyUI", "Musubi"], downloadTarget: "checkpoints", licenseType: "open",
  },
  {
    id: "hf-23", repoId: "tencent/HunyuanVideo", name: "HunyuanVideo", author: "Tencent",
    description: "13B video generation model with high temporal consistency and visual quality",
    type: "checkpoint", architecture: "hunyuan", precision: "BF16", fileSize: "25.4 GB", fileSizeBytes: 25.4 * 1024 ** 3,
    vramFit: "yellow", downloads: "190K", likes: 1560, lastUpdated: "3 weeks ago", trending: false, pinned: false,
    tags: ["video", "13B", "high-quality", "hunyuan"],
    compatibleWith: ["ComfyUI", "Musubi"], downloadTarget: "checkpoints", licenseType: "open",
  },

  // === Utility Models ===
  {
    id: "hf-30", repoId: "h94/IP-Adapter", name: "IP-Adapter SDXL", author: "h94",
    description: "Image prompt adapter for SDXL — use images as prompts for style/composition transfer",
    type: "ip-adapter", architecture: "sdxl", precision: "FP16", fileSize: "698 MB", fileSizeBytes: 698 * 1024 ** 2,
    vramFit: "green", downloads: "2.4M", likes: 3200, lastUpdated: "2 months ago", trending: false, pinned: false,
    tags: ["ip-adapter", "image-prompt", "style-transfer"],
    compatibleWith: ["ComfyUI", "SwarmUI"], downloadTarget: "ip-adapter", licenseType: "open",
  },
  {
    id: "hf-31", repoId: "openai/clip-vit-large-patch14", name: "CLIP ViT-L/14", author: "OpenAI",
    description: "CLIP text encoder — essential component for Stable Diffusion text understanding",
    type: "text-encoder", architecture: "other", precision: "FP32", fileSize: "1.71 GB", fileSizeBytes: 1.71 * 1024 ** 3,
    vramFit: "green", downloads: "15.2M", likes: 4200, lastUpdated: "1 year ago", trending: false, pinned: false,
    tags: ["clip", "text-encoder", "vision", "essential"],
    compatibleWith: ["ComfyUI", "SwarmUI", "Kohya"], downloadTarget: "clip", licenseType: "open",
  },
  {
    id: "hf-32", repoId: "stabilityai/stable-diffusion-3.5-large", name: "SD 3.5 Large", author: "Stability AI",
    description: "Stable Diffusion 3.5 Large — 8B MMDiT with improved text rendering and coherence",
    type: "checkpoint", architecture: "sd3", precision: "FP16", fileSize: "16.5 GB", fileSizeBytes: 16.5 * 1024 ** 3,
    vramFit: "green", downloads: "720K", likes: 3800, lastUpdated: "2 months ago", trending: false, pinned: false,
    tags: ["sd3.5", "mmdit", "text-rendering", "8B"],
    compatibleWith: ["ComfyUI", "SwarmUI"], downloadTarget: "checkpoints", licenseType: "gated",
  },
  {
    id: "hf-33", repoId: "Comfy-Org/flux1-dev-fp8", name: "FLUX.1-dev FP8", author: "Comfy-Org",
    description: "Official FP8 quantized FLUX.1-dev — half the VRAM, nearly identical quality",
    type: "checkpoint", architecture: "flux", precision: "FP8", fileSize: "11.9 GB", fileSizeBytes: 11.9 * 1024 ** 3,
    vramFit: "green", downloads: "1.6M", likes: 4800, lastUpdated: "1 month ago", trending: true, pinned: false,
    tags: ["flux", "fp8", "quantized", "official", "low-vram"],
    compatibleWith: ["ComfyUI", "SwarmUI"], downloadTarget: "checkpoints", licenseType: "open",
  },
  {
    id: "hf-34", repoId: "Kim2091/4xUltrasharp-V10", name: "4x UltraSharp V10", author: "Kim2091",
    description: "4x upscaler model — extremely sharp results, great for photo and illustration",
    type: "upscaler", architecture: "other", precision: "FP32", fileSize: "67 MB", fileSizeBytes: 67 * 1024 ** 2,
    vramFit: "green", downloads: "980K", likes: 2100, lastUpdated: "3 months ago", trending: false, pinned: false,
    tags: ["upscaler", "4x", "sharp", "esrgan"],
    compatibleWith: ["ComfyUI", "SwarmUI"], downloadTarget: "upscale_models", licenseType: "open",
  },
];