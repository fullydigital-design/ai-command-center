// ============================================================
// CivitAI Service — Abstraction layer for CivitAI API
// ============================================================
//
// RIGHT NOW:  Simulated data for UI prototype.
// MIGRATION:  Swap to FastAPI calls that proxy CivitAI v1 API.
//
// FastAPI endpoints this maps to:
//   GET    /api/civitai/models              → getModels()
//   GET    /api/civitai/models/trending     → getTrendingModels()
//   GET    /api/civitai/models/:id          → getModelDetails()
//   POST   /api/civitai/models/:id/download → downloadModel()
//   GET    /api/civitai/search              → searchModels()
//
// ─────────────────────────────────────────────────────────
// PYTHON BACKEND IMPLEMENTATION GUIDE
// ─────────────────────────────────────────────────────────
//
// CivitAI REST API v1:
//   Base URL: https://civitai.com/api/v1
//
//   # List models (paginated):
//   GET /models?limit=20&sort=Highest+Rated&types=Checkpoint&nsfw=false
//
//   # Get model by ID:
//   GET /models/{id}
//
//   # Get model version:
//   GET /model-versions/{id}
//
//   # Download:
//   GET /model-versions/{id}/download → redirect to file URL
//   (Can pass ?token=civitai_api_key for gated models)
//
// Response shape (simplified):
//   {
//     id, name, description, type,
//     stats: { downloadCount, favoriteCount, commentCount, rating, ratingCount },
//     creator: { username, image },
//     modelVersions: [{
//       id, name, baseModel, files: [{ name, sizeKB, metadata: { fp, size, format } }],
//       trainedWords: ["trigger1", "trigger2"],
//       images: [{ url, nsfw, width, height }]
//     }]
//   }
//
// Rate Limiting:
//   - No official rate limit docs, but recommended:
//     max 2 requests/second, cache for 15 minutes
//   - Use CivitAI API key for higher limits
//
// ============================================================

import type { DataSource } from "./types";
import { getApiKey, hasApiKey } from "./apiKeys";
import type { FetchMeta } from "./apiKeys";

// --- Environment detection (single source of truth: env.ts) ---
import { isTauriEnv, shouldTryBackend, getApiBase } from "./env";
import { fetchExternalAPI, fetchBackend } from "./fetchWithRetry";

// --- Live API cache ---
let civitLiveCache: { data: CivitModel[]; ts: number } | null = null;
const CIVIT_CACHE_TTL = 15 * 60 * 1000;
let civitLastFetchMeta: FetchMeta | null = null;

/** Get metadata about the last fetch for validation display. */
export function getCivitFetchMeta(): FetchMeta | null {
  return civitLastFetchMeta;
}

/** Clear cache to force a fresh API call. */
export function clearCivitCache(): void {
  civitLiveCache = null;
  civitLastFetchMeta = null;
}

/**
 * Fetch real models from CivitAI API v1.
 * Works without token (public API) or with token (higher rate limits).
 * Note: CivitAI may block browser CORS on some endpoints.
 */
