// Mock data for CivitAI service — extracted for readability

import type { CivitModel } from "../civitaiService";

export const mockModels: CivitModel[] = [
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