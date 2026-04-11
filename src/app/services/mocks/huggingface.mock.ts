// Mock data for HuggingFace service — extracted for readability

import type { HFModel } from "../huggingfaceService";

export const mockModels: HFModel[] = [
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