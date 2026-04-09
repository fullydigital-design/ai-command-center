// ============================================================
// Tools Registry — Single source of truth for AI tool metadata
// ============================================================
// Shared by: QuickLauncher, ServicesPanel, Training Page, Layout
//
// This file contains ONLY the shared identity + network config
// for each tool. Feature-specific data (launch flags, presets,
// service runtime state) stays in the owning component/service.
//
// Usage:
//   import { TOOL_REGISTRY, getToolById, ALL_TOOL_IDS } from "../services/toolsRegistry";
// ============================================================

export interface ToolMeta {
  /** Unique identifier used across all features */
  id: string;
  /** Display name */
  name: string;
  /** Short description */
  description: string;
  /** Default HTTP port (0 = no web UI) */
  port: number;
  /** Localhost URL for the web UI */
  url: string;
  /** Default installation path (Windows) */
  defaultPath: string;
  /** Accent color hex */
  color: string;
  /** Emoji icon (for lightweight rendering without lucide imports) */
  emoji: string;
  /** Tool category */
  category: "generation" | "training" | "utility";
  /** Health check endpoint (absolute URL to ping) */
  healthEndpoint: string;
  /** Health check HTTP method */
  healthMethod: "GET" | "POST" | "HEAD";
  /** Health check timeout ms */
  healthTimeout: number;
}

// ============================================================
// Registry — the canonical list
// ============================================================

export const TOOL_REGISTRY: Record<string, ToolMeta> = {
  comfyui: {
    id: "comfyui",
    name: "ComfyUI",
    description: "Node-based workflow editor for Stable Diffusion and FLUX models",
    port: 8188,
    url: "http://localhost:8188",
    defaultPath: "C:\\_AI\\_test_fresh_all_AI\\ComfyUI",
    color: "#6d5aff",
    emoji: "\uD83C\uDFA8",
    category: "generation",
    healthEndpoint: "http://localhost:8188/system_stats",
    healthMethod: "GET",
    healthTimeout: 3000,
  },
  swarmui: {
    id: "swarmui",
    name: "SwarmUI",
    description: "User-friendly web interface for AI image/video generation with queuing",
    port: 7801,
    url: "http://localhost:7801",
    defaultPath: "C:\\_AI\\_test_fresh_all_AI\\SwarmUI",
    color: "#00d4aa",
    emoji: "\uD83D\uDC1D",
    category: "generation",
    healthEndpoint: "http://localhost:7801/API/GetNewSession",
    healthMethod: "POST",
    healthTimeout: 3000,
  },
  kohya: {
    id: "kohya",
    name: "Kohya SS",
    description: "Training interface for LoRA, DreamBooth and fine-tuning with advanced options",
    port: 7860,
    url: "http://localhost:7860",
    defaultPath: "C:\\_AI\\_test_fresh_all_AI\\kohya_ss",
    color: "#ff6b6b",
    emoji: "\uD83D\uDD2C",
    category: "training",
    healthEndpoint: "http://localhost:7860/info",
    healthMethod: "GET",
    healthTimeout: 3000,
  },
  musubi: {
    id: "musubi",
    name: "Musubi Tuner",
    description: "Video model fine-tuning toolkit for Wan, HunyuanVideo and other video models",
    port: 7870,
    url: "http://localhost:7870",
    defaultPath: "C:\\_AI\\_test_fresh_all_AI\\musubi-tuner",
    color: "#ffd93d",
    emoji: "\uD83C\uDFAC",
    category: "training",
    healthEndpoint: "http://localhost:7870/info",
    healthMethod: "GET",
    healthTimeout: 3000,
  },
  ollama: {
    id: "ollama",
    name: "Ollama",
    description: "Local LLM server for running language models - powers AI assistant features",
    port: 11434,
    url: "http://localhost:11434",
    defaultPath: "System (global install)",
    color: "#4ecdc4",
    emoji: "\uD83E\uDD99",
    category: "utility",
    healthEndpoint: "http://localhost:11434/api/tags",
    healthMethod: "GET",
    healthTimeout: 3000,
  },
  tensorboard: {
    id: "tensorboard",
    name: "TensorBoard",
    description: "Training visualization dashboard for monitoring loss curves and metrics",
    port: 6006,
    url: "http://localhost:6006",
    defaultPath: "System (pip install)",
    color: "#ff9f43",
    emoji: "\uD83D\uDCCA",
    category: "utility",
    healthEndpoint: "http://localhost:6006/data/runs",
    healthMethod: "GET",
    healthTimeout: 3000,
  },
};

// ============================================================
// Helpers
// ============================================================

/** All tool IDs in registry order */
export const ALL_TOOL_IDS = Object.keys(TOOL_REGISTRY);

/** Get a tool by ID (undefined if not found) */
export function getToolById(id: string): ToolMeta | undefined {
  return TOOL_REGISTRY[id];
}

/** Get tools filtered by category */
export function getToolsByCategory(category: ToolMeta["category"]): ToolMeta[] {
  return Object.values(TOOL_REGISTRY).filter((t) => t.category === category);
}

/** Launchable tools — the 4 that QuickLauncher supports */
export const LAUNCHABLE_TOOL_IDS = ["comfyui", "swarmui", "kohya", "musubi"] as const;
export type LaunchableToolId = (typeof LAUNCHABLE_TOOL_IDS)[number];

/** Get only launchable tools */
export function getLaunchableTools(): ToolMeta[] {
  return LAUNCHABLE_TOOL_IDS.map((id) => TOOL_REGISTRY[id]);
}
