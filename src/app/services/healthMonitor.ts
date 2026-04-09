// ============================================================
// Health Monitor — single source of truth for tool health checks
// ============================================================
// Replaces THREE separate ping implementations that existed in:
//   • StatusBar.tsx     (pingTool)
//   • ServicesPanel.tsx (pingService)
//   • QuickLauncher.tsx (checkPortHealth)
//
// All consumers now subscribe to a shared React context instead
// of maintaining their own polling loops.
// ============================================================

import { TOOL_REGISTRY, ALL_TOOL_IDS, type ToolMeta } from "./toolsRegistry";

// ---- Types ----

export type HealthStatus = "running" | "stopped" | "checking";

export interface ToolHealthResult {
  id: string;
  meta: ToolMeta;
  status: HealthStatus;
  /** Round-trip time in ms (undefined when stopped/checking) */
  pingMs?: number;
  /** Extracted version string from the health response (e.g. "v0.3.12") */
  detectedVersion?: string;
  /** Rich info extracted from the health response (e.g. Python version, GPU) */
  liveInfo?: Record<string, string>;
  /** Timestamp of last check */
  lastChecked?: string;
}

// ---- Extractor configs per tool (rich data from health response) ----

interface Extractors {
  extractVersion?: (data: any) => string;
  extractInfo?: (data: any) => Record<string, string>;
}

const EXTRACTORS: Partial<Record<string, Extractors>> = {
  comfyui: {
    extractVersion: (data) =>
      data?.system?.comfyui_version ? `v${data.system.comfyui_version}` : "",
    extractInfo: (data) => {
      const info: Record<string, string> = {};
      if (data?.system?.python_version) info["Python"] = data.system.python_version;
      if (data?.system?.pytorch_version) info["PyTorch"] = data.system.pytorch_version;
      if (data?.devices?.[0]?.name) info["GPU"] = data.devices[0].name;
      if (data?.devices?.[0]?.vram_total)
        info["VRAM"] = `${(data.devices[0].vram_total / 1024 ** 3).toFixed(0)} GB`;
      if (data?.devices?.[0]?.vram_free)
        info["VRAM Free"] = `${(data.devices[0].vram_free / 1024 ** 3).toFixed(1)} GB`;
      return info;
    },
  },
  ollama: {
    extractInfo: (data) => {
      const info: Record<string, string> = {};
      if (data?.models) info["Models Loaded"] = `${data.models.length}`;
      return info;
    },
  },
};

// ---- Core ping function (browser-safe, covers all three old implementations) ----

export async function pingTool(meta: ToolMeta): Promise<ToolHealthResult> {
  if (meta.port === 0) {
    return { id: meta.id, meta, status: "stopped" };
  }

  const start = performance.now();

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), meta.healthTimeout);

    const opts: RequestInit = { signal: controller.signal };
    if (meta.healthMethod === "POST") {
      opts.method = "POST";
      opts.headers = { "Content-Type": "application/json" };
      opts.body = "{}";
    }

    const res = await fetch(meta.healthEndpoint, opts);
    clearTimeout(timeoutId);
    const pingMs = Math.round(performance.now() - start);
    const now = new Date().toLocaleTimeString();

    // Try to extract rich data
    const ext = EXTRACTORS[meta.id];
    let detectedVersion: string | undefined;
    let liveInfo: Record<string, string> | undefined;

    if (ext && (res.ok || res.type === "opaque")) {
      try {
        const data = await res.json();
        if (ext.extractVersion) {
          const v = ext.extractVersion(data);
          if (v) detectedVersion = v;
        }
        if (ext.extractInfo) {
          const info = ext.extractInfo(data);
          if (Object.keys(info).length > 0) liveInfo = info;
        }
      } catch {
        // JSON parse failed — service is still responding
      }
    }

    return {
      id: meta.id,
      meta,
      status: "running",
      pingMs,
      lastChecked: now,
      detectedVersion,
      liveInfo,
    };
  } catch {
    // Network error / timeout / abort → service not reachable
    return {
      id: meta.id,
      meta,
      status: "stopped",
      lastChecked: new Date().toLocaleTimeString(),
    };
  }
}

// ---- Ping all tools in parallel ----

export async function pingAllTools(): Promise<ToolHealthResult[]> {
  return Promise.all(ALL_TOOL_IDS.map((id) => pingTool(TOOL_REGISTRY[id])));
}

// ---- Poll interval constant (shared) ----

export const HEALTH_POLL_INTERVAL = 30_000;
