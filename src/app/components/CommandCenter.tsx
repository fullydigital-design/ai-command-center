import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router";
import {
  MemoryStick,
  HardDrive,
  Thermometer,
  Zap,
  Activity,
  Clock,
  Server,
  Gauge,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Shield,
  Download,
  Trash2,
  ExternalLink,
  Monitor,
  ChevronRight,
  Power,
  Sparkles,
  RefreshCw,
  Loader2,
  FileWarning,
  Terminal,
  Settings,
  ArrowUpRight,
  Check,
  Wifi,
  Box,
  Wrench,
  Radio,
  CircleDot,
  ChevronDown,
  ChevronUp,
  BrainCircuit,
  Database,
  Cpu,
  Archive,
  Layers,
  CircleAlert,
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

// --- Service layer ---
import type {
  SystemSpec,
  SoftwareItem,
  CleanupItem,
  EnvVar,
  OptimizationItem,
  GPUStats,
  AIProcess,
  DiskCategory,
} from "../services/systemService";
import {
  getDataSource,
  getSystemSpecs,
  getSoftwareVersions,
  runSoftwareUpdate,
  getCleanupItems,
  runCleanup as serviceRunCleanup,
  getEnvVars,
  getOptimizations,
  applyOptimization,
  getHealthScore,
  getGPUStats,
  getAIProcesses,
  getDiskBreakdown,
} from "../services/systemService";
import { shouldTryBackend } from "../services/env";
import { ScriptLab } from "./ScriptLab";
import { ServicesPanel } from "./ServicesPanel";
import { useLauncherBridge } from "../hooks/useLauncherBridge";
import { DashboardOverviewSkeleton } from "./skeletons";

// --- Time-series data for performance charts ---
function generateTimeData(points: number) {
  return Array.from({ length: points }, (_, i) => ({
    time: `${i}s`,
    gpu: 35 + Math.random() * 45,
    cpu: 15 + Math.random() * 35,
    vram: 8 + Math.random() * 20,
    ram: 20 + Math.random() * 30,
  }));
}

// --- Alert types ---
interface AlertItem {
  id: string;
  type: "update" | "cleanup" | "optimization" | "training" | "error";
  message: string;
  detail: string;
  severity: "info" | "warning" | "action";
  targetTab?: TabKey;
  linkTo?: string;
  linkLabel: string;
}

const recentActivity = [
  { action: "Completed", item: "LoRA - Character v3 (2400 steps)", time: "2 hrs ago" },
  { action: "Updated", item: "ComfyUI Custom Nodes (47 nodes)", time: "3 hrs ago" },
  { action: "Generated", item: "FLUX.1 dev — 48 images batch", time: "4 hrs ago" },
  { action: "Downloaded", item: "Wan2.1 14B I2V (26.4 GB)", time: "Yesterday" },
  { action: "Cleaned", item: "pip cache + temp files (4.2 GB)", time: "Yesterday" },
  { action: "Pinned", item: "ComfyUI-GGUF on Community Hub", time: "2 days ago" },
];

// --- Optimization categories ---
const iconMap: Record<string, typeof Cpu> = {
  Cpu, Zap, MemoryStick, HardDrive, Thermometer, Wifi,
};

const CATEGORY_ORDER = ["gpu", "memory", "storage", "system", "ai-stack"] as const;
const CATEGORY_META: Record<string, { label: string; icon: typeof Cpu; color: string }> = {
  gpu: { label: "GPU", icon: Zap, color: "#6d5aff" },
  memory: { label: "Memory", icon: MemoryStick, color: "#00d4aa" },
  storage: { label: "Storage", icon: HardDrive, color: "#ffd93d" },
  system: { label: "System", icon: Settings, color: "#4ecdc4" },
  "ai-stack": { label: "AI Stack", icon: BrainCircuit, color: "#ff9f43" },
};

type TabKey = "overview" | "services" | "updates" | "cleanup" | "optimization" | "scriptlab";

export function CommandCenter() {
  const navigate = useNavigate();
  const bridge = useLauncherBridge();

  // --- State: shared data ---
  const [specs, setSpecs] = useState<SystemSpec[]>([]);
  const [gpuStats, setGpuStats] = useState<GPUStats | null>(null);
  const [processes, setProcesses] = useState<AIProcess[]>([]);
  const [diskBreakdown, setDiskBreakdown] = useState<DiskCategory[]>([]);
  const [software, setSoftware] = useState<SoftwareItem[]>([]);
  const [cleanup, setCleanup] = useState<CleanupItem[]>([]);
  const [envVars, setEnvVars] = useState<EnvVar[]>([]);
  const [optimizations, setOptimizations] = useState<OptimizationItem[]>([]);
  const [healthScore, setHealthScore] = useState(0);

  // --- State: UI ---
  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);
  const [cleaning, setCleaning] = useState(false);
  const [expandedOpt, setExpandedOpt] = useState<string | null>(null);
  const [softwareFilter, setSoftwareFilter] = useState<string>("all");
  const [timeData, setTimeData] = useState(generateTimeData(30));

  const dataSource = getDataSource();
  const isLive = dataSource !== "simulated";

  // ── Bridge: switch to ScriptLab > Launcher when pendingTool arrives ──
  useEffect(() => {
    if (bridge.pendingTool) {
      setActiveTab("scriptlab");
      // pendingTool is consumed by QuickLauncher inside ScriptLab
    }
  }, [bridge.pendingTool]);

  // --- Load all data ---
  // Uses Promise.allSettled so one failing endpoint (e.g. /env when the
  // backend is offline) doesn't prevent the rest of the dashboard from
  // rendering. Each setter is called only when its promise fulfils.
  const loadData = useCallback(async () => {
    setLoading(true);
    const results = await Promise.allSettled([
      getSystemSpecs(),
      getGPUStats(),
      getAIProcesses(),
      getDiskBreakdown(),
      getSoftwareVersions(),
      getCleanupItems(),
      getEnvVars(),
      getOptimizations(),
      getHealthScore(),
    ]);
    const setters = [
      setSpecs, setGpuStats, setProcesses, setDiskBreakdown,
      setSoftware, setCleanup, setEnvVars, setOptimizations, setHealthScore,
    ] as const;
    const labels = [
      "systemSpecs", "gpuStats", "aiProcesses", "diskBreakdown",
      "softwareVersions", "cleanupItems", "envVars", "optimizations", "healthScore",
    ];
    results.forEach((r, i) => {
      if (r.status === "fulfilled") {
        (setters[i] as (v: unknown) => void)(r.value);
      } else {
        console.warn(`CommandCenter: failed to load ${labels[i]}`, r.reason);
      }
    });
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // --- Poll GPU stats + time series ---
  // When backend is live, re-fetch real GPU stats every 2s.
  // When simulated, jitter the mock data for visual effect.
  useEffect(() => {
    if (activeTab !== "overview") return;
    const interval = setInterval(async () => {
      if (shouldTryBackend()) {
        try {
          const realStats = await getGPUStats();
          setGpuStats(realStats);
        } catch { /* backend unreachable, keep previous data */ }
      } else {
        setGpuStats((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            tempC: Math.max(38, Math.min(85, prev.tempC + Math.round((Math.random() - 0.48) * 3))),
            gpuUtilPercent: Math.max(0, Math.min(100, prev.gpuUtilPercent + Math.round((Math.random() - 0.5) * 8))),
            powerW: Math.max(30, Math.min(575, prev.powerW + Math.round((Math.random() - 0.5) * 15))),
            vramUsedGB: Math.max(1, Math.round((prev.vramUsedGB + (Math.random() - 0.5) * 0.3) * 10) / 10),
          };
        });
      }
      setTimeData((prev) => {
        const next = [...prev.slice(1)];
        const last = prev[prev.length - 1];
        next.push({
          time: `${parseInt(last?.time || "0") + 1}s`,
          gpu: Math.max(5, Math.min(95, (last?.gpu || 40) + (Math.random() - 0.5) * 15)),
          cpu: Math.max(5, Math.min(80, (last?.cpu || 20) + (Math.random() - 0.5) * 10)),
          vram: Math.max(5, Math.min(90, (last?.vram || 15) + (Math.random() - 0.5) * 5)),
          ram: Math.max(10, Math.min(70, (last?.ram || 30) + (Math.random() - 0.5) * 5)),
        });
        return next;
      });
    }, 2000);
    return () => clearInterval(interval);
  }, [activeTab]);

  // --- Derived ---
  const updatesAvailable = software.filter((s) => s.hasUpdate).length;
  const selectedCleanup = cleanup.filter((c) => c.selected);
  const totalCleanupSize = selectedCleanup.reduce((sum, c) => sum + c.sizeBytes, 0);
  const formatSize = (mb: number) => (mb >= 1000 ? `${(mb / 1000).toFixed(1)} GB` : `${mb} MB`);
  const totalDiskUsed = diskBreakdown.filter(d => d.label !== "Free Space").reduce((s, d) => s + d.sizeGB, 0);
  const totalDisk = diskBreakdown.reduce((s, d) => s + d.sizeGB, 0);
  const pendingCount = optimizations.filter((o) => o.status === "pending").length;
  const enabledCount = optimizations.filter((o) => o.status === "enabled").length;
  const totalReclaimable = cleanup.reduce((s, c) => s + c.sizeBytes, 0);

  // --- Dynamic alerts from real data ---
  const mockAlerts: AlertItem[] = [
    ...(updatesAvailable > 0 ? [{
      id: "1", type: "update" as const, message: `${updatesAvailable} software updates available`,
      detail: software.filter(s => s.hasUpdate).map(s => s.name).join(", "),
      severity: "action" as const, targetTab: "updates" as TabKey, linkLabel: "View Updates",
    }] : []),
    ...(pendingCount > 0 ? [{
      id: "2", type: "optimization" as const, message: `${pendingCount} pending optimizations`,
      detail: optimizations.filter(o => o.status === "pending").slice(0, 3).map(o => o.title).join(", "),
      severity: "action" as const, targetTab: "optimization" as TabKey, linkLabel: "Review",
    }] : []),
    ...(totalReclaimable > 500 ? [{
      id: "3", type: "cleanup" as const, message: `${formatSize(totalReclaimable)} reclaimable space`,
      detail: `${cleanup.length} items can be cleaned — caches, temp files, duplicates`,
      severity: "info" as const, targetTab: "cleanup" as TabKey, linkLabel: "Clean Up",
    }] : []),
    {
      id: "4", type: "training" as const, message: "Last training completed",
      detail: "LoRA - Character v3 finished 2 hours ago — 2400 steps, loss 0.082",
      severity: "info" as const, linkTo: "/training", linkLabel: "View Results",
    },
  ];

  // --- Action handlers ---
  const handleUpdate = async (name: string) => {
    setUpdating(name);
    const success = await runSoftwareUpdate(name);
    if (success) {
      setSoftware((prev) =>
        prev.map((s) => (s.name === name ? { ...s, hasUpdate: false, currentVersion: s.latestVersion } : s))
      );
    }
    setUpdating(null);
  };

  const toggleCleanupItem = (id: string) => {
    setCleanup((prev) => prev.map((c) => (c.id === id ? { ...c, selected: !c.selected } : c)));
  };

  const handleCleanup = async () => {
    setCleaning(true);
    const ids = selectedCleanup.map((c) => c.id);
    const result = await serviceRunCleanup(ids);
    if (result.success) {
      setCleanup((prev) => prev.filter((c) => !c.selected));
    }
    setCleaning(false);
  };

  const handleApplyOptimization = async (id: string) => {
    const success = await applyOptimization(id);
    if (success) {
      setOptimizations((prev) =>
        prev.map((o) => (o.id === id ? { ...o, status: "enabled" } : o))
      );
      setHealthScore((prev) => Math.min(100, prev + 3));
    }
  };

  const handleAlertClick = (alert: AlertItem) => {
    if (alert.targetTab) {
      setActiveTab(alert.targetTab);
    } else if (alert.linkTo) {
      navigate(alert.linkTo);
    }
  };

  // Software filter
  const softwareCategories = ["all", ...Array.from(new Set(software.map((s) => s.category)))];
  const filteredSoftware = softwareFilter === "all" ? software : software.filter((s) => s.category === softwareFilter);

  // --- Tab config ---
  const tabs: { key: TabKey; label: string; badge?: number }[] = [
    { key: "overview", label: "Overview" },
    { key: "services", label: "Services" },
    { key: "updates", label: "Updates", badge: updatesAvailable || undefined },
    { key: "cleanup", label: "Cleanup" },
    { key: "optimization", label: "Optimization", badge: pendingCount || undefined },
    { key: "scriptlab", label: "ScriptLab" },
  ];

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-foreground">Command Center</h1>
          <p className="text-sm text-muted-foreground mt-1">System monitoring, management & AI tools</p>
        </div>
        <div className="flex items-center gap-3">
          {updatesAvailable > 0 && activeTab !== "updates" && (
            <button
              onClick={() => setActiveTab("updates")}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-chart-4/10 border border-chart-4/20 hover:bg-chart-4/20 transition-colors"
            >
              <AlertTriangle className="w-3.5 h-3.5 text-chart-4" />
              <span className="text-xs text-chart-4">{updatesAvailable} updates</span>
            </button>
          )}
          <DataSourceBadge isLive={isLive} />
          <button
            onClick={loadData}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-secondary text-foreground text-xs hover:bg-secondary/80 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-card border border-border rounded-lg p-1 w-fit">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 rounded-md text-xs transition-colors ${
              activeTab === tab.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
            {tab.badge && tab.badge > 0 && (
              <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] ${
                tab.key === "updates" ? "bg-chart-4/20 text-chart-4" : "bg-primary/20 text-primary"
              }`}>{tab.badge}</span>
            )}
          </button>
        ))}
      </div>

      {/* =============================== OVERVIEW TAB =============================== */}
      {activeTab === "overview" && (
        loading ? <DashboardOverviewSkeleton /> : (
        <div className="space-y-6">
          {/* Compact Status Bar — 6 key metrics */}
          {gpuStats && (
            <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
              <CompactStat icon={<Zap className="w-3.5 h-3.5" />} label="GPU" value={`${gpuStats.gpuUtilPercent}%`} color="#6d5aff" percent={gpuStats.gpuUtilPercent} />
              <CompactStat icon={<Gauge className="w-3.5 h-3.5" />} label="VRAM" value={`${gpuStats.vramUsedGB.toFixed(1)}/${gpuStats.vramTotalGB}G`} color="#ffd93d" percent={(gpuStats.vramUsedGB / gpuStats.vramTotalGB) * 100} />
              <CompactStat icon={<Thermometer className="w-3.5 h-3.5" />} label="Temp" value={`${gpuStats.tempC}°C`} color={gpuStats.tempC > 75 ? "#ff6b6b" : "#00d4aa"} percent={(gpuStats.tempC / 90) * 100} />
              <CompactStat icon={<Power className="w-3.5 h-3.5" />} label="Power" value={`${gpuStats.powerW}W`} color="#ffd93d" percent={(gpuStats.powerW / gpuStats.powerLimitW) * 100} />
              <CompactStat icon={<HardDrive className="w-3.5 h-3.5" />} label="Disk" value={`${totalDiskUsed.toFixed(0)}/${totalDisk.toFixed(0)}G`} color="#4ecdc4" percent={totalDisk > 0 ? (totalDiskUsed / totalDisk) * 100 : 0} />
              <CompactStat icon={<Shield className="w-3.5 h-3.5" />} label="Health" value={`${healthScore}/100`} color={healthScore >= 80 ? "#00d4aa" : "#ffd93d"} percent={healthScore} />
            </div>
          )}

          {/* GPU Live Monitor + Active Processes */}
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
            {/* GPU Live Monitor */}
            {gpuStats && (
              <div className="xl:col-span-2 bg-card border border-border rounded-xl p-5">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Activity className="w-4 h-4 text-chart-2" />
                    <h3 className="text-sm text-foreground">GPU Live Monitor</h3>
                    <span className="flex items-center gap-1 text-[10px] text-chart-2 bg-chart-2/10 px-1.5 py-0.5 rounded">
                      <span className="w-1.5 h-1.5 rounded-full bg-chart-2 animate-pulse" />
                      {isLive ? "Live" : "Simulated"}
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                    Driver {gpuStats.driverVersion} / CUDA {gpuStats.cudaVersion}
                  </span>
                </div>

                {/* VRAM Bar */}
                <div className="mb-4">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs text-muted-foreground">VRAM</span>
                    <span className="text-xs text-foreground" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                      {gpuStats.vramUsedGB.toFixed(1)} / {gpuStats.vramTotalGB} GB
                    </span>
                  </div>
                  <div className="w-full h-6 bg-secondary rounded-lg overflow-hidden relative">
                    <div
                      className="h-full rounded-lg transition-all duration-1000"
                      style={{
                        width: `${(gpuStats.vramUsedGB / gpuStats.vramTotalGB) * 100}%`,
                        background: `linear-gradient(90deg, #6d5aff, ${gpuStats.vramUsedGB / gpuStats.vramTotalGB > 0.8 ? '#ff6b6b' : '#00d4aa'})`,
                      }}
                    />
                    <div className="absolute inset-0 flex items-center pointer-events-none">
                      {[8, 16, 24].map((gb) => (
                        <div key={gb} className="absolute h-full border-l border-foreground/10" style={{ left: `${(gb / gpuStats.vramTotalGB) * 100}%` }}>
                          <span className="absolute -top-0.5 left-1 text-[8px] text-foreground/30">{gb}G</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-4 mt-1.5">
                    <span className="text-[10px] text-muted-foreground">
                      {((1 - gpuStats.vramUsedGB / gpuStats.vramTotalGB) * gpuStats.vramTotalGB).toFixed(1)} GB free
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      PCIe Gen{gpuStats.pcieGen} x{gpuStats.pcieLinkWidth}
                    </span>
                  </div>
                </div>

                {/* Stats Grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <GpuStatCard label="GPU Utilization" value={`${gpuStats.gpuUtilPercent}%`} icon={<Gauge className="w-3.5 h-3.5" />} percent={gpuStats.gpuUtilPercent} color="#6d5aff" />
                  <GpuStatCard label="Temperature" value={`${gpuStats.tempC}°C`} icon={<Thermometer className="w-3.5 h-3.5" />} percent={(gpuStats.tempC / 90) * 100} color={gpuStats.tempC > 80 ? "#ff6b6b" : gpuStats.tempC > 65 ? "#ffd93d" : "#00d4aa"} />
                  <GpuStatCard label="Power Draw" value={`${gpuStats.powerW}W`} sub={`/ ${gpuStats.powerLimitW}W`} icon={<Power className="w-3.5 h-3.5" />} percent={(gpuStats.powerW / gpuStats.powerLimitW) * 100} color="#ffd93d" />
                  <GpuStatCard label="Clock Speed" value={`${gpuStats.clockGpuMHz} MHz`} sub={`/ ${gpuStats.clockMaxGpuMHz}`} icon={<Zap className="w-3.5 h-3.5" />} percent={(gpuStats.clockGpuMHz / gpuStats.clockMaxGpuMHz) * 100} color="#4ecdc4" />
                </div>
              </div>
            )}

            {/* Active AI Processes */}
            <div className="bg-card border border-border rounded-xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <Server className="w-4 h-4 text-primary" />
                <h3 className="text-sm text-foreground">Active Processes</h3>
                <span className="text-[10px] text-muted-foreground bg-secondary px-1.5 py-0.5 rounded">{processes.length}</span>
              </div>
              <div className="space-y-3">
                {processes.map((proc) => (
                  <div key={proc.pid} className="bg-secondary/50 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <ProcessStatusDot status={proc.status} />
                        <span className="text-xs text-foreground">{proc.name}</span>
                      </div>
                      <span className="text-[10px] text-muted-foreground" style={{ fontFamily: "'JetBrains Mono', monospace" }}>PID {proc.pid}</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-[10px]">
                      <div><span className="text-muted-foreground">VRAM</span><div className="text-foreground" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{proc.vramMB > 0 ? `${(proc.vramMB / 1024).toFixed(1)} GB` : "—"}</div></div>
                      <div><span className="text-muted-foreground">RAM</span><div className="text-foreground" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{(proc.ramMB / 1024).toFixed(1)} GB</div></div>
                      <div><span className="text-muted-foreground">Uptime</span><div className="text-foreground" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{proc.uptime}</div></div>
                    </div>
                  </div>
                ))}
                {processes.length === 0 && (
                  <div className="text-center py-6 text-xs text-muted-foreground">No AI processes detected</div>
                )}
                <div className="pt-2 border-t border-border/50">
                  <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                    <span>Total VRAM</span>
                    <span className="text-foreground" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{(processes.reduce((s, p) => s + p.vramMB, 0) / 1024).toFixed(1)} GB</span>
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-muted-foreground mt-1">
                    <span>Total RAM</span>
                    <span className="text-foreground" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{(processes.reduce((s, p) => s + p.ramMB, 0) / 1024).toFixed(1)} GB</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Performance Charts + Actionable Alerts */}
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
            {/* GPU & CPU Performance Chart */}
            <div className="xl:col-span-2 bg-card rounded-xl border border-border p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-primary" />
                  <h3 className="text-sm text-foreground">Performance Trend</h3>
                </div>
                <div className="flex items-center gap-4 text-xs">
                  <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-[#6d5aff]" /> GPU</span>
                  <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-[#00d4aa]" /> CPU</span>
                  <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-[#ffd93d]" /> VRAM</span>
                </div>
              </div>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={timeData}>
                  <defs>
                    <linearGradient id="gpuGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6d5aff" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#6d5aff" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="cpuGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#00d4aa" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#00d4aa" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="vramGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#ffd93d" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#ffd93d" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(109,90,255,0.08)" />
                  <XAxis dataKey="time" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} domain={[0, 100]} />
                  <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "8px", fontSize: "12px", color: "var(--foreground)" }} />
                  <Area type="monotone" dataKey="gpu" stroke="#6d5aff" fill="url(#gpuGrad)" strokeWidth={2} />
                  <Area type="monotone" dataKey="cpu" stroke="#00d4aa" fill="url(#cpuGrad)" strokeWidth={2} />
                  <Area type="monotone" dataKey="vram" stroke="#ffd93d" fill="url(#vramGrad)" strokeWidth={1.5} strokeDasharray="4 2" />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* Actionable Alerts — clicking switches tabs */}
            <div className="bg-card rounded-xl border border-border p-5">
              <div className="flex items-center gap-2 mb-4">
                <AlertTriangle className="w-4 h-4 text-chart-4" />
                <h3 className="text-sm text-foreground">Attention Needed</h3>
                {mockAlerts.filter((a) => a.severity === "action").length > 0 && (
                  <span className="text-[10px] text-chart-4 bg-chart-4/10 px-1.5 py-0.5 rounded">
                    {mockAlerts.filter((a) => a.severity === "action").length}
                  </span>
                )}
              </div>
              <div className="space-y-2">
                {mockAlerts.map((alert) => (
                  <button
                    key={alert.id}
                    className="w-full p-2.5 bg-secondary/50 rounded-lg hover:bg-secondary/80 transition-colors text-left"
                    onClick={() => handleAlertClick(alert)}
                  >
                    <div className="flex items-start gap-2">
                      <AlertIcon type={alert.type} />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs text-foreground">{alert.message}</div>
                        <div className="text-[10px] text-muted-foreground mt-0.5">{alert.detail}</div>
                      </div>
                      <ChevronRight className="w-3 h-3 text-muted-foreground shrink-0 mt-0.5" />
                    </div>
                  </button>
                ))}
                {mockAlerts.length === 0 && (
                  <div className="text-center py-6 text-xs text-muted-foreground">
                    <CheckCircle2 className="w-5 h-5 mx-auto mb-2 text-chart-2" />
                    All clear — nothing needs attention
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Storage Breakdown + Recent Activity */}
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
            {/* Storage Breakdown */}
            <div className="xl:col-span-2 bg-card border border-border rounded-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Database className="w-4 h-4 text-primary" />
                  <h3 className="text-sm text-foreground">Storage Breakdown</h3>
                </div>
                <span className="text-xs text-muted-foreground" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                  {diskBreakdown.reduce((s, d) => s + d.sizeGB, 0).toFixed(0)} GB total
                </span>
              </div>
              <div className="w-full h-8 bg-secondary rounded-lg overflow-hidden flex mb-4">
                {diskBreakdown.filter(d => d.sizeGB > 0 && d.label !== "Free Space").map((cat) => {
                  const total = diskBreakdown.reduce((s, d) => s + d.sizeGB, 0);
                  const pct = (cat.sizeGB / total) * 100;
                  return (
                    <div
                      key={cat.label}
                      className="h-full relative group cursor-default transition-opacity hover:opacity-80"
                      style={{ width: `${pct}%`, backgroundColor: cat.color }}
                      title={`${cat.label}: ${cat.sizeGB.toFixed(1)} GB`}
                    />
                  );
                })}
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {diskBreakdown.filter(d => d.label !== "Free Space").map((cat) => (
                  <div key={cat.label} className="flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-secondary/50 transition-colors">
                    <div className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: cat.color }} />
                    <div className="min-w-0">
                      <div className="text-[11px] text-foreground truncate">{cat.label}</div>
                      <div className="text-[10px] text-muted-foreground" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                        {cat.sizeGB.toFixed(1)} GB · {cat.count} {cat.count === 1 ? "item" : "items"}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Recent Activity + Quick Stats */}
            <div className="space-y-4">
              {/* Quick system health + action cards */}
              <div className="bg-card border border-border rounded-xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Shield className="w-4 h-4 text-chart-2" />
                  <h3 className="text-xs text-foreground">System Health</h3>
                </div>
                <div className="flex items-center gap-3">
                  <div className="relative w-14 h-14 shrink-0">
                    <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                      <circle cx="50" cy="50" r="42" fill="none" stroke="var(--secondary)" strokeWidth="8" />
                      <circle cx="50" cy="50" r="42" fill="none"
                        stroke={healthScore >= 80 ? "var(--chart-2)" : healthScore >= 60 ? "var(--chart-4)" : "var(--destructive)"}
                        strokeWidth="8" strokeLinecap="round"
                        strokeDasharray={`${(healthScore / 100) * 264} 264`}
                      />
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-sm text-foreground" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{healthScore}</span>
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-foreground">{healthScore >= 80 ? "Good" : healthScore >= 60 ? "Fair" : "Needs Work"}</div>
                    <div className="text-[10px] text-muted-foreground">{enabledCount} active · {pendingCount} pending</div>
                  </div>
                </div>
              </div>

              {/* Recent Activity */}
              <div className="bg-card border border-border rounded-xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Clock className="w-4 h-4 text-primary" />
                  <h3 className="text-xs text-foreground">Recent Activity</h3>
                </div>
                <div className="space-y-2">
                  {recentActivity.slice(0, 5).map((item, i) => (
                    <div key={i} className="flex items-start gap-2 py-1">
                      <div className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 bg-chart-2" />
                      <div className="min-w-0">
                        <div className="text-[11px] text-foreground truncate">
                          <span className="text-muted-foreground">{item.action}</span> {item.item}
                        </div>
                        <div className="text-[10px] text-muted-foreground">{item.time}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Environment Variables */}
          <div className="bg-card border border-border rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Terminal className="w-4 h-4 text-primary" />
                <h3 className="text-sm text-foreground">Environment Variables & Paths</h3>
                <span className="text-[10px] text-muted-foreground bg-secondary px-1.5 py-0.5 rounded">
                  {envVars.filter((e) => e.ok).length}/{envVars.length} OK
                </span>
              </div>
              <SourceTag source={isLive ? "process" : "simulated"} />
            </div>
            <div className="space-y-1.5 text-xs" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
              {envVars.map((env) => (
                <div key={env.key} className="flex items-center gap-3 py-2 px-3 bg-secondary/50 rounded-lg group">
                  {env.ok ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-chart-2 shrink-0" />
                  ) : (
                    <AlertTriangle className="w-3.5 h-3.5 text-chart-4 shrink-0" />
                  )}
                  <span className="text-primary w-40 shrink-0">{env.key}</span>
                  {env.required && (
                    <span className="text-[9px] text-chart-4 bg-chart-4/10 px-1 py-0.5 rounded shrink-0">req</span>
                  )}
                  <span className="text-muted-foreground truncate flex-1">{env.value}</span>
                  {env.description && (
                    <span className="text-[10px] text-muted-foreground/50 hidden group-hover:inline shrink-0 max-w-48 truncate">
                      {env.description}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
        )
      )}

      {/* =============================== SERVICES TAB =============================== */}
      {activeTab === "services" && (
        <div className="space-y-4">
          <ServicesPanel />
        </div>
      )}

      {/* =============================== UPDATES TAB =============================== */}
      {activeTab === "updates" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm text-foreground">Installed Software ({software.length})</h3>
            <div className="flex items-center gap-2">
              <SourceTag source={isLive ? "process" : "simulated"} />
              <button
                onClick={loadData}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-secondary text-foreground text-xs hover:bg-secondary/80 transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Check All
              </button>
            </div>
          </div>

          {/* Category Filter Chips */}
          <div className="flex gap-1.5 flex-wrap">
            {softwareCategories.map((cat) => {
              const count = cat === "all" ? software.length : software.filter((s) => s.category === cat).length;
              const hasUpdates = cat === "all"
                ? software.some((s) => s.hasUpdate)
                : software.filter((s) => s.category === cat).some((s) => s.hasUpdate);
              return (
                <button
                  key={cat}
                  onClick={() => setSoftwareFilter(cat)}
                  className={`px-3 py-1.5 rounded-lg text-xs transition-colors ${
                    softwareFilter === cat
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {cat === "all" ? "All" : cat}
                  <span className="ml-1 opacity-60">{count}</span>
                  {hasUpdates && softwareFilter !== cat && (
                    <span className="ml-1 w-1.5 h-1.5 rounded-full bg-chart-4 inline-block" />
                  )}
                </button>
              );
            })}
          </div>

          {/* Compatibility Alert */}
          {software.some((s) => s.compatibility === "warning") && (
            <div className="bg-chart-4/5 border border-chart-4/20 rounded-xl p-3 flex items-start gap-3">
              <AlertTriangle className="w-4 h-4 text-chart-4 shrink-0 mt-0.5" />
              <div className="text-xs">
                <span className="text-chart-4">Compatibility Notes:</span>
                <div className="text-muted-foreground mt-1 space-y-1">
                  {software.filter((s) => s.compatibility === "warning").map((s) => (
                    <div key={s.name}><span className="text-foreground">{s.name}</span> — {s.compatNote}</div>
                  ))}
                </div>
              </div>
            </div>
          )}

          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-muted-foreground border-b border-border bg-secondary/30">
                  <th className="text-left py-3 px-4">Software</th>
                  <th className="text-left py-3 px-4">Category</th>
                  <th className="text-left py-3 px-4">Current</th>
                  <th className="text-left py-3 px-4">Latest</th>
                  <th className="text-left py-3 px-4">Status</th>
                  <th className="text-left py-3 px-4">Compatibility</th>
                  <th className="text-right py-3 px-4">Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredSoftware.map((sw) => (
                  <tr key={sw.name} className="border-b border-border/50 hover:bg-secondary/20">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <span className="text-foreground">{sw.name}</span>
                        {sw.critical && <span className="px-1 py-0.5 rounded text-[9px] bg-primary/15 text-primary">Critical</span>}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-muted-foreground">{sw.category}</td>
                    <td className="py-3 px-4" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                      <span className="text-foreground">{sw.currentVersion}</span>
                    </td>
                    <td className="py-3 px-4" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                      <span className={sw.hasUpdate ? "text-chart-4" : "text-muted-foreground"}>{sw.latestVersion}</span>
                    </td>
                    <td className="py-3 px-4">
                      {sw.hasUpdate ? (
                        <span className="flex items-center gap-1 text-chart-4"><ArrowUpRight className="w-3 h-3" /> Update</span>
                      ) : (
                        <span className="flex items-center gap-1 text-chart-2"><Check className="w-3 h-3" /> Current</span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      {sw.compatibility === "ok" && <span className="flex items-center gap-1 text-chart-2"><CheckCircle2 className="w-3 h-3" /> OK</span>}
                      {sw.compatibility === "warning" && <span className="flex items-center gap-1 text-chart-4" title={sw.compatNote}><AlertTriangle className="w-3 h-3" /> Note</span>}
                      {sw.compatibility === "error" && <span className="flex items-center gap-1 text-destructive"><CircleAlert className="w-3 h-3" /> Issue</span>}
                      {!sw.compatibility && <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="py-3 px-4 text-right">
                      {sw.hasUpdate && (
                        <button
                          onClick={() => handleUpdate(sw.name)}
                          disabled={updating === sw.name}
                          className="flex items-center gap-1.5 px-3 py-1 rounded-md bg-chart-4/15 text-chart-4 hover:bg-chart-4/25 transition-colors ml-auto disabled:opacity-50"
                        >
                          {updating === sw.name ? (<><Loader2 className="w-3 h-3 animate-spin" /> Updating</>) : (<><Download className="w-3 h-3" /> Update</>)}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* =============================== CLEANUP TAB =============================== */}
      {activeTab === "cleanup" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm text-foreground">System Cleanup</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Selected: {selectedCleanup.length} items &middot; {formatSize(totalCleanupSize)} to free
              </p>
            </div>
            <div className="flex items-center gap-2">
              <SourceTag source={isLive ? "process" : "simulated"} />
              <button
                onClick={handleCleanup}
                disabled={cleaning || selectedCleanup.length === 0}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-destructive text-destructive-foreground text-xs hover:bg-destructive/90 transition-colors disabled:opacity-50"
              >
                {cleaning ? (<><Loader2 className="w-3.5 h-3.5 animate-spin" /> Cleaning...</>) : (<><Trash2 className="w-3.5 h-3.5" /> Clean Selected ({formatSize(totalCleanupSize)})</>)}
              </button>
            </div>
          </div>

          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
            {[
              { type: "cache" as const, label: "Cache", Icon: Box, color: "#6d5aff" },
              { type: "temp" as const, label: "Temp Files", Icon: FileWarning, color: "#ffd93d" },
              { type: "logs" as const, label: "Logs", Icon: Terminal, color: "#4ecdc4" },
              { type: "orphan" as const, label: "Orphaned", Icon: AlertTriangle, color: "#ff6b6b" },
              { type: "duplicate" as const, label: "Duplicates", Icon: Layers, color: "#00d4aa" },
              { type: "output" as const, label: "Old Outputs", Icon: Archive, color: "#636e72" },
            ].map((cat) => {
              const items = cleanup.filter((c) => c.type === cat.type);
              const size = items.reduce((s, c) => s + c.sizeBytes, 0);
              return (
                <div key={cat.type} className="bg-card border border-border rounded-xl p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <cat.Icon className="w-3.5 h-3.5" style={{ color: cat.color }} />
                    <span className="text-xs text-muted-foreground">{cat.label}</span>
                  </div>
                  <div className="text-sm text-foreground" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{formatSize(size)}</div>
                  <div className="text-[10px] text-muted-foreground">{items.length} items</div>
                </div>
              );
            })}
          </div>

          {/* Cleanup items */}
          <div className="space-y-2">
            {cleanup.map((item) => (
              <div
                key={item.id}
                className={`flex items-center gap-4 bg-card border rounded-xl p-4 transition-all ${
                  item.selected ? "border-primary/20" : "border-border"
                }`}
              >
                <input type="checkbox" checked={item.selected} onChange={() => toggleCleanupItem(item.id)} className="w-4 h-4 accent-primary shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm text-foreground">{item.name}</span>
                    {!item.safe && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] bg-chart-4/15 text-chart-4 flex items-center gap-1">
                        <AlertTriangle className="w-2.5 h-2.5" /> Review
                      </span>
                    )}
                    {item.safe && <span className="px-1.5 py-0.5 rounded text-[10px] bg-chart-2/15 text-chart-2">Safe</span>}
                    <span className="px-1.5 py-0.5 rounded text-[10px] bg-secondary text-muted-foreground capitalize">{item.type}</span>
                  </div>
                  {item.description && <div className="text-[11px] text-muted-foreground mt-1">{item.description}</div>}
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-[10px] text-muted-foreground" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{item.path}</span>
                    {item.lastAccessed && <span className="text-[10px] text-muted-foreground/60">Last accessed: {item.lastAccessed}</span>}
                  </div>
                </div>
                <div className="text-sm text-foreground shrink-0" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{item.size}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* =============================== OPTIMIZATION TAB =============================== */}
      {activeTab === "optimization" && (
        <div className="space-y-6">
          {/* Health Score */}
          <div className="bg-card border border-border rounded-xl p-6 flex items-center gap-8">
            <div className="relative w-28 h-28 shrink-0">
              <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                <circle cx="50" cy="50" r="42" fill="none" stroke="var(--secondary)" strokeWidth="8" />
                <circle cx="50" cy="50" r="42" fill="none"
                  stroke={healthScore >= 80 ? "var(--chart-2)" : healthScore >= 60 ? "var(--chart-4)" : "var(--destructive)"}
                  strokeWidth="8" strokeLinecap="round"
                  strokeDasharray={`${(healthScore / 100) * 264} 264`}
                  className="transition-all duration-1000"
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-2xl text-foreground" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{healthScore}</span>
              </div>
            </div>
            <div>
              <h2 className="text-foreground">System Health: {healthScore >= 80 ? "Good" : healthScore >= 60 ? "Fair" : "Needs Work"}</h2>
              <p className="text-sm text-muted-foreground mt-1">{enabledCount} of {optimizations.length} optimizations applied &middot; {pendingCount} pending</p>
              <div className="flex items-center gap-4 mt-3">
                <div className="flex items-center gap-1.5 text-xs"><CheckCircle2 className="w-3.5 h-3.5 text-chart-2" /><span className="text-muted-foreground">{enabledCount} enabled</span></div>
                <div className="flex items-center gap-1.5 text-xs"><Wrench className="w-3.5 h-3.5 text-chart-4" /><span className="text-muted-foreground">{pendingCount} pending</span></div>
                <SourceTag source={isLive ? "process" : "simulated"} />
              </div>
            </div>
          </div>

          {/* Grouped Optimization Suggestions */}
          {CATEGORY_ORDER.map((catKey) => {
            const catOpts = optimizations.filter((o) => o.category === catKey);
            if (catOpts.length === 0) return null;
            const meta = CATEGORY_META[catKey];
            const CatIcon = meta.icon;
            const catPending = catOpts.filter((o) => o.status === "pending").length;

            return (
              <div key={catKey} className="space-y-2">
                <div className="flex items-center gap-2 mb-1">
                  <CatIcon className="w-4 h-4" style={{ color: meta.color }} />
                  <h3 className="text-sm text-foreground">{meta.label} Optimizations</h3>
                  {catPending > 0 && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-chart-4/15 text-chart-4">{catPending} pending</span>
                  )}
                </div>

                {catOpts.map((opt) => {
                  const isExpanded = expandedOpt === opt.id;
                  return (
                    <div key={opt.id} className="bg-card border border-border rounded-xl overflow-hidden">
                      <div
                        className="p-4 flex items-start gap-4 cursor-pointer hover:bg-secondary/20 transition-colors"
                        onClick={() => setExpandedOpt(isExpanded ? null : opt.id)}
                      >
                        <div className="mt-0.5">
                          {opt.status === "enabled" ? (
                            <CheckCircle2 className="w-5 h-5 text-chart-2" />
                          ) : (
                            <Wrench className="w-5 h-5 text-chart-4" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h4 className="text-sm text-foreground">{opt.title}</h4>
                            <span className={`px-1.5 py-0.5 rounded text-[10px] ${
                              opt.impact === "High" ? "bg-primary/15 text-primary" : opt.impact === "Medium" ? "bg-chart-4/15 text-chart-4" : "bg-secondary text-muted-foreground"
                            }`}>{opt.impact} Impact</span>
                            {opt.status === "enabled" && <span className="text-[10px] text-chart-2 bg-chart-2/10 px-1.5 py-0.5 rounded">Active</span>}
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">{opt.desc}</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {opt.status === "pending" && (
                            <button
                              onClick={(e) => { e.stopPropagation(); handleApplyOptimization(opt.id); }}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-xs hover:bg-primary/20 transition-colors"
                            >
                              <Sparkles className="w-3.5 h-3.5" /> Apply
                            </button>
                          )}
                          {isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="px-4 pb-4 pt-0 border-t border-border/50 ml-9">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3 text-xs">
                            {opt.currentValue && (
                              <div className="bg-secondary/50 rounded-lg p-3">
                                <span className="text-muted-foreground">Current Value</span>
                                <div className="text-foreground mt-1" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{opt.currentValue}</div>
                              </div>
                            )}
                            {opt.recommendedValue && (
                              <div className="bg-chart-2/5 border border-chart-2/10 rounded-lg p-3">
                                <span className="text-chart-2">Recommended</span>
                                <div className="text-foreground mt-1" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{opt.recommendedValue}</div>
                              </div>
                            )}
                          </div>
                          {opt.howTo && (
                            <div className="mt-3 bg-secondary/30 rounded-lg p-3">
                              <span className="text-[10px] text-muted-foreground">How to apply manually:</span>
                              <div className="text-xs text-foreground mt-1" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{opt.howTo}</div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}

      {/* =============================== SCRIPTLAB TAB =============================== */}
      {activeTab === "scriptlab" && (
        <div className="space-y-4">
          <ScriptLab />
        </div>
      )}
    </div>
  );
}

// ===================== Sub-components =====================

function CompactStat({ icon, label, value, color, percent }: {
  icon: React.ReactNode; label: string; value: string; color: string; percent: number;
}) {
  return (
    <div className="bg-card rounded-xl border border-border p-3 relative overflow-hidden">
      <div className="flex items-center gap-1.5 mb-1">
        <span style={{ color }}>{icon}</span>
        <span className="text-[10px] text-muted-foreground">{label}</span>
      </div>
      <div className="text-sm text-foreground" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{value}</div>
      <div className="mt-2 h-1 bg-secondary rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-1000" style={{ width: `${Math.min(100, percent)}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}

function GpuStatCard({ label, value, sub, icon, percent, color }: {
  label: string; value: string; sub?: string; icon: React.ReactNode; percent: number; color: string;
}) {
  return (
    <div className="bg-secondary/50 rounded-lg p-3">
      <div className="flex items-center gap-1.5 mb-2">
        <span style={{ color }}>{icon}</span>
        <span className="text-[10px] text-muted-foreground">{label}</span>
      </div>
      <div className="flex items-baseline gap-1">
        <span className="text-sm text-foreground" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{value}</span>
        {sub && <span className="text-[10px] text-muted-foreground" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{sub}</span>}
      </div>
      <div className="w-full h-1.5 bg-background rounded-full mt-2 overflow-hidden">
        <div className="h-full rounded-full transition-all duration-1000" style={{ width: `${Math.min(100, percent)}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}

function ProcessStatusDot({ status }: { status: string }) {
  const colors: Record<string, string> = { running: "bg-chart-2", idle: "bg-chart-4", loading: "bg-primary animate-pulse" };
  return <div className={`w-2 h-2 rounded-full ${colors[status] || "bg-muted-foreground"}`} />;
}

function AlertIcon({ type }: { type: string }) {
  switch (type) {
    case "update": return <Download className="w-3.5 h-3.5 text-chart-4 shrink-0 mt-0.5" />;
    case "cleanup": return <Trash2 className="w-3.5 h-3.5 text-destructive shrink-0 mt-0.5" />;
    case "optimization": return <Sparkles className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />;
    case "training": return <CheckCircle2 className="w-3.5 h-3.5 text-chart-2 shrink-0 mt-0.5" />;
    case "error": return <XCircle className="w-3.5 h-3.5 text-destructive shrink-0 mt-0.5" />;
    default: return <AlertTriangle className="w-3.5 h-3.5 text-chart-4 shrink-0 mt-0.5" />;
  }
}

function DataSourceBadge({ isLive }: { isLive: boolean }) {
  return (
    <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs ${
      isLive ? "bg-chart-2/10 border-chart-2/20 text-chart-2" : "bg-chart-4/10 border-chart-4/20 text-chart-4"
    }`}>
      {isLive ? (<><Radio className="w-3 h-3" /><span>Live Data</span></>) : (<><CircleDot className="w-3 h-3" /><span>Simulated</span></>)}
    </div>
  );
}

function SourceTag({ source }: { source: string }) {
  const config: Record<string, { label: string; cls: string }> = {
    simulated: { label: "Simulated data", cls: "bg-chart-4/10 text-chart-4" },
    process: { label: "Live system data", cls: "bg-chart-2/10 text-chart-2" },
  };
  const c = config[source] || config.simulated;
  return <span className={`text-[10px] px-1.5 py-0.5 rounded ${c.cls}`}>{c.label}</span>;
}
