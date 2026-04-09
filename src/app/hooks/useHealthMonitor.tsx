// ============================================================
// useHealthMonitor — shared React context for tool health state
// ============================================================
// Single polling loop replaces 3 separate ones.
// Consumers: StatusBar, ServicesPanel, QuickLauncher
// ============================================================

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import {
  pingAllTools,
  pingTool,
  HEALTH_POLL_INTERVAL,
  type ToolHealthResult,
  type HealthStatus,
} from "../services/healthMonitor";
import { TOOL_REGISTRY, ALL_TOOL_IDS } from "../services/toolsRegistry";

// ---- Context shape ----

interface HealthMonitorCtx {
  /** Per-tool health results keyed by tool id */
  results: Record<string, ToolHealthResult>;
  /** Whether a global scan is in progress */
  scanning: boolean;
  /** Trigger a full re-scan immediately */
  refreshAll: () => Promise<void>;
  /** Trigger a single-tool re-check */
  refreshTool: (toolId: string) => Promise<ToolHealthResult | undefined>;
  /** Timestamp string of the last completed scan */
  lastScanTime: string | null;
}

const Ctx = createContext<HealthMonitorCtx | null>(null);

// ---- Provider ----

export function HealthMonitorProvider({ children }: { children: ReactNode }) {
  const [results, setResults] = useState<Record<string, ToolHealthResult>>(() => {
    const init: Record<string, ToolHealthResult> = {};
    for (const id of ALL_TOOL_IDS) {
      init[id] = { id, meta: TOOL_REGISTRY[id], status: "checking" };
    }
    return init;
  });
  const [scanning, setScanning] = useState(false);
  const [lastScanTime, setLastScanTime] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const refreshAll = useCallback(async () => {
    setScanning(true);
    const all = await pingAllTools();
    if (mountedRef.current) {
      const map: Record<string, ToolHealthResult> = {};
      for (const r of all) map[r.id] = r;
      setResults(map);
      setLastScanTime(new Date().toLocaleTimeString());
      setScanning(false);
    }
  }, []);

  const refreshTool = useCallback(async (toolId: string) => {
    const meta = TOOL_REGISTRY[toolId];
    if (!meta) return undefined;
    const result = await pingTool(meta);
    if (mountedRef.current) {
      setResults((prev) => ({ ...prev, [toolId]: result }));
    }
    return result;
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    refreshAll();
    const id = setInterval(refreshAll, HEALTH_POLL_INTERVAL);
    return () => {
      mountedRef.current = false;
      clearInterval(id);
    };
  }, [refreshAll]);

  return (
    <Ctx.Provider value={{ results, scanning, refreshAll, refreshTool, lastScanTime }}>
      {children}
    </Ctx.Provider>
  );
}

// ---- Hook ----

export function useHealthMonitor(): HealthMonitorCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useHealthMonitor must be used inside <HealthMonitorProvider>");
  return ctx;
}

// Re-export types for convenience
export type { ToolHealthResult, HealthStatus };
