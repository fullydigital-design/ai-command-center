import { useState, useEffect, useCallback } from "react";
import {
  Play,
  Square,
  ExternalLink,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Globe,
  Terminal,
  Clock,
  Loader2,
  AlertTriangle,
  Plug,
  FolderOpen,
  Download,
  ArrowUpCircle,
  Radio,
  CircleDot,
  Wifi,
  Info,
  Zap,
  Activity,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { runSetupAction } from "../services/setupService";
import type { SetupAction, TerminalLine } from "../services/setupService";
import { TerminalOutput } from "./ui/TerminalOutput";
import { isTauriEnv } from "../services/env";
import { TOOL_REGISTRY } from "../services/toolsRegistry";
import { useHealthMonitor } from "../hooks/useHealthMonitor";

// ============================================================
// Service Detection Layer
// ============================================================
// Each service has a known health-check URL that we can ping
// directly from the browser. These are localhost services, so
// CORS is typically not an issue (or they have permissive CORS).
//
// Priority chain:
//   1. Tauri backend -> full process management (start/stop/install)
//   2. Browser HTTP ping -> read-only status detection (works NOW)
//   3. Mock data -> fallback for UI development
// ============================================================

type ServiceStatus = "running" | "stopped" | "starting" | "error";
type DetectionSource = "live" | "tauri" | "simulated";

interface HealthCheck {
  endpoint: string;
  method?: string;
  timeout: number;
  successCheck?: (res: Response) => boolean;
  extractVersion?: (data: any) => string;
  extractInfo?: (data: any) => Record<string, string>;
}

interface ServiceItem {
  id: string;
  name: string;
  description: string;
  status: ServiceStatus;
  detectedStatus?: ServiceStatus;
  detectionSource: DetectionSource;
  port: number;
  url: string;
  version: string;
  detectedVersion?: string;
  uptime: string;
  memoryUsage: string;
  icon: string;
  category: "generation" | "training" | "utility";
  autoStart: boolean;
  lastUpdate: string;
  installPath: string;
  customNodes?: number;
  setupAction?: SetupAction;
  installed?: boolean;
  healthCheck: HealthCheck;
  liveInfo?: Record<string, string>;
  lastPingMs?: number;
  lastChecked?: string;
}

interface ApiEndpoint {
  name: string;
  url: string;
  method: string;
  serviceId: string;
  status: "active" | "inactive" | "checking";
  responseTime?: number;
}

// --- Health check configs per service ---
// Ports and endpoints sourced from TOOL_REGISTRY (single source of truth)
const healthChecks: Record<string, HealthCheck> = {
  comfyui: {
    endpoint: `http://localhost:${TOOL_REGISTRY.comfyui.port}/system_stats`,
    timeout: TOOL_REGISTRY.comfyui.healthTimeout,
    extractVersion: (data) => {
      if (data?.system?.comfyui_version) return `v${data.system.comfyui_version}`;
      return "";
    },
    extractInfo: (data) => {
      const info: Record<string, string> = {};
      if (data?.system?.python_version) info["Python"] = data.system.python_version;
      if (data?.system?.pytorch_version) info["PyTorch"] = data.system.pytorch_version;
      if (data?.devices?.[0]?.name) info["GPU"] = data.devices[0].name;
      if (data?.devices?.[0]?.vram_total) info["VRAM"] = `${(data.devices[0].vram_total / (1024 ** 3)).toFixed(0)} GB`;
      if (data?.devices?.[0]?.vram_free) info["VRAM Free"] = `${(data.devices[0].vram_free / (1024 ** 3)).toFixed(1)} GB`;
      return info;
    },
  },
  swarmui: {
    endpoint: `http://localhost:${TOOL_REGISTRY.swarmui.port}/API/GetNewSession`,
    method: "POST",
    timeout: TOOL_REGISTRY.swarmui.healthTimeout,
  },
  kohya: {
    endpoint: `http://localhost:${TOOL_REGISTRY.kohya.port}/info`,
    timeout: TOOL_REGISTRY.kohya.healthTimeout,
  },
  musubi: {
    endpoint: `http://localhost:${TOOL_REGISTRY.musubi.port}/info`,
    timeout: TOOL_REGISTRY.musubi.healthTimeout,
  },
  ollama: {
    endpoint: `http://localhost:${TOOL_REGISTRY.ollama.port}/api/tags`,
    timeout: TOOL_REGISTRY.ollama.healthTimeout,
    extractVersion: () => "",
    extractInfo: (data) => {
      const info: Record<string, string> = {};
      if (data?.models) info["Models Loaded"] = `${data.models.length}`;
      return info;
    },
  },
  tensorboard: {
    endpoint: `http://localhost:${TOOL_REGISTRY.tensorboard.port}/data/runs`,
    timeout: TOOL_REGISTRY.tensorboard.healthTimeout,
  },
};

// --- Initial service data (shared fields sourced from TOOL_REGISTRY) ---
const initialServices: ServiceItem[] = [
  {
    id: "comfyui",
    name: TOOL_REGISTRY.comfyui.name,
    description: TOOL_REGISTRY.comfyui.description,
    status: "stopped",
    detectionSource: "simulated",
    port: TOOL_REGISTRY.comfyui.port,
    url: TOOL_REGISTRY.comfyui.url,
    version: "v0.3.12",
    uptime: "-",
    memoryUsage: "-",
    icon: TOOL_REGISTRY.comfyui.emoji,
    category: TOOL_REGISTRY.comfyui.category,
    autoStart: true,
    lastUpdate: "2 days ago",
    installPath: TOOL_REGISTRY.comfyui.defaultPath,
    customNodes: 47,
    setupAction: "comfyui",
    installed: true,
    healthCheck: healthChecks.comfyui,
  },
  {
    id: "swarmui",
    name: TOOL_REGISTRY.swarmui.name,
    description: TOOL_REGISTRY.swarmui.description,
    status: "stopped",
    detectionSource: "simulated",
    port: TOOL_REGISTRY.swarmui.port,
    url: TOOL_REGISTRY.swarmui.url,
    version: "v0.9.4",
    uptime: "-",
    memoryUsage: "-",
    icon: TOOL_REGISTRY.swarmui.emoji,
    category: TOOL_REGISTRY.swarmui.category,
    autoStart: false,
    lastUpdate: "1 week ago",
    installPath: TOOL_REGISTRY.swarmui.defaultPath,
    setupAction: "swarmui",
    installed: true,
    healthCheck: healthChecks.swarmui,
  },
  {
    id: "kohya",
    name: TOOL_REGISTRY.kohya.name + " GUI",
    description: TOOL_REGISTRY.kohya.description,
    status: "stopped",
    detectionSource: "simulated",
    port: TOOL_REGISTRY.kohya.port,
    url: TOOL_REGISTRY.kohya.url,
    version: "v24.1.7",
    uptime: "-",
    memoryUsage: "-",
    icon: TOOL_REGISTRY.kohya.emoji,
    category: TOOL_REGISTRY.kohya.category,
    autoStart: false,
    lastUpdate: "3 days ago",
    installPath: TOOL_REGISTRY.kohya.defaultPath,
    setupAction: "kohya",
    installed: true,
    healthCheck: healthChecks.kohya,
  },
  {
    id: "musubi",
    name: TOOL_REGISTRY.musubi.name,
    description: TOOL_REGISTRY.musubi.description,
    status: "stopped",
    detectionSource: "simulated",
    port: TOOL_REGISTRY.musubi.port,
    url: TOOL_REGISTRY.musubi.url,
    version: "v1.2.0",
    uptime: "-",
    memoryUsage: "-",
    icon: TOOL_REGISTRY.musubi.emoji,
    category: TOOL_REGISTRY.musubi.category,
    autoStart: false,
    lastUpdate: "5 days ago",
    installPath: TOOL_REGISTRY.musubi.defaultPath,
    setupAction: "musubi",
    installed: true,
    healthCheck: healthChecks.musubi,
  },
  {
    id: "ollama",
    name: TOOL_REGISTRY.ollama.name,
    description: TOOL_REGISTRY.ollama.description,
    status: "stopped",
    detectionSource: "simulated",
    port: TOOL_REGISTRY.ollama.port,
    url: TOOL_REGISTRY.ollama.url,
    version: "v0.5.4",
    uptime: "-",
    memoryUsage: "-",
    icon: TOOL_REGISTRY.ollama.emoji,
    category: TOOL_REGISTRY.ollama.category,
    autoStart: true,
    lastUpdate: "1 day ago",
    installPath: TOOL_REGISTRY.ollama.defaultPath,
    installed: true,
    healthCheck: healthChecks.ollama,
  },
];

const initialEndpoints: ApiEndpoint[] = [
  { name: "ComfyUI API", url: `localhost:${TOOL_REGISTRY.comfyui.port}/api`, method: "POST /prompt", serviceId: "comfyui", status: "checking" },
  { name: "ComfyUI WS", url: `localhost:${TOOL_REGISTRY.comfyui.port}/ws`, method: "WebSocket", serviceId: "comfyui", status: "checking" },
  { name: "SwarmUI API", url: `localhost:${TOOL_REGISTRY.swarmui.port}/API`, method: "POST /GenerateText2Image", serviceId: "swarmui", status: "checking" },
  { name: "Ollama API", url: `localhost:${TOOL_REGISTRY.ollama.port}/api`, method: "POST /generate", serviceId: "ollama", status: "checking" },
  { name: "Ollama Models", url: `localhost:${TOOL_REGISTRY.ollama.port}/api/tags`, method: "GET", serviceId: "ollama", status: "checking" },
  { name: "TensorBoard", url: `localhost:${TOOL_REGISTRY.tensorboard.port}/data/runs`, method: "GET", serviceId: "tensorboard", status: "checking" },
];

// ============================================================
// ServicesPanel — embeddable panel for Command Center Services tab
// ============================================================

export function ServicesPanel() {
  const [services, setServices] = useState(initialServices);
  const [endpoints, setEndpoints] = useState(initialEndpoints);
  const [filter, setFilter] = useState<"all" | "generation" | "training" | "utility">("all");
  const [terminalLines, setTerminalLines] = useState<TerminalLine[]>([]);
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [terminalTitle, setTerminalTitle] = useState("Terminal");
  const [expandedService, setExpandedService] = useState<string | null>(null);
  const hasTauri = isTauriEnv();

  // ── Shared health context (replaces private ping/scan/polling) ──
  const health = useHealthMonitor();
  const scanning = health.scanning;
  const lastScanTime = health.lastScanTime;

  // Merge shared health results into local service state + endpoints
  useEffect(() => {
    setServices((prev) =>
      prev.map((svc) => {
        const hr = health.results[svc.id];
        if (!hr) return svc;
        const isRunning = hr.status === "running";
        return {
          ...svc,
          status: (hr.status === "checking" ? svc.status : hr.status) as ServiceStatus,
          detectedStatus: isRunning ? "running" : "stopped",
          detectionSource: hr.status === "checking" ? svc.detectionSource : "live",
          lastPingMs: hr.pingMs,
          lastChecked: hr.lastChecked,
          ...(hr.detectedVersion ? { detectedVersion: hr.detectedVersion } : {}),
          ...(hr.liveInfo ? { liveInfo: hr.liveInfo } : {}),
        };
      })
    );

    setEndpoints((prev) =>
      prev.map((ep) => {
        const hr = health.results[ep.serviceId];
        if (!hr) return { ...ep, status: "inactive" as const };
        if (hr.status === "checking") return { ...ep, status: "checking" as const };
        return {
          ...ep,
          status: hr.status === "running" ? ("active" as const) : ("inactive" as const),
          responseTime: hr.pingMs,
        };
      })
    );
  }, [health.results]);

  // "Refresh Status" button uses shared context's refreshAll
  const scanAllServices = useCallback(async () => {
    await health.refreshAll();
  }, [health]);

  const toggleService = (id: string) => {
    if (!hasTauri) return;

    setServices((prev) =>
      prev.map((s) => {
        if (s.id !== id) return s;
        if (s.status === "running") return { ...s, status: "stopped" as ServiceStatus, uptime: "-", memoryUsage: "-" };
        return { ...s, status: "starting" as ServiceStatus };
      })
    );

    setTimeout(() => {
      setServices((prev) =>
        prev.map((s) =>
          s.id === id && s.status === "starting"
            ? { ...s, status: "running" as ServiceStatus, uptime: "0m", memoryUsage: "Starting..." }
            : s
        )
      );
    }, 2000);
  };

  const toggleAutoStart = (id: string) => {
    setServices((prev) => prev.map((s) => (s.id === id ? { ...s, autoStart: !s.autoStart } : s)));
  };

  const handleSetupAction = async (action: SetupAction, label: string) => {
    setTerminalTitle(`Setup \u2014 ${label}`);
    setTerminalOpen(true);
    setTerminalLines([]);
    const task = await runSetupAction(action);
    setTerminalLines(task.lines);
  };

  const filtered = services.filter((s) => filter === "all" || s.category === filter);
  const liveCount = services.filter((s) => s.detectionSource === "live" && s.status === "running").length;
  const totalRunning = services.filter((s) => s.status === "running").length;

  return (
    <div className="space-y-6">
      {/* Action Bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => handleSetupAction("update-all", "Update ALL")}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-xs hover:bg-primary/20 transition-colors"
          >
            <ArrowUpCircle className="w-3.5 h-3.5" /> Update All
          </button>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-chart-2/10 border border-chart-2/20">
            <span className="w-2 h-2 rounded-full bg-chart-2" />
            <span className="text-xs text-chart-2">{totalRunning} running</span>
          </div>
        </div>
        <button
          onClick={scanAllServices}
          disabled={scanning}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-secondary text-foreground text-xs hover:bg-secondary/80 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${scanning ? "animate-spin" : ""}`} /> Refresh Status
        </button>
      </div>

      {/* Connection Status Banner */}
      <div className={`flex items-start gap-3 px-4 py-3 rounded-xl border ${
        hasTauri
          ? "bg-chart-2/5 border-chart-2/15"
          : liveCount > 0
          ? "bg-chart-2/5 border-chart-2/15"
          : "bg-primary/5 border-primary/15"
      }`}>
        {hasTauri ? (
          <Wifi className="w-4 h-4 text-chart-2 mt-0.5 shrink-0" />
        ) : liveCount > 0 ? (
          <Activity className="w-4 h-4 text-chart-2 mt-0.5 shrink-0" />
        ) : (
          <Info className="w-4 h-4 text-primary mt-0.5 shrink-0" />
        )}
        <div className="flex-1">
          {hasTauri ? (
            <>
              <div className="text-xs text-foreground">Backend Connected — Full Service Management</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                Start, stop, install, and update services directly. Process management via FastAPI backend.
              </div>
            </>
          ) : liveCount > 0 ? (
            <>
              <div className="text-xs text-foreground">
                <span className="text-chart-2">{liveCount} service{liveCount !== 1 ? "s" : ""} detected live</span> via HTTP health checks
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">
                Services running on your machine are detected automatically by pinging localhost ports.
                {" "}<span className="text-foreground">Start/Stop requires the Tauri backend</span> — for now, launch services from their own terminals.
                {lastScanTime && <span className="text-muted-foreground/60"> Last scan: {lastScanTime}</span>}
              </div>
            </>
          ) : (
            <>
              <div className="text-xs text-foreground">Browser Detection Mode — No services detected</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                No local services were found on expected ports. Start ComfyUI, SwarmUI, or Ollama manually and click "Refresh Status" to detect them.
                {" "}Start/Stop buttons require the Tauri backend.
              </div>
            </>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {services.map((svc) => (
            <div
              key={svc.id}
              className={`w-2.5 h-2.5 rounded-full transition-colors ${
                svc.status === "running" && svc.detectionSource === "live"
                  ? "bg-chart-2"
                  : svc.status === "running"
                  ? "bg-chart-4"
                  : "bg-muted-foreground/20"
              }`}
              title={`${svc.name}: ${svc.status}${svc.detectionSource === "live" ? " (live)" : ""}`}
            />
          ))}
        </div>
      </div>

      {/* Filter */}
      <div className="flex gap-1 bg-card border border-border rounded-lg p-1 w-fit">
        {(["all", "generation", "training", "utility"] as const).map((f) => {
          const runCount = f === "all" ? totalRunning : services.filter((s) => s.category === f && s.status === "running").length;
          return (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-md text-xs capitalize transition-colors ${
                filter === f ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {f}
              {runCount > 0 && (
                <span className="ml-1.5 px-1 py-0.5 rounded-full bg-chart-2/20 text-chart-2 text-[9px]">{runCount}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Services Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {filtered.map((service) => {
          const isLive = service.detectionSource === "live";
          const isExpanded = expandedService === service.id;
          const displayVersion = service.detectedVersion || service.version;

          return (
            <div
              key={service.id}
              className={`bg-card border rounded-xl transition-all ${
                service.status === "running" && isLive
                  ? "border-chart-2/30"
                  : service.status === "running"
                  ? "border-chart-4/20"
                  : service.status === "error"
                  ? "border-destructive/20"
                  : "border-border"
              }`}
            >
              <div className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center text-xl">
                      {service.icon}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm text-foreground">{service.name}</h3>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">
                          {displayVersion}
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2">
                        <span className="flex items-center gap-1">
                          <Globe className="w-3 h-3" /> :{service.port}
                        </span>
                        <span className="capitalize">{service.category}</span>
                        {service.lastPingMs !== undefined && service.status === "running" && (
                          <span className="text-chart-2" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                            {service.lastPingMs}ms
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <ServiceSourceBadge source={service.detectionSource} status={service.status} />
                    <ServiceStatusBadge status={service.status} />
                  </div>
                </div>

                <p className="text-xs text-muted-foreground mb-2">{service.description}</p>

                {/* Install path */}
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-3 py-1.5 px-2.5 bg-secondary/50 rounded-md">
                  <FolderOpen className="w-3 h-3 shrink-0" />
                  <span className="truncate" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "10px" }}>
                    {service.installPath}
                  </span>
                </div>

                {/* Live info from health check */}
                {service.status === "running" && service.liveInfo && Object.keys(service.liveInfo).length > 0 && (
                  <div className="flex items-center gap-3 flex-wrap text-xs text-muted-foreground mb-3 py-2 px-3 bg-chart-2/5 border border-chart-2/10 rounded-lg">
                    <Zap className="w-3 h-3 text-chart-2 shrink-0" />
                    {Object.entries(service.liveInfo).map(([key, val]) => (
                      <span key={key} className="flex items-center gap-1">
                        <span className="text-muted-foreground">{key}:</span>
                        <span className="text-foreground" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{val}</span>
                      </span>
                    ))}
                  </div>
                )}

                {/* Running stats (fallback when live info not available) */}
                {service.status === "running" && (!service.liveInfo || Object.keys(service.liveInfo).length === 0) && (
                  <div className="flex items-center gap-4 text-xs text-muted-foreground mb-3 py-2 px-3 bg-secondary rounded-lg">
                    {service.lastChecked && (
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" /> Checked {service.lastChecked}
                      </span>
                    )}
                    {service.customNodes && (
                      <span className="flex items-center gap-1">
                        <Plug className="w-3 h-3" /> {service.customNodes} nodes
                      </span>
                    )}
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center justify-between pt-3 border-t border-border">
                  <div className="flex items-center gap-2">
                    <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
                      <input
                        type="checkbox"
                        checked={service.autoStart}
                        onChange={() => toggleAutoStart(service.id)}
                        className="w-3.5 h-3.5 accent-primary"
                      />
                      Auto-start
                    </label>
                    <span className="text-xs text-muted-foreground">Updated {service.lastUpdate}</span>
                  </div>
                  <div className="flex gap-1.5">
                    {service.setupAction && (
                      <button
                        onClick={() =>
                          handleSetupAction(
                            service.setupAction!,
                            `${service.name} ${service.installed ? "Update" : "Install"}`
                          )
                        }
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                        title={`${service.installed ? "Update" : "Install"} via RTX5090_FULL_SETUP.bat`}
                      >
                        {service.installed ? (
                          <>
                            <ArrowUpCircle className="w-3.5 h-3.5" /> Update
                          </>
                        ) : (
                          <>
                            <Download className="w-3.5 h-3.5" /> Install
                          </>
                        )}
                      </button>
                    )}
                    {service.status === "running" && (
                      <a
                        href={service.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1.5 rounded-md bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                        title="Open in browser"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    )}
                    <button
                      onClick={() => setExpandedService(isExpanded ? null : service.id)}
                      className="p-1.5 rounded-md bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                      title="Details"
                    >
                      {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </button>
                    <button
                      onClick={() => hasTauri ? toggleService(service.id) : undefined}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-colors ${
                        !hasTauri && service.status !== "running"
                          ? "bg-secondary text-muted-foreground cursor-not-allowed opacity-50"
                          : service.status === "running"
                          ? "bg-destructive/10 text-destructive hover:bg-destructive/20"
                          : service.status === "starting"
                          ? "bg-chart-4/15 text-chart-4"
                          : "bg-chart-2/10 text-chart-2 hover:bg-chart-2/20"
                      }`}
                      title={!hasTauri && service.status !== "running" ? "Start/Stop requires Tauri backend" : ""}
                    >
                      {service.status === "running" ? (
                        <>
                          <Square className="w-3.5 h-3.5" /> Stop
                        </>
                      ) : service.status === "starting" ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Starting
                        </>
                      ) : (
                        <>
                          <Play className="w-3.5 h-3.5" /> Start
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>

              {/* Expanded Details Panel */}
              {isExpanded && (
                <div className="px-5 pb-5 pt-0 border-t border-border/50">
                  <div className="mt-3 space-y-3">
                    <div className="bg-secondary/30 rounded-lg p-3">
                      <div className="text-[10px] text-muted-foreground mb-2">Health Check Endpoint</div>
                      <div className="text-xs text-foreground" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                        {service.healthCheck.method || "GET"} {service.healthCheck.endpoint}
                      </div>
                      <div className="flex items-center gap-3 mt-2 text-[10px]">
                        <span className="text-muted-foreground">
                          Timeout: <span className="text-foreground">{service.healthCheck.timeout}ms</span>
                        </span>
                        {service.lastPingMs !== undefined && (
                          <span className="text-muted-foreground">
                            Last response: <span className={service.lastPingMs < 100 ? "text-chart-2" : "text-chart-4"}>{service.lastPingMs}ms</span>
                          </span>
                        )}
                        <span className="text-muted-foreground">
                          Source: <span className={service.detectionSource === "live" ? "text-chart-2" : "text-chart-4"}>{service.detectionSource}</span>
                        </span>
                      </div>
                    </div>

                    <div className="bg-secondary/30 rounded-lg p-3">
                      <div className="text-[10px] text-muted-foreground mb-2">What works in each mode</div>
                      <div className="grid grid-cols-2 gap-2 text-[10px]">
                        <div className="space-y-1">
                          <div className="text-foreground flex items-center gap-1">
                            <Globe className="w-3 h-3 text-primary" /> Browser Mode
                          </div>
                          <div className="flex items-center gap-1 text-chart-2"><CheckCircle2 className="w-2.5 h-2.5" /> Detect if running</div>
                          <div className="flex items-center gap-1 text-chart-2"><CheckCircle2 className="w-2.5 h-2.5" /> Open in browser</div>
                          <div className="flex items-center gap-1 text-chart-2"><CheckCircle2 className="w-2.5 h-2.5" /> Read live info</div>
                          <div className="flex items-center gap-1 text-muted-foreground"><XCircle className="w-2.5 h-2.5" /> Start / Stop</div>
                          <div className="flex items-center gap-1 text-muted-foreground"><XCircle className="w-2.5 h-2.5" /> Install / Update</div>
                        </div>
                        <div className="space-y-1">
                          <div className="text-foreground flex items-center gap-1">
                            <Wifi className="w-3 h-3 text-chart-2" /> Tauri + Backend
                          </div>
                          <div className="flex items-center gap-1 text-chart-2"><CheckCircle2 className="w-2.5 h-2.5" /> Detect if running</div>
                          <div className="flex items-center gap-1 text-chart-2"><CheckCircle2 className="w-2.5 h-2.5" /> Open in browser</div>
                          <div className="flex items-center gap-1 text-chart-2"><CheckCircle2 className="w-2.5 h-2.5" /> Read live info</div>
                          <div className="flex items-center gap-1 text-chart-2"><CheckCircle2 className="w-2.5 h-2.5" /> Start / Stop</div>
                          <div className="flex items-center gap-1 text-chart-2"><CheckCircle2 className="w-2.5 h-2.5" /> Install / Update</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* API Endpoints */}
      <div className="bg-card border border-border rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Terminal className="w-4 h-4 text-primary" />
            <h3 className="text-sm text-foreground">Local API Endpoints</h3>
            <span className="text-[10px] text-muted-foreground bg-secondary px-1.5 py-0.5 rounded">
              {endpoints.filter((e) => e.status === "active").length}/{endpoints.length} reachable
            </span>
          </div>
          {lastScanTime && (
            <span className="text-[10px] text-muted-foreground">Last scan: {lastScanTime}</span>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-muted-foreground border-b border-border">
                <th className="text-left py-2 px-3">Service</th>
                <th className="text-left py-2 px-3">Endpoint</th>
                <th className="text-left py-2 px-3">Method</th>
                <th className="text-left py-2 px-3">Response</th>
                <th className="text-left py-2 px-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {endpoints.map((ep) => (
                <tr key={ep.name} className="border-b border-border/50">
                  <td className="py-2.5 px-3 text-foreground">{ep.name}</td>
                  <td className="py-2.5 px-3 text-muted-foreground" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                    {ep.url}
                  </td>
                  <td className="py-2.5 px-3">
                    <span className="px-1.5 py-0.5 rounded bg-secondary text-muted-foreground" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                      {ep.method}
                    </span>
                  </td>
                  <td className="py-2.5 px-3" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                    {ep.status === "active" && ep.responseTime !== undefined ? (
                      <span className={ep.responseTime < 100 ? "text-chart-2" : "text-chart-4"}>
                        {ep.responseTime}ms
                      </span>
                    ) : ep.status === "checking" ? (
                      <span className="text-muted-foreground">...</span>
                    ) : (
                      <span className="text-muted-foreground">&mdash;</span>
                    )}
                  </td>
                  <td className="py-2.5 px-3">
                    {ep.status === "active" ? (
                      <span className="flex items-center gap-1 text-chart-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-chart-2" /> Active
                      </span>
                    ) : ep.status === "checking" ? (
                      <span className="flex items-center gap-1 text-chart-4">
                        <Loader2 className="w-3 h-3 animate-spin" /> Checking
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-muted-foreground">
                        <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/30" /> Inactive
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Terminal Output */}
      {terminalOpen && (
        <TerminalOutput
          title={terminalTitle}
          lines={terminalLines}
          animated
          onClose={() => setTerminalOpen(false)}
        />
      )}
    </div>
  );
}

// --- Sub-components ---

function ServiceStatusBadge({ status }: { status: ServiceStatus }) {
  const config = {
    running: { icon: CheckCircle2, text: "Running", cls: "bg-chart-2/15 text-chart-2" },
    stopped: { icon: XCircle, text: "Stopped", cls: "bg-secondary text-muted-foreground" },
    starting: { icon: Loader2, text: "Starting", cls: "bg-chart-4/15 text-chart-4" },
    error: { icon: AlertTriangle, text: "Error", cls: "bg-destructive/15 text-destructive" },
  };
  const c = config[status];
  return (
    <span className={`flex items-center gap-1 px-2 py-1 rounded-md text-[10px] ${c.cls}`}>
      <c.icon className={`w-3 h-3 ${status === "starting" ? "animate-spin" : ""}`} />
      {c.text}
    </span>
  );
}

function ServiceSourceBadge({ source, status }: { source: DetectionSource; status: ServiceStatus }) {
  if (source === "live" && status === "running") {
    return (
      <span className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] bg-chart-2/10 text-chart-2">
        <Radio className="w-2.5 h-2.5" /> Live
      </span>
    );
  }
  if (source === "live" && status === "stopped") {
    return (
      <span className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] bg-secondary text-muted-foreground">
        <CircleDot className="w-2.5 h-2.5" /> Scanned
      </span>
    );
  }
  if (source === "tauri") {
    return (
      <span className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] bg-chart-2/10 text-chart-2">
        <Wifi className="w-2.5 h-2.5" /> Backend
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] bg-chart-4/10 text-chart-4">
      <CircleDot className="w-2.5 h-2.5" /> Mock
    </span>
  );
}