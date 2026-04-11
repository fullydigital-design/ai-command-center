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
import { mockModels } from "./mocks/civitai.mock";

// --- Environment detection (single source of truth: env.ts) ---
import { isTauriEnv, shouldTryBackend, getApiBase } from "./env";
import { fetchExternalAPI, fetchBackend } from "./fetchWithRetry";
import { createService } from "./createService";

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

export const getCivitModels = createService<CivitModel[]>({
  backendPath: "/civitai/models",
  liveFetcher: () => fetchLiveCivitModels(),
  mockData: () => [...mockModels],
  label: "civitaiService.getCivitModels",
});

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

// --- Mock data (extracted to mocks/civitai.mock.ts) ---