async function fetchLiveCivitModels(): Promise<CivitModel[] | null> {
  const token = getApiKey("civitai");

  if (civitLiveCache && Date.now() - civitLiveCache.ts < CIVIT_CACHE_TTL) {
    civitLastFetchMeta = {
      source: "cache",
      fetchedAt: new Date(civitLiveCache.ts).toISOString(),
      itemCount: civitLiveCache.data.length,
      endpoint: "civitai.com/api/v1 (cached)",
    };
    return civitLiveCache.data;
  }

  // IMPORTANT: Do NOT set Content-Type or Authorization headers on GET requests.
  // Custom headers trigger a CORS preflight (OPTIONS) request that CivitAI's API
  // does not handle. Instead, pass the token as a query parameter and make a
  // "simple request" that bypasses CORS preflight entirely.

  try {
    const base = "https://civitai.com/api/v1/models";
    const tkParam = token ? `&token=${encodeURIComponent(token)}` : "";
    const searches = [
      `${base}?limit=10&sort=Highest%20Rated&nsfw=false${tkParam}`,
      `${base}?limit=10&sort=Most%20Downloaded&types=LORA&nsfw=false${tkParam}`,
      `${base}?limit=5&sort=Newest&types=Checkpoint&nsfw=false${tkParam}`,
    ];

    const results = await Promise.allSettled(
      searches.map((url) =>
        fetchExternalAPI(url)
          .then((r) => {
            if (!r.ok) {
              console.warn(`[CivitAI] HTTP ${r.status} for ${url.split("?")[0]}`);
              return { items: [] };
            }
            return r.json();
          })
      )
    );

    const models: CivitModel[] = [];
    const seen = new Set<string>();

    for (const result of results) {
      if (result.status !== "fulfilled") continue;
      const items = result.value.items || [];
      for (const m of items) {
        const id = String(m.id);
        if (seen.has(id)) continue;
        seen.add(id);
        models.push(mapCivitApiModel(m));
      }
    }

    if (models.length === 0) {
      civitLastFetchMeta = {
        source: "live-api",
        fetchedAt: new Date().toISOString(),
        itemCount: 0,
        endpoint: "civitai.com/api/v1",
        error: "No models returned — CORS blocked by browser. CivitAI blocks cross-origin requests; use Tauri backend for reliable access.",
      };
      return null;
    }

    civitLiveCache = { data: models, ts: Date.now() };
    civitLastFetchMeta = {
      source: "live-api",
      fetchedAt: new Date().toISOString(),
      itemCount: models.length,
      endpoint: "civitai.com/api/v1",
    };
    return models;
  } catch (e) {
    console.warn("[CivitAIService] Live API failed:", e);
    civitLastFetchMeta = {
      source: "live-api",
      fetchedAt: new Date().toISOString(),
      itemCount: 0,
      endpoint: "civitai.com/api/v1",
      error: `Fetch failed: ${String(e)}. CivitAI may block browser CORS — use Tauri backend for reliable access.`,
    };
    return null;
  }
}

// Preview color palette for models without images
const PREVIEW_COLORS = [
  "#6366F1", "#8B5CF6", "#EC4899", "#F43F5E", "#EF4444",
  "#F97316", "#EAB308", "#22C55E", "#14B8A6", "#06B6D4",
  "#3B82F6", "#A855F7", "#D946EF", "#F59E0B", "#10B981",
];

function inferCivitType(type: string): CivitModelType {
  const map: Record<string, CivitModelType> = {
    Checkpoint: "checkpoint", LORA: "lora", TextualInversion: "textual-inversion",
    Controlnet: "controlnet", Upscaler: "upscaler", VAE: "vae",
    Poses: "poses", Wildcards: "wildcards", Workflows: "workflows",
    LoCon: "lora", DoRA: "lora",
  };
  return map[type] || "checkpoint";
}

