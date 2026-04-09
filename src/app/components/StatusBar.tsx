// ============================================================
// Global Status Bar — always visible at the bottom of Layout
// ============================================================
// Shows: running tools · VRAM usage · active training jobs
// Now consumes the shared HealthMonitorProvider (Phase 5)
// instead of maintaining its own polling loop.
// ============================================================

import { useState, useEffect, useCallback, useRef } from "react";
import { Cpu, Activity, Circle, MonitorIcon, Flame } from "lucide-react";
import { getGPUStats, type GPUStats } from "../services/systemService";
import { getTrainingJobs } from "../services/trainingService";
import type { TrainingJob } from "../services/types";
import { isTauriEnv } from "../services/env";
import { useHealthMonitor } from "../hooks/useHealthMonitor";
import { ALL_TOOL_IDS } from "../services/toolsRegistry";
import { HEALTH_POLL_INTERVAL } from "../services/healthMonitor";

// ---- Component ----

export function StatusBar() {
  // ── Health data from shared context (no private polling) ──
  const { results } = useHealthMonitor();
  const tools = ALL_TOOL_IDS.map((id) => results[id]);

  // ── GPU + training still fetched here (they're StatusBar-specific) ──
  const [gpu, setGpu] = useState<GPUStats | null>(null);
  const [trainingCount, setTrainingCount] = useState(0);
  const [activeTrainingName, setActiveTrainingName] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const refreshExtras = useCallback(async () => {
    try {
      const gpuData = await getGPUStats();
      if (mountedRef.current) setGpu(gpuData);
    } catch { /* ignore */ }

    try {
      const jobs: TrainingJob[] = await getTrainingJobs();
      const running = jobs.filter((j) => j.status === "running");
      if (mountedRef.current) {
        setTrainingCount(running.length);
        setActiveTrainingName(running.length > 0 ? running[0].name : null);
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    refreshExtras();
    const id = setInterval(refreshExtras, HEALTH_POLL_INTERVAL);
    return () => {
      mountedRef.current = false;
      clearInterval(id);
    };
  }, [refreshExtras]);

  // ---- Derived ----
  const runningCount = tools.filter((t) => t.status === "running").length;
  const dataTier = isTauriEnv() ? "Tauri" : "Browser";
  const vramPct = gpu ? gpu.vramPercent : 0;
  const vramLabel = gpu ? `${gpu.vramUsedGB.toFixed(1)}/${gpu.vramTotalGB}GB` : "--";

  // VRAM bar color
  const vramColor =
    vramPct > 90 ? "#ef4444" : vramPct > 70 ? "#ffd93d" : "#00d4aa";

  return (
    <div
      className="h-[32px] shrink-0 flex items-center px-3 gap-4 border-t text-[11px] select-none"
      style={{
        background: "var(--sidebar)",
        borderColor: "var(--sidebar-border)",
        color: "var(--muted-foreground)",
        fontFamily: "'JetBrains Mono', monospace",
      }}
    >
      {/* ── Data source tier ── */}
      <span className="flex items-center gap-1.5 opacity-70">
        <MonitorIcon className="w-3 h-3" />
        {dataTier}
      </span>

      <Divider />

      {/* ── Running tools ── */}
      <span className="flex items-center gap-1.5">
        <Activity className="w-3 h-3" />
        <span className="mr-1">{runningCount} running</span>
        <span className="flex items-center gap-1">
          {tools.map((t) => (
            <span
              key={t.id}
              title={`${t.meta.name}: ${t.status}`}
              className="relative group cursor-default"
            >
              <Circle
                className="w-[7px] h-[7px]"
                fill={
                  t.status === "running"
                    ? t.meta.color
                    : t.status === "checking"
                    ? "#555"
                    : "transparent"
                }
                stroke={
                  t.status === "stopped" ? "#444" : "transparent"
                }
                strokeWidth={1.5}
              />
              {/* Tooltip */}
              <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-1.5 py-0.5 rounded bg-popover text-popover-foreground text-[10px] whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none border border-border z-50">
                {t.meta.emoji} {t.meta.name}
              </span>
            </span>
          ))}
        </span>
      </span>

      <Divider />

      {/* ── VRAM ── */}
      <span className="flex items-center gap-1.5">
        <Cpu className="w-3 h-3" />
        <span>VRAM</span>
        <span
          className="w-[60px] h-[6px] rounded-full overflow-hidden"
          style={{ background: "var(--secondary)" }}
        >
          <span
            className="block h-full rounded-full transition-all duration-700"
            style={{ width: `${vramPct}%`, background: vramColor }}
          />
        </span>
        <span style={{ color: vramColor }}>{vramLabel}</span>
      </span>

      <Divider />

      {/* ── Training ── */}
      <span className="flex items-center gap-1.5">
        <Flame
          className="w-3 h-3"
          style={{ color: trainingCount > 0 ? "#ffd93d" : undefined }}
        />
        {trainingCount > 0 ? (
          <span>
            <span style={{ color: "#ffd93d" }}>{trainingCount}</span>
            {" training"}
            {activeTrainingName && (
              <span className="ml-1 opacity-60 max-w-[140px] truncate inline-block align-bottom">
                — {activeTrainingName}
              </span>
            )}
          </span>
        ) : (
          <span>No training</span>
        )}
      </span>

      {/* Right-align spacer */}
      <span className="flex-1" />

      {/* ── GPU temp ── */}
      {gpu && (
        <span className="flex items-center gap-1 opacity-60">
          {gpu.tempC}°C · {gpu.powerW}W
        </span>
      )}
    </div>
  );
}

// ---- Tiny divider ----
function Divider() {
  return (
    <span
      className="w-px h-3.5 shrink-0"
      style={{ background: "var(--sidebar-border)" }}
    />
  );
}
