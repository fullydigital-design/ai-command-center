import { useState, useEffect, useCallback } from "react";
import {
  GraduationCap,
  Pause,
  ExternalLink,
  Clock,
  TrendingDown,
  BarChart3,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Zap,
  MemoryStick,
  FolderOpen,
  RefreshCw,
  Eye,
  Activity,
  FileCode,
  Terminal,
  Radio,
  CircleDot,
  Play,
  Square,
  Copy,
  Check,
  Sparkles,
} from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

// --- Service layer ---
import type { TrainingJob, ServiceHealth } from "../services/types";
import {
  getTrainingJobs,
  pollTrainingUpdates,
  getServiceHealth,
  getDataSource,
  typeConfig,
  checkTensorBoardStatus,
  launchTensorBoard,
  stopTensorBoard,
  getTensorBoardCommand,
} from "../services/trainingService";
import type { TensorBoardStatus } from "../services/trainingService";
import { TrainingConfigOptimizer } from "./TrainingConfigOptimizer";
import { TrainingServicesSkeleton, TrainingJobsSkeleton, TrainingGPUSkeleton } from "./skeletons";
import { toast } from "sonner";

const POLL_INTERVAL = 3000; // 3 seconds — same interval the backend will use

export function TrainingPage() {
  const [jobs, setJobs] = useState<TrainingJob[]>([]);
  const [selectedJob, setSelectedJob] = useState<TrainingJob | null>(null);
  const [statusFilter, setStatusFilter] = useState<
    "all" | "running" | "completed" | "failed"
  >("all");
  const [services, setServices] = useState<ServiceHealth[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [activeTab, setActiveTab] = useState<"monitor" | "optimizer">("monitor");

  // TensorBoard launcher state
  const [tbStatus, setTbStatus] = useState<TensorBoardStatus | null>(null);
  const [tbLaunching, setTbLaunching] = useState(false);
  const [tbPanelOpen, setTbPanelOpen] = useState(false);
  const [tbCopied, setTbCopied] = useState(false);

  const dataSource = getDataSource();
  const isLive = dataSource !== "simulated";
  const hasTauri = typeof window !== "undefined" && "__TAURI__" in window;

  // --- Initial load via service ---
  const loadData = useCallback(async () => {
    setLoading(true);
    const [jobData, serviceData] = await Promise.all([
      getTrainingJobs(),
      getServiceHealth(),
    ]);
    setJobs(jobData);
    setServices(serviceData);
    if (jobData.length > 0 && !selectedJob) {
      setSelectedJob(jobData[0]);
    }
    setLastRefresh(new Date());
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // --- Polling for live updates ---
  useEffect(() => {
    const interval = setInterval(async () => {
      const updated = await pollTrainingUpdates(jobs);
      setJobs(updated);
    }, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [jobs]);

  // Keep selectedJob in sync
  useEffect(() => {
    if (selectedJob) {
      const updated = jobs.find((j) => j.id === selectedJob.id);
      if (updated) setSelectedJob(updated);
    }
  }, [jobs]);

  // --- TensorBoard status check ---
  const checkTBStatus = useCallback(async () => {
    const status = await checkTensorBoardStatus();
    setTbStatus(status);
  }, []);

  useEffect(() => {
    checkTBStatus();
    const interval = setInterval(checkTBStatus, 15000); // Check every 15s
    return () => clearInterval(interval);
  }, [checkTBStatus]);

  const handleLaunchTB = async () => {
    if (!selectedJob?.tensorboardLogDir) return;

    setTbLaunching(true);
    const result = await launchTensorBoard(selectedJob.tensorboardLogDir);

    if (result.success) {
      // Wait a moment for TensorBoard to start, then check status
      setTimeout(async () => {
        await checkTBStatus();
        setTbLaunching(false);
      }, 3000);
    } else {
      // Browser mode — show the panel with the command to copy
      setTbPanelOpen(true);
      setTbLaunching(false);
    }
  };

  const handleStopTB = async () => {
    const result = await stopTensorBoard();
    if (result.success) {
      await checkTBStatus();
    }
  };

  const handleCopyTBCommand = (logdir: string) => {
    const cmd = getTensorBoardCommand(logdir);
    navigator.clipboard.writeText(cmd).then(() => {
      setTbCopied(true);
      toast.success("TensorBoard command copied");
      setTimeout(() => setTbCopied(false), 2000);
    });
  };

  const runningCount = jobs.filter((j) => j.status === "running").length;
  const filteredJobs = jobs.filter(
    (j) => statusFilter === "all" || j.status === statusFilter
  );

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-foreground">Training</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Monitor jobs & optimize training configs with AI
          </p>
        </div>
        <div className="flex items-center gap-3">
          {activeTab === "monitor" && runningCount > 0 && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-chart-2/10 border border-chart-2/20">
              <Loader2 className="w-3.5 h-3.5 text-chart-2 animate-spin" />
              <span className="text-xs text-chart-2">
                {runningCount} training
              </span>
            </div>
          )}
          {activeTab === "monitor" && <DataSourceBadge isLive={isLive} />}
          {activeTab === "monitor" && (
            <button
              onClick={loadData}
              disabled={loading}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-secondary text-foreground text-xs hover:bg-secondary/80 transition-colors disabled:opacity-50"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`}
              />
              Refresh
            </button>
          )}
        </div>
      </div>

      {/* Tab switcher */}
      <div className="flex gap-1 bg-card border border-border rounded-lg p-1 w-fit">
        <button
          onClick={() => setActiveTab("monitor")}
          className={`flex items-center gap-1.5 px-4 py-1.5 rounded-md text-xs transition-colors ${
            activeTab === "monitor"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <GraduationCap className="w-3.5 h-3.5" />
          Monitor
        </button>
        <button
          onClick={() => setActiveTab("optimizer")}
          className={`flex items-center gap-1.5 px-4 py-1.5 rounded-md text-xs transition-colors ${
            activeTab === "optimizer"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Sparkles className="w-3.5 h-3.5" />
          AI Optimizer
        </button>
      </div>

      {activeTab === "monitor" ? (
        <>
          {/* Service status bar + quick launch */}
          {loading ? (
            <div className="space-y-6">
              <TrainingServicesSkeleton />
              <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                <TrainingJobsSkeleton />
                <div className="xl:col-span-2">
                  <TrainingGPUSkeleton />
                </div>
              </div>
            </div>
          ) : (
          <>
          <div className="flex gap-3 flex-wrap">
            {services.map((svc) => (
              <ServiceCard key={svc.id} service={svc} isLive={isLive} />
            ))}
          </div>

          {/* Status filter */}
          <div className="flex gap-1 bg-card border border-border rounded-lg p-1 w-fit">
            {(["all", "running", "completed", "failed"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setStatusFilter(f)}
                className={`px-3 py-1.5 rounded-md text-xs capitalize transition-colors ${
                  statusFilter === f
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {f}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            {/* Job List */}
            <div className="xl:col-span-1 space-y-3">
              <h3 className="text-sm text-muted-foreground">
                Detected Jobs ({filteredJobs.length})
              </h3>
              {filteredJobs.map((job) => {
                const cfg = typeConfig[job.type];
                return (
                  <div
                    key={job.id}
                    onClick={() => setSelectedJob(job)}
                    className={`bg-card border rounded-xl p-4 cursor-pointer transition-all hover:border-primary/30 ${
                      selectedJob?.id === job.id
                        ? "border-primary/50"
                        : "border-border"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span
                          className="text-[10px] px-1.5 py-0.5 rounded"
                          style={{
                            background: `${cfg.color}20`,
                            color: cfg.color,
                          }}
                        >
                          {cfg.label}
                        </span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">
                          {job.tool === "kohya" ? "Kohya SS" : "Musubi"}
                        </span>
                      </div>
                      <TrainingStatusBadge status={job.status} />
                    </div>
                    <h4 className="text-sm text-foreground truncate">
                      {job.name}
                    </h4>
                    <div className="text-xs text-muted-foreground mt-1">
                      {job.model} &middot; {job.datasetSize}{" "}
                      {job.tool === "musubi" ? "clips" : "images"}
                    </div>
                    {job.status === "running" && (
                      <div className="mt-2">
                        <div className="flex justify-between text-xs text-muted-foreground mb-1">
                          <span>
                            Epoch {job.epoch}/{job.totalEpochs}
                          </span>
                          <span>{job.progress.toFixed(0)}%</span>
                        </div>
                        <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-1000"
                            style={{
                              width: `${job.progress}%`,
                              backgroundColor: cfg.color,
                            }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
              {filteredJobs.length === 0 && (
                <div className="text-center py-8 text-muted-foreground text-xs">
                  <GraduationCap className="w-6 h-6 mx-auto mb-2 opacity-50" />
                  No {statusFilter === "all" ? "" : statusFilter} jobs detected
                </div>
              )}
            </div>

            {/* Job Detail */}
            <div className="xl:col-span-2">
              {selectedJob ? (
                <div className="space-y-4">
                  {/* Detail Header */}
                  <div className="bg-card border border-border rounded-xl p-5">
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <h2 className="text-foreground">{selectedJob.name}</h2>
                        <div className="text-sm text-muted-foreground mt-1">
                          Base: {selectedJob.model} &middot; Dataset:{" "}
                          {selectedJob.dataset} ({selectedJob.datasetSize} items)
                        </div>
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-1.5">
                          <FolderOpen className="w-3 h-3" />
                          <span
                            style={{
                              fontFamily: "'JetBrains Mono', monospace",
                              fontSize: "10px",
                            }}
                          >
                            {selectedJob.outputPath}
                          </span>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        {selectedJob.tensorboardLogDir && (
                          <TensorBoardButton
                            tbStatus={tbStatus}
                            tbLaunching={tbLaunching}
                            onLaunch={handleLaunchTB}
                            onStop={handleStopTB}
                          />
                        )}
                        {selectedJob.tool === "kohya" && (
                          <a
                            href="http://localhost:7860"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                          >
                            <ExternalLink className="w-3.5 h-3.5" /> Open Kohya
                          </a>
                        )}
                        {selectedJob.tool === "musubi" && (
                          <a
                            href="http://localhost:7870"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                          >
                            <ExternalLink className="w-3.5 h-3.5" /> Open Musubi
                          </a>
                        )}
                      </div>
                    </div>

                    {/* Stats Grid */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <MiniStat
                        icon={<BarChart3 className="w-3.5 h-3.5" />}
                        label="Current Loss"
                        value={selectedJob.loss.toFixed(4)}
                        color="#6d5aff"
                        source={isLive ? "tensorboard" : "simulated"}
                      />
                      <MiniStat
                        icon={<TrendingDown className="w-3.5 h-3.5" />}
                        label="Learning Rate"
                        value={selectedJob.learningRate}
                        color="#00d4aa"
                        source={isLive ? "config-file" : "simulated"}
                      />
                      <MiniStat
                        icon={<Clock className="w-3.5 h-3.5" />}
                        label="ETA"
                        value={selectedJob.eta}
                        color="#ffd93d"
                        source={isLive ? "process" : "simulated"}
                      />
                      <MiniStat
                        icon={<GraduationCap className="w-3.5 h-3.5" />}
                        label="Steps"
                        value={`${selectedJob.currentStep}/${selectedJob.totalSteps}`}
                        color="#4ecdc4"
                        source={isLive ? "tensorboard" : "simulated"}
                      />
                    </div>

                    {/* GPU Stats */}
                    {selectedJob.status === "running" && (
                      <div className="grid grid-cols-2 gap-3 mt-3">
                        <div className="flex items-center gap-3 px-3 py-2 bg-secondary rounded-lg">
                          <Zap className="w-4 h-4 text-primary" />
                          <div>
                            <div className="text-xs text-muted-foreground">
                              GPU Usage
                            </div>
                            <div
                              className="text-sm text-foreground"
                              style={{
                                fontFamily: "'JetBrains Mono', monospace",
                              }}
                            >
                              {selectedJob.gpuUsage.toFixed(0)}%
                            </div>
                          </div>
                          <div className="flex-1 h-1.5 bg-background rounded-full overflow-hidden ml-2">
                            <div
                              className="h-full bg-primary rounded-full transition-all duration-1000"
                              style={{ width: `${selectedJob.gpuUsage}%` }}
                            />
                          </div>
                        </div>
                        <div className="flex items-center gap-3 px-3 py-2 bg-secondary rounded-lg">
                          <MemoryStick className="w-4 h-4 text-chart-4" />
                          <div>
                            <div className="text-xs text-muted-foreground">
                              VRAM
                            </div>
                            <div
                              className="text-sm text-foreground"
                              style={{
                                fontFamily: "'JetBrains Mono', monospace",
                              }}
                            >
                              {selectedJob.vramUsage.toFixed(1)} GB
                            </div>
                          </div>
                          <div className="flex-1 h-1.5 bg-background rounded-full overflow-hidden ml-2">
                            <div
                              className="h-full bg-chart-4 rounded-full transition-all duration-1000"
                              style={{
                                width: `${(selectedJob.vramUsage / 32) * 100}%`,
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Loss Chart */}
                  {selectedJob.lossHistory.length > 0 && (
                    <div className="bg-card border border-border rounded-xl p-5">
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2">
                          <TrendingDown className="w-4 h-4 text-primary" />
                          <h3 className="text-sm text-foreground">Training Loss</h3>
                        </div>
                        <div className="flex items-center gap-2">
                          <a
                            href="http://localhost:6006"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                            title="View full metrics in TensorBoard"
                          >
                            <BarChart3 className="w-3 h-3" /> Full view
                            <ExternalLink className="w-2.5 h-2.5" />
                          </a>
                          <SourceTag
                            source={isLive ? "tensorboard" : "simulated"}
                          />
                        </div>
                      </div>
                      <ResponsiveContainer width="100%" height={250}>
                        <LineChart data={selectedJob.lossHistory}>
                          <CartesianGrid
                            strokeDasharray="3 3"
                            stroke="rgba(109,90,255,0.08)"
                          />
                          <XAxis
                            dataKey="step"
                            tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                            axisLine={false}
                            tickLine={false}
                          />
                          <YAxis
                            tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                            axisLine={false}
                            tickLine={false}
                          />
                          <Tooltip
                            contentStyle={{
                              background: "var(--card)",
                              border: "1px solid rgba(109,90,255,0.2)",
                              borderRadius: "8px",
                              fontSize: "12px",
                            }}
                            formatter={(v: number) => v.toFixed(4)}
                          />
                          <Line
                            type="monotone"
                            dataKey="loss"
                            stroke="#6d5aff"
                            strokeWidth={2}
                            dot={false}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  )}

                  {/* Detected Configuration */}
                  <div className="bg-card border border-border rounded-xl p-5">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <Eye className="w-4 h-4 text-primary" />
                        <h3 className="text-sm text-foreground">
                          Detected Configuration
                        </h3>
                      </div>
                      <SourceTag
                        source={isLive ? "config-file" : "simulated"}
                      />
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                      <ConfigItem
                        label="Tool"
                        value={
                          selectedJob.tool === "kohya"
                            ? "Kohya SS"
                            : "Musubi Tuner"
                        }
                      />
                      <ConfigItem label="Resolution" value={selectedJob.resolution} />
                      <ConfigItem
                        label="Batch Size"
                        value={String(selectedJob.batchSize)}
                      />
                      <ConfigItem
                        label="Total Epochs"
                        value={String(selectedJob.totalEpochs)}
                      />
                      <ConfigItem
                        label="Total Steps"
                        value={String(selectedJob.totalSteps)}
                      />
                      <ConfigItem label="Started" value={selectedJob.startTime} />
                      <ConfigItem label="Dataset" value={selectedJob.dataset} />
                      <ConfigItem
                        label="Type"
                        value={typeConfig[selectedJob.type].label}
                      />
                    </div>

                    {/* Show config file path when available */}
                    {selectedJob.configPath && (
                      <div className="mt-3 pt-3 border-t border-border flex items-center gap-2 text-xs text-muted-foreground">
                        <FileCode className="w-3 h-3 shrink-0" />
                        <span
                          style={{
                            fontFamily: "'JetBrains Mono', monospace",
                            fontSize: "10px",
                          }}
                        >
                          {selectedJob.configPath}
                        </span>
                      </div>
                    )}
                    {selectedJob.tensorboardLogDir && (
                      <div className="mt-1.5 flex items-center gap-2 text-xs text-muted-foreground">
                        <BarChart3 className="w-3 h-3 shrink-0" />
                        <span
                          style={{
                            fontFamily: "'JetBrains Mono', monospace",
                            fontSize: "10px",
                          }}
                        >
                          {selectedJob.tensorboardLogDir}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Backend Integration Info (only in simulated mode) */}
                  {!isLive && (
                    <IntegrationGuidePanel job={selectedJob} />
                  )}

                  {/* TensorBoard Control Panel */}
                  {selectedJob.tensorboardLogDir && (
                    <TensorBoardPanel
                      logdir={selectedJob.tensorboardLogDir}
                      tbStatus={tbStatus}
                      tbLaunching={tbLaunching}
                      tbPanelOpen={tbPanelOpen}
                      tbCopied={tbCopied}
                      hasTauri={hasTauri}
                      isLive={isLive}
                      onLaunch={handleLaunchTB}
                      onStop={handleStopTB}
                      onCopy={() =>
                        handleCopyTBCommand(selectedJob.tensorboardLogDir!)
                      }
                      onTogglePanel={() => setTbPanelOpen(!tbPanelOpen)}
                    />
                  )}
                </div>
              ) : (
                <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
                  Select a training job to view details
                </div>
              )}
            </div>
          </div>
          </>
          )}
        </>
      ) : (
        <TrainingConfigOptimizer />
      )}
    </div>
  );
}

// ============================================================
// Sub-components
// ============================================================

function DataSourceBadge({ isLive }: { isLive: boolean }) {
  return (
    <div
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs ${
        isLive
          ? "bg-chart-2/10 border-chart-2/20 text-chart-2"
          : "bg-chart-4/10 border-chart-4/20 text-chart-4"
      }`}
    >
      {isLive ? (
        <>
          <Radio className="w-3 h-3" />
          <span>Live Data</span>
        </>
      ) : (
        <>
          <CircleDot className="w-3 h-3" />
          <span>Simulated</span>
        </>
      )}
    </div>
  );
}

function ServiceCard({
  service,
  isLive,
}: {
  service: ServiceHealth;
  isLive: boolean;
}) {
  const content = (
    <div className="flex items-center gap-2 px-4 py-2.5 bg-card border border-border rounded-xl text-xs text-foreground hover:border-primary/30 transition-all">
      <div className="relative">
        <span className="text-lg">
          {service.id === "kohya"
            ? "\uD83D\uDD2C"
            : "\uD83C\uDFAC"}
        </span>
        <div
          className={`absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border border-card ${
            service.running ? "bg-chart-2" : "bg-muted-foreground/30"
          }`}
        />
      </div>
      <div>
        <div className="text-foreground flex items-center gap-1.5">
          {service.name}
          {!isLive && (
            <span className="text-[9px] px-1 py-0.5 rounded bg-chart-4/10 text-chart-4">
              sim
            </span>
          )}
        </div>
        <div className="text-muted-foreground text-[10px]">
          {service.running
            ? service.port
              ? `Port ${service.port}`
              : "Running (CLI)"
            : "Not detected"}
        </div>
      </div>
      {service.url && service.running && (
        <ExternalLink className="w-3.5 h-3.5 text-muted-foreground ml-2" />
      )}
    </div>
  );

  if (service.url && service.running) {
    return (
      <a href={service.url} target="_blank" rel="noopener noreferrer">
        {content}
      </a>
    );
  }
  return content;
}

function SourceTag({ source }: { source: string }) {
  const config: Record<string, { label: string; cls: string }> = {
    simulated: {
      label: "Simulated data",
      cls: "bg-chart-4/10 text-chart-4",
    },
    tensorboard: {
      label: "TensorBoard logs",
      cls: "bg-chart-2/10 text-chart-2",
    },
    process: {
      label: "Process detection",
      cls: "bg-primary/10 text-primary",
    },
    "config-file": {
      label: "TOML config",
      cls: "bg-primary/10 text-primary",
    },
    nvidia: {
      label: "nvidia-smi",
      cls: "bg-chart-2/10 text-chart-2",
    },
  };
  const c = config[source] || config.simulated;
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded ${c.cls}`}>
      {c.label}
    </span>
  );
}

function MiniStat({
  icon,
  label,
  value,
  color,
  source,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  color: string;
  source?: string;
}) {
  return (
    <div className="px-3 py-2.5 bg-secondary rounded-lg">
      <div className="flex items-center gap-1.5 mb-1">
        <span style={{ color }}>{icon}</span>
        <span className="text-[10px] text-muted-foreground">{label}</span>
        {source && <SourceTag source={source} />}
      </div>
      <div
        className="text-sm text-foreground"
        style={{ fontFamily: "'JetBrains Mono', monospace" }}
      >
        {value}
      </div>
    </div>
  );
}

function ConfigItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-muted-foreground mb-1">{label}</div>
      <div
        className="text-foreground"
        style={{ fontFamily: "'JetBrains Mono', monospace" }}
      >
        {value}
      </div>
    </div>
  );
}

function TrainingStatusBadge({ status }: { status: string }) {
  const config: Record<
    string,
    { icon: typeof CheckCircle2; text: string; cls: string }
  > = {
    running: {
      icon: Loader2,
      text: "Training",
      cls: "bg-chart-2/15 text-chart-2",
    },
    completed: {
      icon: CheckCircle2,
      text: "Done",
      cls: "bg-chart-2/15 text-chart-2",
    },
    paused: {
      icon: Pause,
      text: "Paused",
      cls: "bg-chart-4/15 text-chart-4",
    },
    failed: {
      icon: AlertTriangle,
      text: "Failed",
      cls: "bg-destructive/15 text-destructive",
    },
  };
  const c = config[status] || config.completed;
  return (
    <span
      className={`flex items-center gap-1 px-2 py-1 rounded-md text-[10px] ${c.cls}`}
    >
      <c.icon
        className={`w-3 h-3 ${status === "running" ? "animate-spin" : ""}`}
      />
      {c.text}
    </span>
  );
}

/** Shows developers exactly how to wire up the backend for this specific job */
function IntegrationGuidePanel({ job }: { job: TrainingJob }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="bg-card border border-chart-4/20 rounded-xl p-5">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center justify-between w-full text-left"
      >
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-chart-4" />
          <h3 className="text-sm text-foreground">
            Backend Integration Guide
          </h3>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-chart-4/10 text-chart-4">
            Dev Reference
          </span>
        </div>
        <span className="text-xs text-muted-foreground">
          {expanded ? "Collapse" : "Show how to connect this live"}
        </span>
      </button>

      {expanded && (
        <div className="mt-4 space-y-4">
          {/* How this job would be detected */}
          <div className="space-y-2">
            <div className="text-xs text-foreground flex items-center gap-1.5">
              <Activity className="w-3 h-3 text-primary" />
              Step 1: Process Detection
            </div>
            <pre
              className="text-[11px] text-muted-foreground p-3 bg-secondary rounded-lg overflow-x-auto"
              style={{ fontFamily: "'JetBrains Mono', monospace" }}
            >
              {job.tool === "kohya"
                ? `# Kohya SS runs via accelerate:
import psutil

for proc in psutil.process_iter(['pid', 'cmdline']):
    cmd = ' '.join(proc.info['cmdline'] or [])
    if 'accelerate' in cmd and 'train_network.py' in cmd:
        # Found a Kohya training process!
        # Parse --config_file to find the TOML config
        config_path = extract_arg(cmd, '--config_file')
        # → ${job.configPath || "path/to/config.toml"}`
                : `# Musubi Tuner runs via python directly:
import psutil

for proc in psutil.process_iter(['pid', 'cmdline']):
    cmd = ' '.join(proc.info['cmdline'] or [])
    if 'musubi' in cmd and 'train' in cmd:
        # Found a Musubi training process!
        config_path = extract_arg(cmd, '--config_file')
        # → ${job.configPath || "path/to/config.toml"}`}
            </pre>
          </div>

          <div className="space-y-2">
            <div className="text-xs text-foreground flex items-center gap-1.5">
              <FileCode className="w-3 h-3 text-primary" />
              Step 2: Read TOML Config
            </div>
            <pre
              className="text-[11px] text-muted-foreground p-3 bg-secondary rounded-lg overflow-x-auto"
              style={{ fontFamily: "'JetBrains Mono', monospace" }}
            >
              {`import tomli

with open(config_path, "rb") as f:
    config = tomli.load(f)

# Key fields to extract:
# config["output_name"]       → "${job.name.split(" - ")[0]}"
# config["pretrained_model"]  → "${job.model}"
# config["train_data_dir"]    → dataset path
# config["resolution"]        → ${job.resolution}
# config["train_batch_size"]  → ${job.batchSize}
# config["max_train_epochs"]  → ${job.totalEpochs}
# config["learning_rate"]     → ${job.learningRate}
# config["logging_dir"]       → TensorBoard log path`}
            </pre>
          </div>

          <div className="space-y-2">
            <div className="text-xs text-foreground flex items-center gap-1.5">
              <BarChart3 className="w-3 h-3 text-primary" />
              Step 3: Read TensorBoard Loss Curve
            </div>
            <pre
              className="text-[11px] text-muted-foreground p-3 bg-secondary rounded-lg overflow-x-auto"
              style={{ fontFamily: "'JetBrains Mono', monospace" }}
            >
              {`from tbparse import SummaryReader

reader = SummaryReader("${job.tensorboardLogDir || "path/to/logs"}")
loss_df = reader.scalars
loss_data = loss_df[loss_df.tag == "loss"]

# Returns list of { step, loss } for the chart
history = [
    {"step": row.step, "loss": row.value}
    for _, row in loss_data.iterrows()
]`}
            </pre>
          </div>

          <div className="space-y-2">
            <div className="text-xs text-foreground flex items-center gap-1.5">
              <Zap className="w-3 h-3 text-primary" />
              Step 4: GPU Stats (pynvml)
            </div>
            <pre
              className="text-[11px] text-muted-foreground p-3 bg-secondary rounded-lg overflow-x-auto"
              style={{ fontFamily: "'JetBrains Mono', monospace" }}
            >
              {`import pynvml

pynvml.nvmlInit()
handle = pynvml.nvmlDeviceGetHandleByIndex(0)

util = pynvml.nvmlDeviceGetUtilizationRates(handle)
mem  = pynvml.nvmlDeviceGetMemoryInfo(handle)

gpu_usage = util.gpu          # → ${job.gpuUsage.toFixed(0)}%
vram_used = mem.used / 1e9    # → ${job.vramUsage.toFixed(1)} GB
vram_total = mem.total / 1e9  # → 32.0 GB (RTX 5090)`}
            </pre>
          </div>

          <div className="flex items-start gap-3 px-4 py-3 bg-chart-2/5 border border-chart-2/15 rounded-xl">
            <CheckCircle2 className="w-4 h-4 text-chart-2 mt-0.5 shrink-0" />
            <div>
              <div className="text-xs text-foreground">
                Ready to connect — zero frontend changes needed
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">
                The service layer at{" "}
                <code
                  className="text-primary"
                  style={{
                    fontFamily: "'JetBrains Mono', monospace",
                  }}
                >
                  /services/trainingService.ts
                </code>{" "}
                auto-detects Tauri and routes to{" "}
                <code
                  className="text-primary"
                  style={{
                    fontFamily: "'JetBrains Mono', monospace",
                  }}
                >
                  GET /api/training/jobs
                </code>
                . Just implement the FastAPI endpoint and the UI switches to
                live data automatically.
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TensorBoardButton({
  tbStatus,
  tbLaunching,
  onLaunch,
  onStop,
}: {
  tbStatus: TensorBoardStatus | null;
  tbLaunching: boolean;
  onLaunch: () => void;
  onStop: () => void;
}) {
  const isRunning = tbStatus?.state === "running";

  if (isRunning) {
    return (
      <a
        href="http://localhost:6006"
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-chart-2/10 text-chart-2 hover:bg-chart-2/20 transition-colors"
        title="TensorBoard is running — click to open"
      >
        <div className="relative">
          <BarChart3 className="w-3.5 h-3.5" />
          <div className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-chart-2" />
        </div>
        TensorBoard
        <ExternalLink className="w-2.5 h-2.5" />
      </a>
    );
  }

  return (
    <button
      onClick={onLaunch}
      disabled={tbLaunching}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-secondary text-muted-foreground hover:text-foreground hover:bg-secondary/80 transition-colors disabled:opacity-50"
      title="Launch TensorBoard for this job's log directory"
    >
      {tbLaunching ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
      ) : (
        <BarChart3 className="w-3.5 h-3.5" />
      )}
      TensorBoard
    </button>
  );
}

function TensorBoardPanel({
  logdir,
  tbStatus,
  tbLaunching,
  tbPanelOpen,
  tbCopied,
  hasTauri,
  isLive,
  onLaunch,
  onStop,
  onCopy,
  onTogglePanel,
}: {
  logdir: string;
  tbStatus: TensorBoardStatus | null;
  tbLaunching: boolean;
  tbPanelOpen: boolean;
  tbCopied: boolean;
  hasTauri: boolean;
  isLive: boolean;
  onLaunch: () => void;
  onStop: () => void;
  onCopy: () => void;
  onTogglePanel: () => void;
}) {
  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-primary" />
          <h3 className="text-sm text-foreground">
            TensorBoard Control
          </h3>
        </div>
        <SourceTag
          source={isLive ? "tensorboard" : "simulated"}
        />
      </div>
      <div className="flex items-center gap-3">
        {tbStatus?.state === "running" ? (
          <button
            onClick={onStop}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-red-500 text-white hover:bg-red-600 transition-colors"
          >
            <Square className="w-3.5 h-3.5" /> Stop TensorBoard
          </button>
        ) : (
          <button
            onClick={onLaunch}
            disabled={tbLaunching}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-green-500 text-white hover:bg-green-600 transition-colors disabled:opacity-50"
          >
            {tbLaunching ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Launching...
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5" /> Launch TensorBoard
              </>
            )}
          </button>
        )}
        {tbStatus?.state === "running" && (
          <a
            href="http://localhost:6006"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-secondary text-foreground hover:bg-secondary/80 transition-colors"
          >
            <BarChart3 className="w-3.5 h-3.5" /> Open TensorBoard
          </a>
        )}
        {tbPanelOpen && (
          <div className="flex items-center gap-3 px-4 py-3 bg-chart-2/5 border border-chart-2/15 rounded-xl">
            <CheckCircle2 className="w-4 h-4 text-chart-2 mt-0.5 shrink-0" />
            <div>
              <div className="text-xs text-foreground">
                TensorBoard command
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">
                <code
                  className="text-primary"
                  style={{
                    fontFamily: "'JetBrains Mono', monospace",
                  }}
                >
                  {getTensorBoardCommand(logdir)}
                </code>
                <button
                  onClick={onCopy}
                  className="ml-2 px-1.5 py-0.5 rounded bg-chart-2/10 text-chart-2 hover:bg-chart-2/20 transition-colors"
                >
                  {tbCopied ? (
                    <Check className="w-3.5 h-3.5" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}