function inferCivitBaseModel(baseModel: string): CivitBaseModel {
  const lower = (baseModel || "").toLowerCase();
  if (lower.includes("flux")) return "flux";
  if (lower.includes("sdxl") || lower.includes("sd xl")) return "sdxl";
  if (lower.includes("pony")) return "pony";
  if (lower.includes("sd 1") || lower.includes("sd1")) return "sd15";
  if (lower.includes("sd 3") || lower.includes("sd3")) return "sd3";
  if (lower.includes("illustrious")) return "illustrious";
  if (lower.includes("hunyuan")) return "hunyuan";
  return "sdxl"; // default
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

function formatFileSize(kb: number): string {
  if (kb >= 1024 * 1024) return `${(kb / (1024 * 1024)).toFixed(2)} GB`;
  if (kb >= 1024) return `${(kb / 1024).toFixed(0)} MB`;
  return `${kb.toFixed(0)} KB`;
}

function mapCivitApiModel(m: any): CivitModel {
  const stats = m.stats || {};
  const type = inferCivitType(m.type || "Checkpoint");
  const latestVersion = m.modelVersions?.[0] || {};
  const baseModel = inferCivitBaseModel(latestVersion.baseModel || "");
  const files = latestVersion.files || [];
  const mainFile = files[0] || {};
  const triggerWords: string[] = latestVersion.trainedWords || [];
  const tags: string[] = (m.tags || []).slice(0, 6);
  const colorIndex = Math.abs(m.id) % PREVIEW_COLORS.length;

  const downloadTargets: Record<CivitModelType, string> = {
    checkpoint: "checkpoints", lora: "loras", "textual-inversion": "embeddings",
    controlnet: "controlnet", upscaler: "upscale_models", vae: "vae",
    poses: "poses", wildcards: "wildcards", workflows: "workflows",
  };

  return {
    id: String(m.id),
    name: m.name || "Unknown",
    type,
    baseModel,
    creator: m.creator?.username || "Unknown",
    description: (m.description || "").replace(/<[^>]*>/g, "").slice(0, 200) || `${type} model`,
    rating: stats.rating || 0,
    ratingCount: stats.ratingCount || 0,
    downloadCount: formatCount(stats.downloadCount || 0),
    favoriteCount: stats.favoriteCount || 0,
    buzzScore: stats.favoriteCount * 10 + (stats.downloadCount || 0),
    version: latestVersion.name || "v1.0",
    fileSize: mainFile.sizeKB ? formatFileSize(mainFile.sizeKB) : "Unknown",
    precision: mainFile.metadata?.fp || "fp16",
    triggerWords: triggerWords.slice(0, 5),
    tags,
    trending: (stats.downloadCount || 0) > 50000 || (stats.rating || 0) > 4.5,
    pinned: false,
    nsfw: m.nsfw || false,
    previewColor: PREVIEW_COLORS[colorIndex],
    lastUpdated: latestVersion.createdAt ? new Date(latestVersion.createdAt).toLocaleDateString() : "Unknown",
    downloadTarget: downloadTargets[type] || "checkpoints",
    updatedAtISO: latestVersion.createdAt || undefined,
  };
}

// --- Types ---

export type CivitModelType = "checkpoint" | "lora" | "textual-inversion" | "controlnet" | "upscaler" | "vae" | "poses" | "wildcards" | "workflows";
export type CivitBaseModel = "all" | "flux" | "sdxl" | "pony" | "sd15" | "sd3" | "illustrious" | "hunyuan";
export type CivitSortBy = "trending" | "most-downloaded" | "highest-rated" | "newest";

export interface CivitModel {
  id: string;
  name: string;
  type: CivitModelType;
  baseModel: CivitBaseModel;
  creator: string;
  description: string;
  rating: number;           // 1-5
  ratingCount: number;
  downloadCount: string;    // e.g. "245K"
  favoriteCount: number;
  buzzScore: number;        // CivitAI engagement metric
  version: string;          // Latest version name
  fileSize: string;         // e.g. "6.46 GB"
  precision: string;        // e.g. "fp16", "fp8"
  triggerWords: string[];   // For LoRAs
  tags: string[];
  trending: boolean;
  pinned: boolean;
  nsfw: boolean;
  previewColor: string;     // Placeholder color for preview thumbnail
  lastUpdated: string;
  downloadTarget: string;   // Target subfolder
  updatedAtISO?: string;    // ISO timestamp for exact date/time display
}

export interface CivitBaseModelDef {
  value: CivitBaseModel;
  label: string;
}

export interface CivitTypeDef {
  value: CivitModelType | "all";
  label: string;
}

// ============================================================
// PUBLIC API
// ============================================================

export function getCivitDataSource(): DataSource {
  if (isTauriEnv()) return "process";
  // CivitAI public API — try live, but CORS may block in browser
  return civitLastFetchMeta?.source === "live-api" || civitLastFetchMeta?.source === "cache"
    ? "nvidia"
    : hasApiKey("civitai")
      ? "nvidia"
      : "simulated";
}

export async function getCivitModels(): Promise<CivitModel[]> {
  if (shouldTryBackend()) {
    try {
      const res = await fetchBackend(`${getApiBase()}/civitai/models`);
      if (res.ok) return await res.json();
    } catch { /* fall through */ }
  }

  // Try live API with stored key
  const live = await fetchLiveCivitModels();
  if (live) return live;

  return [...mockModels];
}

export async function downloadCivitModel(modelId: string): Promise<boolean> {
  if (shouldTryBackend()) {
    try {
      const res = await fetchBackend(`${getApiBase()}/civitai/models/${modelId}/download`, {
        method: "POST",
      });
      return res.ok;
    } catch { return false; }
  }
  await new Promise((r) => setTimeout(r, 3000));
  return true;
}

export function getCivitModelUrl(modelId: string): string {
  return `https://civitai.com/models/${modelId}`;
}

export function getCivitBaseModels(): CivitBaseModelDef[] {
  return [
    { value: "all", label: "All" },
    { value: "flux", label: "FLUX" },
    { value: "sdxl", label: "SDXL" },
    { value: "pony", label: "Pony" },
    { value: "sd15", label: "SD 1.5" },
    { value: "illustrious", label: "Illustrious" },
    { value: "sd3", label: "SD3" },
    { value: "hunyuan", label: "Hunyuan" },
  ];
}

export function getCivitTypes(): CivitTypeDef[] {
  return [
    { value: "all", label: "All Types" },
    { value: "checkpoint", label: "Checkpoint" },
    { value: "lora", label: "LoRA" },
    { value: "textual-inversion", label: "Embedding" },
    { value: "controlnet", label: "ControlNet" },
    { value: "upscaler", label: "Upscaler" },
    { value: "workflows", label: "Workflow" },
  ];
}

// Star rating helper
export function renderStars(rating: number): string {
  const full = Math.floor(rating);
  const half = rating - full >= 0.5;
  return "★".repeat(full) + (half ? "½" : "") + "☆".repeat(5 - full - (half ? 1 : 0));
}

// --- Mock data ---

const mockModels: CivitModel[] = [
  // === FLUX Models ===
  {
    id: "cv-1", name: "Juggernaut XI FLUX", type: "checkpoint", baseModel: "flux",
    creator: "RunDiffusion", description: "Photorealistic FLUX checkpoint with exceptional detail, skin texture, and cinematic lighting",
    rating: 4.9, ratingCount: 2840, downloadCount: "189K", favoriteCount: 8920, buzzScore: 14200,
    version: "v11.0", fileSize: "23.8 GB", precision: "fp16", triggerWords: [],
    tags: ["photorealistic", "cinematic", "portrait", "flux"],
    trending: true, pinned: false, nsfw: false, previewColor: "#6366f1",
    lastUpdated: "3 days ago", downloadTarget: "checkpoints",
  },
  {
    id: "cv-2", name: "FLUX Realism LoRA", type: "lora", baseModel: "flux",
    creator: "XLabs-AI", description: "Enhances photorealism in FLUX generations — subtle detail boost without changing style",
    rating: 4.7, ratingCount: 1560, downloadCount: "312K", favoriteCount: 5400, buzzScore: 9800,
    version: "v2.0", fileSize: "352 MB", precision: "bf16", triggerWords: ["photorealistic", "detailed skin"],
    tags: ["realism", "enhancement", "photo", "flux"],
    trending: true, pinned: false, nsfw: false, previewColor: "#10b981",
    lastUpdated: "1 week ago", downloadTarget: "loras",
  },
  {
    id: "cv-3", name: "Hyper FLUX LoRA", type: "lora", baseModel: "flux",
    creator: "ByteDance", description: "Speed-up LoRA — reduce FLUX inference from 20 to 8 steps with minimal quality loss",
    rating: 4.5, ratingCount: 890, downloadCount: "178K", favoriteCount: 3200, buzzScore: 7600,
    version: "v1.1", fileSize: "186 MB", precision: "bf16", triggerWords: [],
    tags: ["speed", "optimization", "8-step", "flux"],
    trending: true, pinned: false, nsfw: false, previewColor: "#f59e0b",
    lastUpdated: "2 weeks ago", downloadTarget: "loras",
  },
  {
    id: "cv-4", name: "FLUX Detailer LoRA", type: "lora", baseModel: "flux",
    creator: "Shakker-Labs", description: "Adds fine-grained detail to FLUX outputs — hair, fabric, environment textures",
    rating: 4.6, ratingCount: 720, downloadCount: "95K", favoriteCount: 2100, buzzScore: 5400,
    version: "v1.0", fileSize: "240 MB", precision: "bf16", triggerWords: ["detailed", "high detail"],
    tags: ["detail", "texture", "enhancement", "flux"],
    trending: false, pinned: false, nsfw: false, previewColor: "#8b5cf6",
    lastUpdated: "1 week ago", downloadTarget: "loras",
  },

  // === SDXL Models ===
  {
    id: "cv-10", name: "Juggernaut XL", type: "checkpoint", baseModel: "sdxl",
    creator: "RunDiffusion", description: "Industry-leading photorealistic SDXL model — exceptional for portraits, landscapes, products",
    rating: 4.9, ratingCount: 8420, downloadCount: "1.2M", favoriteCount: 28400, buzzScore: 45000,
    version: "v10.0", fileSize: "6.94 GB", precision: "fp16", triggerWords: [],
    tags: ["photorealistic", "sdxl", "portrait", "cinematic"],
    trending: false, pinned: false, nsfw: false, previewColor: "#3b82f6",
    lastUpdated: "2 months ago", downloadTarget: "checkpoints",
  },
  {
    id: "cv-11", name: "DreamShaper XL", type: "checkpoint", baseModel: "sdxl",
    creator: "Lykon", description: "Versatile SDXL model excelling at both photorealism and illustration styles",
    rating: 4.8, ratingCount: 5640, downloadCount: "890K", favoriteCount: 19200, buzzScore: 32000,
    version: "v2.1", fileSize: "6.94 GB", precision: "fp16", triggerWords: [],
    tags: ["versatile", "illustration", "photo", "sdxl"],
    trending: false, pinned: false, nsfw: false, previewColor: "#ec4899",
    lastUpdated: "3 months ago", downloadTarget: "checkpoints",
  },
  {
    id: "cv-12", name: "Detail Tweaker XL", type: "lora", baseModel: "sdxl",
    creator: "Linaqruf", description: "Control detail level in SDXL — increase sharpness or add softness with weight adjustment",
    rating: 4.7, ratingCount: 3200, downloadCount: "520K", favoriteCount: 9800, buzzScore: 16000,
    version: "v1.0", fileSize: "24 MB", precision: "fp16", triggerWords: [],
    tags: ["detail", "sharpness", "control", "utility"],
    trending: false, pinned: false, nsfw: false, previewColor: "#14b8a6",
    lastUpdated: "4 months ago", downloadTarget: "loras",
  },
  {
    id: "cv-13", name: "Add More Details", type: "lora", baseModel: "sdxl",
    creator: "Aitrepreneur", description: "Simple detail enhancer — apply at 0.5-1.0 weight for subtle to dramatic detail boost",
    rating: 4.6, ratingCount: 4100, downloadCount: "680K", favoriteCount: 11200, buzzScore: 18000,
    version: "v1.0", fileSize: "12 MB", precision: "fp16", triggerWords: [],
    tags: ["detail", "enhancer", "simple", "universal"],
    trending: false, pinned: false, nsfw: false, previewColor: "#f97316",
    lastUpdated: "5 months ago", downloadTarget: "loras",
  },

  // === Pony Models ===
  {
    id: "cv-20", name: "Pony Diffusion V6 XL", type: "checkpoint", baseModel: "pony",
    creator: "PurpleSmartAI", description: "Versatile anime/illustration model trained on curated aesthetic dataset with score tags",
    rating: 4.8, ratingCount: 6200, downloadCount: "1.4M", favoriteCount: 24000, buzzScore: 38000,
    version: "v6.0", fileSize: "6.94 GB", precision: "fp16", triggerWords: ["score_9", "score_8_up", "score_7_up"],
    tags: ["anime", "illustration", "pony", "aesthetic"],
    trending: false, pinned: false, nsfw: false, previewColor: "#a855f7",
    lastUpdated: "1 month ago", downloadTarget: "checkpoints",
  },
  {
    id: "cv-21", name: "AutismMix Pony", type: "checkpoint", baseModel: "pony",
    creator: "CivitUser42", description: "Refined Pony merge with enhanced anatomy, hand quality, and color vibrancy",
    rating: 4.7, ratingCount: 2100, downloadCount: "340K", favoriteCount: 7600, buzzScore: 12000,
    version: "v4.0", fileSize: "6.94 GB", precision: "fp16", triggerWords: ["score_9", "score_8_up"],
    tags: ["anime", "merge", "hands", "vibrant"],
    trending: false, pinned: false, nsfw: false, previewColor: "#d946ef",
    lastUpdated: "3 weeks ago", downloadTarget: "checkpoints",
  },

  // === SD 1.5 (Legacy but popular) ===
  {
    id: "cv-30", name: "RealisticVision V6", type: "checkpoint", baseModel: "sd15",
    creator: "SG_161222", description: "Most popular photorealistic SD 1.5 model — exceptional portrait and landscape quality",
    rating: 4.8, ratingCount: 12400, downloadCount: "3.8M", favoriteCount: 42000, buzzScore: 65000,
    version: "v6.0-B1", fileSize: "2.13 GB", precision: "fp16", triggerWords: ["RAW photo"],
    tags: ["photorealistic", "portrait", "sd15", "legacy"],
    trending: false, pinned: false, nsfw: false, previewColor: "#06b6d4",
    lastUpdated: "6 months ago", downloadTarget: "checkpoints",
  },

  // === Embeddings ===
  {
    id: "cv-40", name: "EasyNegative", type: "textual-inversion", baseModel: "sd15",
    creator: "gsdf", description: "Universal negative embedding — use in negative prompt for better quality across all SD 1.5 models",
    rating: 4.9, ratingCount: 8900, downloadCount: "4.2M", favoriteCount: 35000, buzzScore: 52000,
    version: "v2.0", fileSize: "24 KB", precision: "fp32", triggerWords: ["EasyNegative"],
    tags: ["negative", "embedding", "essential", "universal"],
    trending: false, pinned: false, nsfw: false, previewColor: "#64748b",
    lastUpdated: "1 year ago", downloadTarget: "embeddings",
  },

  // === Illustrious ===
  {
    id: "cv-50", name: "NoobAI XL", type: "checkpoint", baseModel: "illustrious",
    creator: "Laxhar", description: "Illustrious-based anime model with excellent tag adherence and character consistency",
    rating: 4.7, ratingCount: 3400, downloadCount: "420K", favoriteCount: 9200, buzzScore: 15000,
    version: "v1.0", fileSize: "6.94 GB", precision: "fp16", triggerWords: [],
    tags: ["anime", "illustrious", "character", "tags"],
    trending: true, pinned: false, nsfw: false, previewColor: "#e11d48",
    lastUpdated: "2 weeks ago", downloadTarget: "checkpoints",
  },

  // === FLUX LoRAs (more) ===
  {
    id: "cv-60", name: "FLUX Film Grain", type: "lora", baseModel: "flux",
    creator: "davemane42", description: "Adds cinematic film grain and color grading — adjustable via LoRA weight",
    rating: 4.4, ratingCount: 420, downloadCount: "48K", favoriteCount: 1200, buzzScore: 3400,
    version: "v1.0", fileSize: "148 MB", precision: "bf16", triggerWords: ["film grain", "cinematic color"],
    tags: ["film", "grain", "cinematic", "color-grading"],
    trending: false, pinned: false, nsfw: false, previewColor: "#78716c",
    lastUpdated: "1 week ago", downloadTarget: "loras",
  },
  {
    id: "cv-61", name: "FLUX Anime Style", type: "lora", baseModel: "flux",
    creator: "InstantX", description: "Convert FLUX outputs to anime/illustration style while maintaining composition and details",
    rating: 4.5, ratingCount: 680, downloadCount: "72K", favoriteCount: 2400, buzzScore: 5200,
    version: "v1.2", fileSize: "220 MB", precision: "bf16", triggerWords: ["anime style", "illustration"],
    tags: ["anime", "style-transfer", "illustration", "flux"],
    trending: true, pinned: false, nsfw: false, previewColor: "#f43f5e",
    lastUpdated: "5 days ago", downloadTarget: "loras",
  },

  // === Workflows ===
  {
    id: "cv-70", name: "FLUX Ultimate Workflow", type: "workflows", baseModel: "flux",
    creator: "ComfyWorkflows", description: "Complete ComfyUI workflow for FLUX with upscaling, face detailer, and ControlNet",
    rating: 4.8, ratingCount: 560, downloadCount: "34K", favoriteCount: 1800, buzzScore: 4200,
    version: "v3.0", fileSize: "2 KB", precision: "-", triggerWords: [],
    tags: ["workflow", "comfyui", "complete", "flux"],
    trending: false, pinned: false, nsfw: false, previewColor: "#2563eb",
    lastUpdated: "1 week ago", downloadTarget: "workflows",
  },
];