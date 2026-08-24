// ============================================================
// QuickLauncher — Launch AI tools with configurable flags
// ============================================================
// Supports: ComfyUI, SwarmUI, Kohya SS, Musubi Tuner
// Features: categorized flags, live command preview, download .bat,
//           save/load defaults (localStorage), presets, custom flags

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  Play,
  Download,
  Copy,
  Check,
  ChevronDown,
  ChevronRight,
  Save,
  RotateCcw,
  FolderOpen,
  Terminal,
  Rocket,
  Eye,
  Globe,
  Bug,
  Gauge,
  Brain,
  Crosshair,
  Cpu,
  Layers,
  Sparkles,
  Monitor as MonitorIcon,
  Server,
  Settings2,
  Zap,
  Square,
  RefreshCw,
  Wifi,
  WifiOff,
  Clock,
  Activity,
  Loader2,
  ExternalLink,
  Trash2,
} from "lucide-react";
import { Button } from "./ui/button";
import { downloadFile } from "../services/aiService";
import { isTauriEnv, getApiBase } from "../services/env";
import { TOOL_REGISTRY } from "../services/toolsRegistry";
import { useHealthMonitor } from "../hooks/useHealthMonitor";
import { useLauncherBridge } from "../hooks/useLauncherBridge";
import { toast } from "sonner";

// ============================================================
// Types
// ============================================================

interface LaunchFlag {
  id: string;
  flag: string;
  label: string;
  description: string;
  default: boolean;
  category: string;
  /** If the flag takes a value, this is the default value */
  value?: string;
  /** Whether this flag needs a value input */
  hasValue?: boolean;
  rtx5090Note?: string;
}

interface LaunchPreset {
  id: string;
  label: string;
  description: string;
  color: string;
  flags: Record<string, boolean>;
  values?: Record<string, string>;
}

interface ToolLaunchConfig {
  id: string;
  name: string;
  icon: typeof Cpu;
  color: string;
  defaultPath: string;
  pathHint: string;
  executable: string;
  venvActivate: string;
  flags: LaunchFlag[];
  presets: LaunchPreset[];
  categories: { key: string; label: string; icon: typeof Zap; color: string }[];
  port: number;
}

// ============================================================
// Tool Definitions
// ============================================================

const COMFYUI_CONFIG: ToolLaunchConfig = {
  id: "comfyui",
  name: TOOL_REGISTRY.comfyui.name,
  icon: Layers,
  color: TOOL_REGISTRY.comfyui.color,
  defaultPath: TOOL_REGISTRY.comfyui.defaultPath,
  pathHint: "The folder containing main.py and the venv folder",
  executable: "python main.py",
  venvActivate: "call venv\\Scripts\\activate.bat",
  port: TOOL_REGISTRY.comfyui.port,
  categories: [
    { key: "performance", label: "Performance", icon: Zap, color: "#ffd93d" },
    { key: "precision", label: "Precision (FP8)", icon: Crosshair, color: "#ff6b6b" },
    { key: "memory", label: "Memory", icon: Brain, color: "#6d5aff" },
    { key: "network", label: "Network", icon: Globe, color: "#4ecdc4" },
    { key: "preview", label: "Preview", icon: Eye, color: "#00d4aa" },
    { key: "debug", label: "Debug", icon: Bug, color: "#888" },
  ],
  flags: [
    // Performance
    { id: "fast", flag: "--fast", label: "--fast", description: "FP8 fast math + optimized kernels for RTX 30/40/50 series", default: true, category: "performance", rtx5090Note: "Essential for Blackwell" },
    { id: "cuda_malloc", flag: "--cuda-malloc", label: "--cuda-malloc", description: "Async CUDA memory allocation — faster on NVIDIA GPUs", default: true, category: "performance" },
    { id: "channels_last", flag: "--force-channels-last", label: "--force-channels-last", description: "NHWC memory layout — 10-20% speedup on Tensor Cores", default: true, category: "performance" },
    { id: "pytorch_cross_attn", flag: "--use-pytorch-cross-attention", label: "--use-pytorch-cross-attention", description: "Native PyTorch attention with Flash Attention support", default: true, category: "performance" },
    // Precision
    { id: "fp8_unet", flag: "--fp8_e4m3fn-unet", label: "--fp8_e4m3fn-unet", description: "Run UNet/DiT in FP8 — ~50% less VRAM, native on Blackwell", default: true, category: "precision", rtx5090Note: "Native FP8 on RTX 5090" },
    { id: "fp8_text", flag: "--fp8_e4m3fn-text-enc", label: "--fp8_e4m3fn-text-enc", description: "Run CLIP/T5 text encoders in FP8 — saves 4-5 GB VRAM", default: true, category: "precision" },
    // Memory
    { id: "highvram", flag: "--highvram", label: "--highvram", description: "Keep all models in VRAM — no loading delays", default: true, category: "memory", rtx5090Note: "Recommended with 32GB VRAM" },
    { id: "disable_smart_mem", flag: "--disable-smart-memory", label: "--disable-smart-memory", description: "Skip model offloading logic — not needed with 24+ GB", default: true, category: "memory" },
    { id: "reserve_vram", flag: "--reserve-vram", label: "--reserve-vram", description: "Reserve N GB for system — more VRAM for models", default: false, category: "memory", hasValue: true, value: "0.5" },
    // Network
    { id: "listen", flag: "--listen", label: "--listen", description: "Accept connections from other devices on network", default: true, category: "network", hasValue: true, value: "0.0.0.0" },
    { id: "cors", flag: "--enable-cors-header", label: "--enable-cors-header", description: "Allow web apps to communicate with ComfyUI API", default: true, category: "network" },
    { id: "port", flag: "--port", label: "--port", description: "Port number for the web interface", default: true, category: "network", hasValue: true, value: "8188" },
    // Preview
    { id: "preview", flag: "--preview-method", label: "--preview-method", description: "Real-time image previews during generation (~2ms overhead)", default: true, category: "preview", hasValue: true, value: "taesd" },
    // Debug
    { id: "verbose", flag: "--verbose", label: "--verbose", description: "Verbose logging output", default: false, category: "debug" },
    { id: "cpu", flag: "--cpu", label: "--cpu", description: "CPU only mode — for testing without GPU", default: false, category: "debug" },
  ],
  presets: [
    {
      id: "rtx5090_max",
      label: "RTX 5090 Max Performance",
      description: "All optimizations enabled — maximum speed",
      color: "#ffd93d",
      flags: { fast: true, cuda_malloc: true, channels_last: true, pytorch_cross_attn: true, fp8_unet: true, fp8_text: true, highvram: true, disable_smart_mem: true, reserve_vram: false, listen: true, cors: true, port: true, preview: true, verbose: false, cpu: false },
    },
    {
      id: "safe",
      label: "Safe / Low VRAM",
      description: "Conservative — no FP8, no highvram",
      color: "#4ecdc4",
      flags: { fast: false, cuda_malloc: true, channels_last: true, pytorch_cross_attn: true, fp8_unet: false, fp8_text: false, highvram: false, disable_smart_mem: false, reserve_vram: false, listen: false, cors: false, port: true, preview: true, verbose: false, cpu: false },
    },
    {
      id: "remote",
      label: "Remote Access",
      description: "Network-accessible with CORS",
      color: "#6d5aff",
      flags: { fast: true, cuda_malloc: true, channels_last: true, pytorch_cross_attn: true, fp8_unet: true, fp8_text: true, highvram: true, disable_smart_mem: true, reserve_vram: false, listen: true, cors: true, port: true, preview: true, verbose: false, cpu: false },
    },
    {
      id: "debug",
      label: "Debug",
      description: "Verbose logging, minimal flags",
      color: "#888",
      flags: { fast: false, cuda_malloc: false, channels_last: false, pytorch_cross_attn: false, fp8_unet: false, fp8_text: false, highvram: false, disable_smart_mem: false, reserve_vram: false, listen: false, cors: false, port: true, preview: true, verbose: true, cpu: false },
    },
  ],
};

const SWARMUI_CONFIG: ToolLaunchConfig = {
  id: "swarmui",
  name: TOOL_REGISTRY.swarmui.name,
  icon: Sparkles,
  color: TOOL_REGISTRY.swarmui.color,
  defaultPath: TOOL_REGISTRY.swarmui.defaultPath,
  pathHint: "The folder containing launch-windows.bat",
  executable: "dotnet src/bin/Release/net8.0/StableSwarmUI.dll",
  venvActivate: "",
  port: TOOL_REGISTRY.swarmui.port,
  categories: [
    { key: "server", label: "Server", icon: Server, color: "#6d5aff" },
    { key: "backend", label: "Backend", icon: Settings2, color: "#00d4aa" },
    { key: "performance", label: "Performance", icon: Zap, color: "#ffd93d" },
    { key: "debug", label: "Debug", icon: Bug, color: "#888" },
  ],
  flags: [
    { id: "host", flag: "--host", label: "--host", description: "Listen on all network interfaces", default: true, category: "server", hasValue: true, value: "0.0.0.0" },
    { id: "port", flag: "--port", label: "--port", description: "Port for the web UI", default: true, category: "server", hasValue: true, value: "7801" },
    { id: "launch_mode", flag: "--launch-mode", label: "--launch-mode", description: "Browser launch behavior (web, none, electron)", default: false, category: "server", hasValue: true, value: "none" },
    { id: "comfyui_backend", flag: "--backends", label: "--backends", description: "Use ComfyUI as generation backend", default: true, category: "backend", hasValue: true, value: "comfyui" },
    { id: "no_vram_check", flag: "--no-vram-check", label: "--no-vram-check", description: "Skip VRAM check on startup", default: true, category: "performance" },
    { id: "verbose", flag: "--verbose", label: "--verbose", description: "Verbose logging output", default: false, category: "debug" },
  ],
  presets: [
    {
      id: "default",
      label: "Default RTX 5090",
      description: "Standard settings for RTX 5090",
      color: "#00d4aa",
      flags: { host: true, port: true, launch_mode: false, comfyui_backend: true, no_vram_check: true, verbose: false },
    },
    {
      id: "headless",
      label: "Headless Server",
      description: "No browser, network accessible",
      color: "#6d5aff",
      flags: { host: true, port: true, launch_mode: true, comfyui_backend: true, no_vram_check: true, verbose: false },
    },
  ],
};

const KOHYA_CONFIG: ToolLaunchConfig = {
  id: "kohya",
  name: TOOL_REGISTRY.kohya.name,
  icon: Sparkles,
  color: TOOL_REGISTRY.kohya.color,
  defaultPath: TOOL_REGISTRY.kohya.defaultPath,
  pathHint: "The folder containing kohya_gui.py",
  executable: "python kohya_gui.py",
  venvActivate: "call venv\\Scripts\\activate.bat",
  port: TOOL_REGISTRY.kohya.port,
  categories: [
    { key: "server", label: "Server", icon: Server, color: "#6d5aff" },
    { key: "training", label: "Training", icon: Gauge, color: "#ff6b6b" },
    { key: "debug", label: "Debug", icon: Bug, color: "#888" },
  ],
  flags: [
    { id: "listen", flag: "--listen", label: "--listen", description: "Address to listen on", default: true, category: "server", hasValue: true, value: "127.0.0.1" },
    { id: "port", flag: "--server_port", label: "--server_port", description: "Port for the training GUI", default: true, category: "server", hasValue: true, value: "7860" },
    { id: "headless", flag: "--headless", label: "--headless", description: "Don't auto-open browser window", default: false, category: "server" },
    { id: "inbrowser", flag: "--inbrowser", label: "--inbrowser", description: "Auto-open in default browser", default: true, category: "server" },
    { id: "share", flag: "--share", label: "--share", description: "Create a public Gradio share link", default: false, category: "server" },
    { id: "multi_gpu", flag: "--multi-gpu", label: "--multi-gpu", description: "Enable multi-GPU training support", default: false, category: "training" },
    { id: "verbose", flag: "--verbose", label: "--verbose", description: "Verbose logging output", default: false, category: "debug" },
    { id: "noverify", flag: "--noverify", label: "--noverify", description: "Skip environment setup verification", default: false, category: "debug" },
    { id: "debug", flag: "--debug", label: "--debug", description: "Debug mode with extra logging", default: false, category: "debug" },
  ],
  presets: [
    {
      id: "default",
      label: "Default Local",
      description: "Standard local GUI setup",
      color: "#ff6b6b",
      flags: { listen: true, port: true, headless: false, inbrowser: true, share: false, multi_gpu: false, verbose: false, noverify: false, debug: false },
    },
    {
      id: "headless_server",
      label: "Headless Server",
      description: "No browser, network accessible",
      color: "#6d5aff",
      flags: { listen: true, port: true, headless: true, inbrowser: false, share: false, multi_gpu: false, verbose: false, noverify: false, debug: false },
      values: { listen: "0.0.0.0" },
    },
  ],
};

const MUSUBI_CONFIG: ToolLaunchConfig = {
  id: "musubi",
  name: TOOL_REGISTRY.musubi.name,
  icon: MonitorIcon,
  color: TOOL_REGISTRY.musubi.color,
  defaultPath: TOOL_REGISTRY.musubi.defaultPath,
  pathHint: "The folder containing the training scripts",
  executable: "accelerate launch --mixed_precision bf16 --num_cpu_threads_per_process 1",
  venvActivate: "call venv\\Scripts\\activate.bat",
  port: 0, // Musubi has no web UI — override registry port
  categories: [
    { key: "accelerate", label: "Accelerate", icon: Rocket, color: "#6d5aff" },
    { key: "model", label: "Model", icon: Brain, color: "#ffd93d" },
    { key: "training", label: "Training", icon: Gauge, color: "#ff6b6b" },
    { key: "lora", label: "LoRA", icon: Crosshair, color: "#00d4aa" },
    { key: "performance", label: "Performance", icon: Zap, color: "#4ecdc4" },
  ],
  flags: [
    // Accelerate
    { id: "mixed_precision", flag: "--mixed_precision", label: "--mixed_precision", description: "Training precision mode", default: true, category: "accelerate", hasValue: true, value: "bf16" },
    { id: "num_cpu", flag: "--num_cpu_threads_per_process", label: "--num_cpu_threads_per_process", description: "CPU threads per process", default: true, category: "accelerate", hasValue: true, value: "1" },
    // Model
    { id: "task", flag: "--task", label: "--task", description: "Training task type (t2v, i2v)", default: true, category: "model", hasValue: true, value: "t2v" },
    { id: "dit", flag: "--dit", label: "--dit", description: "Path to DiT model file", default: false, category: "model", hasValue: true, value: "" },
    // Training
    { id: "gradient_checkpointing", flag: "--gradient_checkpointing", label: "--gradient_checkpointing", description: "Trade compute for VRAM — essential for video", default: true, category: "training" },
    { id: "cache_latents", flag: "--cache_latents", label: "--cache_latents", description: "Pre-compute and cache latents in memory", default: true, category: "training" },
    { id: "cache_latents_disk", flag: "--cache_latents_to_disk", label: "--cache_latents_to_disk", description: "Cache latents to disk — required for large video datasets", default: true, category: "training" },
    { id: "sdpa", flag: "--sdpa", label: "--sdpa", description: "Use Scaled Dot Product Attention", default: true, category: "training" },
    { id: "optimizer_type", flag: "--optimizer_type", label: "--optimizer_type", description: "Optimizer to use for training", default: true, category: "training", hasValue: true, value: "adamw8bit" },
    // LoRA
    { id: "network_dim", flag: "--network_dim", label: "--network_dim", description: "LoRA rank (dimension)", default: true, category: "lora", hasValue: true, value: "32" },
    { id: "network_alpha", flag: "--network_alpha", label: "--network_alpha", description: "LoRA alpha scaling factor", default: true, category: "lora", hasValue: true, value: "16" },
    // Performance
    { id: "max_workers", flag: "--max_data_loader_n_workers", label: "--max_data_loader_n_workers", description: "Data loader worker threads", default: true, category: "performance", hasValue: true, value: "4" },
    { id: "persistent_workers", flag: "--persistent_data_loader_workers", label: "--persistent_data_loader_workers", description: "Keep data loader workers alive between epochs", default: true, category: "performance" },
  ],
  presets: [
    {
      id: "wan21_lora",
      label: "Wan2.1 Video LoRA",
      description: "Optimized for Wan2.1-T2V LoRA training",
      color: "#ffd93d",
      flags: { mixed_precision: true, num_cpu: true, task: true, dit: false, gradient_checkpointing: true, cache_latents: true, cache_latents_disk: true, sdpa: true, optimizer_type: true, network_dim: true, network_alpha: true, max_workers: true, persistent_workers: true },
      values: { task: "t2v" },
    },
    {
      id: "minimal",
      label: "Minimal / Debug",
      description: "Minimal flags for testing",
      color: "#888",
      flags: { mixed_precision: true, num_cpu: true, task: true, dit: false, gradient_checkpointing: true, cache_latents: false, cache_latents_disk: false, sdpa: true, optimizer_type: true, network_dim: true, network_alpha: true, max_workers: false, persistent_workers: false },
    },
  ],
};

const ALL_TOOLS: ToolLaunchConfig[] = [COMFYUI_CONFIG, SWARMUI_CONFIG, KOHYA_CONFIG, MUSUBI_CONFIG];

// ============================================================
// localStorage helpers
// ============================================================

const STORAGE_KEY = "quicklauncher_defaults";

interface SavedDefaults {
  paths: Record<string, string>;
  flags: Record<string, Record<string, boolean>>;
  values: Record<string, Record<string, string>>;
  customFlags: Record<string, string>;
}

function loadDefaults(): SavedDefaults {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { paths: {}, flags: {}, values: {}, customFlags: {} };
}

function saveDefaults(defaults: SavedDefaults) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(defaults));
}

// ============================================================
// Tauri / Backend Integration
// ============================================================
// isTauriEnv() and getApiBase() imported from "../services/env"

type ProcessStatus = "stopped" | "starting" | "running" | "stopping" | "error";

interface ProcessState {
  status: ProcessStatus;
  pid?: number;
  startedAt?: number;
  error?: string;
  output: string[];
}

const STATUS_COLORS: Record<ProcessStatus, string> = {
  stopped: "#6b7280",
  starting: "#fbbf24",
  running: "#22c55e",
  stopping: "#f97316",
  error: "#ef4444",
};

const STATUS_LABELS: Record<ProcessStatus, string> = {
  stopped: "Stopped",
  starting: "Starting...",
  running: "Running",
  stopping: "Stopping...",
  error: "Error",
};

// checkPortHealth removed — now uses shared HealthMonitorProvider via useHealthMonitor()

/** Format uptime from a start timestamp */
function formatUptime(startedAt: number): string {
  const seconds = Math.floor((Date.now() - startedAt) / 1000);
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins < 60) return `${mins}m ${secs}s`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ${mins % 60}m`;
}

// ============================================================
// Process Output Terminal Sub-Component
// ============================================================

function ProcessTerminal({
  output,
  onClear,
  toolColor,
  maxLines = 200,
}: {
  output: string[];
  onClear: () => void;
  toolColor: string;
  maxLines?: number;
}) {
  const termRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(true);
  const [autoScroll, setAutoScroll] = useState(true);

  useEffect(() => {
    if (autoScroll && termRef.current) {
      termRef.current.scrollTop = termRef.current.scrollHeight;
    }
  }, [output, autoScroll]);

  const visibleLines = output.slice(-maxLines);

  return (
    <div className="rounded-xl border border-border bg-code-bg overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 bg-code-header border-b border-border">
        <button
          className="flex items-center gap-2 hover:opacity-80 transition-opacity"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? (
            <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
          )}
          <Activity className="w-3.5 h-3.5" style={{ color: toolColor }} />
          <span
            className="text-[11px] text-zinc-400"
            style={{ fontFamily: "'JetBrains Mono', monospace" }}
          >
            Process Output
          </span>
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">
            {output.length} lines
          </span>
        </button>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setAutoScroll(!autoScroll)}
            className={`px-1.5 py-0.5 rounded text-[9px] transition-colors ${
              autoScroll ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-foreground"
            }`}
            title={autoScroll ? "Auto-scroll ON" : "Auto-scroll OFF"}
          >
            {autoScroll ? "AUTO" : "SCROLL"}
          </button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={onClear}
            title="Clear output"
          >
            <Trash2 className="w-3 h-3 text-zinc-600" />
          </Button>
        </div>
      </div>
      {expanded && (
        <div
          ref={termRef}
          className="p-3 max-h-48 overflow-y-auto overflow-x-hidden"
          style={{ fontFamily: "'JetBrains Mono', monospace" }}
          onScroll={() => {
            if (termRef.current) {
              const { scrollTop, scrollHeight, clientHeight } = termRef.current;
              setAutoScroll(scrollHeight - scrollTop - clientHeight < 20);
            }
          }}
        >
          {visibleLines.length === 0 ? (
            <p className="text-[10px] text-zinc-600 italic">No output yet — launch a tool to see process output here</p>
          ) : (
            visibleLines.map((line, i) => {
              const isError = /error|fail|exception|traceback/i.test(line);
              const isWarning = /warn|deprecat/i.test(line);
              const isInfo = /\[info\]|starting|ready|loaded|listening/i.test(line);
              const color = isError ? "#ef4444" : isWarning ? "#fbbf24" : isInfo ? "#22c55e" : "#a1a1aa";
              return (
                <div key={i} className="text-[10px] leading-relaxed" style={{ color }}>
                  <span className="text-zinc-700 select-none mr-2">
                    {String(i + 1).padStart(3)}
                  </span>
                  {line}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================
// Status Bar Sub-Component
// ============================================================

function StatusBar({
  tool,
  processState,
  onHealthCheck,
  healthChecking,
  portAlive,
}: {
  tool: ToolLaunchConfig;
  processState: ProcessState;
  onHealthCheck: () => void;
  healthChecking: boolean;
  portAlive: boolean | null;
}) {
  const [uptime, setUptime] = useState("");

  useEffect(() => {
    if (processState.status !== "running" || !processState.startedAt) {
      setUptime("");
      return;
    }
    setUptime(formatUptime(processState.startedAt));
    const iv = setInterval(() => setUptime(formatUptime(processState.startedAt!)), 1000);
    return () => clearInterval(iv);
  }, [processState.status, processState.startedAt]);

  const statusColor = STATUS_COLORS[processState.status];

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-3">
          {/* Status dot with pulse */}
          <div className="relative">
            <div
              className="w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: statusColor }}
            />
            {(processState.status === "running" || processState.status === "starting") && (
              <div
                className="absolute inset-0 w-2.5 h-2.5 rounded-full animate-ping opacity-40"
                style={{ backgroundColor: statusColor }}
              />
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span
                className="text-xs"
                style={{ color: statusColor }}
              >
                {STATUS_LABELS[processState.status]}
              </span>
              {processState.pid && (
                <span className="text-[9px] text-muted-foreground" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                  PID {processState.pid}
                </span>
              )}
              {uptime && (
                <span className="flex items-center gap-1 text-[9px] text-muted-foreground">
                  <Clock className="w-2.5 h-2.5" />
                  {uptime}
                </span>
              )}
            </div>
            {processState.error && (
              <p className="text-[10px] text-red-400 mt-0.5">{processState.error}</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Port health indicator */}
          {tool.port > 0 && (
            <button
              onClick={onHealthCheck}
              className="flex items-center gap-1.5 px-2 py-1 rounded-lg border border-border/50 bg-secondary/30 hover:bg-secondary/50 transition-colors"
              title={`Check port ${tool.port}`}
              disabled={healthChecking}
            >
              {healthChecking ? (
                <Loader2 className="w-3 h-3 text-muted-foreground animate-spin" />
              ) : portAlive ? (
                <Wifi className="w-3 h-3 text-emerald-400" />
              ) : portAlive === false ? (
                <WifiOff className="w-3 h-3 text-zinc-500" />
              ) : (
                <Wifi className="w-3 h-3 text-muted-foreground" />
              )}
              <span className="text-[9px] text-muted-foreground" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                :{tool.port}
              </span>
            </button>
          )}

          {/* Open in browser */}
          {tool.port > 0 && portAlive && (
            <a
              href={`http://127.0.0.1:${tool.port}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 px-2 py-1 rounded-lg border border-border/50 bg-secondary/30 hover:bg-secondary/50 transition-colors text-[9px] text-muted-foreground hover:text-foreground"
            >
              <ExternalLink className="w-3 h-3" />
              Open UI
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Main QuickLauncher Component
// ============================================================

export function QuickLauncher() {
  const [activeTool, setActiveTool] = useState<string>("comfyui");
  const tool = ALL_TOOLS.find((t) => t.id === activeTool) || COMFYUI_CONFIG;
  const hasTauri = isTauriEnv();
  const bridge = useLauncherBridge();

  // ── Consume pending tool from bridge (cross-page navigation) ──
  useEffect(() => {
    if (bridge.pendingTool) {
      const exists = ALL_TOOLS.find((t) => t.id === bridge.pendingTool);
      if (exists) {
        setActiveTool(bridge.pendingTool);
      }
      bridge.clearPending();
    }
  }, [bridge.pendingTool, bridge]);

  // State
  const [paths, setPaths] = useState<Record<string, string>>(() => {
    const saved = loadDefaults();
    const p: Record<string, string> = {};
    for (const t of ALL_TOOLS) {
      p[t.id] = saved.paths[t.id] || t.defaultPath;
    }
    return p;
  });

  const [flagStates, setFlagStates] = useState<Record<string, Record<string, boolean>>>(() => {
    const saved = loadDefaults();
    const fs: Record<string, Record<string, boolean>> = {};
    for (const t of ALL_TOOLS) {
      fs[t.id] = {};
      for (const f of t.flags) {
        fs[t.id][f.id] = saved.flags[t.id]?.[f.id] ?? f.default;
      }
    }
    return fs;
  });

  const [flagValues, setFlagValues] = useState<Record<string, Record<string, string>>>(() => {
    const saved = loadDefaults();
    const fv: Record<string, Record<string, string>> = {};
    for (const t of ALL_TOOLS) {
      fv[t.id] = {};
      for (const f of t.flags) {
        if (f.hasValue) {
          fv[t.id][f.id] = saved.values[t.id]?.[f.id] ?? f.value ?? "";
        }
      }
    }
    return fv;
  });

  const [customFlags, setCustomFlags] = useState<Record<string, string>>(() => {
    const saved = loadDefaults();
    const cf: Record<string, string> = {};
    for (const t of ALL_TOOLS) {
      cf[t.id] = saved.customFlags[t.id] || "";
    }
    return cf;
  });

  const [expandedCats, setExpandedCats] = useState<Set<string>>(() => {
    return new Set(tool.categories.map((c) => c.key));
  });

  const [copied, setCopied] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);
  const [platform, setPlatform] = useState<"windows" | "linux">("windows");

  // ---- Process management state ----
  const [processStates, setProcessStates] = useState<Record<string, ProcessState>>(() => {
    const ps: Record<string, ProcessState> = {};
    for (const t of ALL_TOOLS) {
      ps[t.id] = { status: "stopped", output: [] };
    }
    return ps;
  });
  const sseRef = useRef<Record<string, EventSource>>({});

  // ── Shared health context (replaces private checkPortHealth + polling) ──
  const health = useHealthMonitor();

  // Derive portAlive and healthChecking from shared context
  const portAliveState: Record<string, boolean | null> = useMemo(() => {
    const m: Record<string, boolean | null> = {};
    for (const t of ALL_TOOLS) {
      const hr = health.results[t.id];
      m[t.id] = hr ? (hr.status === "checking" ? null : hr.status === "running") : null;
    }
    return m;
  }, [health.results]);

  const healthCheckingState: Record<string, boolean> = useMemo(() => {
    const m: Record<string, boolean> = {};
    for (const t of ALL_TOOLS) {
      m[t.id] = health.scanning;
    }
    return m;
  }, [health.scanning]);

  const currentProcess = processStates[tool.id] || { status: "stopped" as ProcessStatus, output: [] };

  // Sync process status from shared health results
  useEffect(() => {
    for (const t of ALL_TOOLS) {
      const hr = health.results[t.id];
      if (hr && hr.status === "running") {
        setProcessStates((prev) => {
          const ps = prev[t.id];
          if (ps && ps.status === "stopped") {
            return { ...prev, [t.id]: { ...ps, status: "running", startedAt: ps.startedAt || Date.now() } };
          }
          return prev;
        });
      }
    }
  }, [health.results]);

  // Manual re-check uses shared context
  const runHealthCheck = useCallback(async (toolId: string, _port: number) => {
    await health.refreshTool(toolId);
  }, [health]);

  // Cleanup SSE on unmount
  useEffect(() => {
    return () => {
      Object.values(sseRef.current).forEach((es) => es.close());
    };
  }, []);

  const isRunning = currentProcess.status === "running" || currentProcess.status === "starting";
  const isStopping = currentProcess.status === "stopping";

  // Expand all categories when switching tools
  useEffect(() => {
    setExpandedCats(new Set(tool.categories.map((c) => c.key)));
  }, [tool]);

  // Toggle helpers
  const toggleFlag = (flagId: string) => {
    setFlagStates((prev) => ({
      ...prev,
      [tool.id]: { ...prev[tool.id], [flagId]: !prev[tool.id][flagId] },
    }));
  };

  const setFlagValue = (flagId: string, value: string) => {
    setFlagValues((prev) => ({
      ...prev,
      [tool.id]: { ...prev[tool.id], [flagId]: value },
    }));
  };

  const toggleCategory = (catKey: string) => {
    setExpandedCats((prev) => {
      const next = new Set(prev);
      if (next.has(catKey)) next.delete(catKey);
      else next.add(catKey);
      return next;
    });
  };

  const enableAll = () => {
    setFlagStates((prev) => {
      const next = { ...prev, [tool.id]: { ...prev[tool.id] } };
      for (const f of tool.flags) next[tool.id][f.id] = true;
      return next;
    });
  };

  const disableAll = () => {
    setFlagStates((prev) => {
      const next = { ...prev, [tool.id]: { ...prev[tool.id] } };
      for (const f of tool.flags) next[tool.id][f.id] = false;
      return next;
    });
  };

  const applyPreset = (preset: LaunchPreset) => {
    setFlagStates((prev) => ({
      ...prev,
      [tool.id]: { ...prev[tool.id], ...preset.flags },
    }));
    if (preset.values) {
      setFlagValues((prev) => ({
        ...prev,
        [tool.id]: { ...prev[tool.id], ...preset.values },
      }));
    }
  };

  const enabledCount = useMemo(() => {
    return tool.flags.filter((f) => flagStates[tool.id]?.[f.id]).length;
  }, [tool, flagStates]);

  const catEnabledCount = useCallback(
    (catKey: string) => {
      return tool.flags.filter((f) => f.category === catKey && flagStates[tool.id]?.[f.id]).length;
    },
    [tool, flagStates]
  );

  const catTotalCount = useCallback(
    (catKey: string) => {
      return tool.flags.filter((f) => f.category === catKey).length;
    },
    [tool]
  );

  // Build command string
  const buildCommand = useCallback(() => {
    const parts: string[] = [];
    for (const f of tool.flags) {
      if (!flagStates[tool.id]?.[f.id]) continue;
      if (f.hasValue) {
        const val = flagValues[tool.id]?.[f.id] ?? f.value ?? "";
        if (val) parts.push(`${f.flag} ${val}`);
      } else {
        parts.push(f.flag);
      }
    }
    const custom = customFlags[tool.id]?.trim();
    if (custom) parts.push(custom);
    return parts.join(" ");
  }, [tool, flagStates, flagValues, customFlags]);

  const fullCommand = useMemo(() => {
    const flagStr = buildCommand();
    return `${tool.executable}${flagStr ? " " + flagStr : ""}`;
  }, [tool, buildCommand]);

  // Generate .bat content
  const generateBat = useCallback(() => {
    const path = paths[tool.id];
    const flagStr = buildCommand();
    const lines: string[] = [];
    lines.push("@echo off");
    lines.push(`:: ${tool.name} Launcher — Generated by Pipeline CMS`);
    lines.push(`:: RTX 5090 Optimized — ${new Date().toISOString().split("T")[0]}`);
    lines.push("");
    lines.push(`cd /d "${path}"`);
    if (tool.venvActivate) {
      lines.push(tool.venvActivate);
    }
    lines.push("");
    lines.push(`echo [INFO] Starting ${tool.name}...`);
    lines.push(`echo [INFO] Flags: ${flagStr || "(none)"}`);
    lines.push("");

    // Multi-line for readability
    if (flagStr) {
      const flagParts = flagStr.split(" ");
      let currentLine = tool.executable;
      const batLines: string[] = [];

      for (const part of flagParts) {
        if ((currentLine + " " + part).length > 80 && currentLine !== tool.executable) {
          batLines.push(currentLine + " ^");
          currentLine = "  " + part;
        } else {
          currentLine += " " + part;
        }
      }
      batLines.push(currentLine);
      lines.push(...batLines);
    } else {
      lines.push(tool.executable);
    }

    lines.push("");
    lines.push("if errorlevel 1 (");
    lines.push(`    echo [ERROR] ${tool.name} exited with an error!`);
    lines.push("    pause");
    lines.push(")");
    return lines.join("\n");
  }, [tool, paths, buildCommand]);

  const generateSh = useCallback(() => {
    const path = paths[tool.id];
    const flagStr = buildCommand();
    const lines: string[] = [];
    lines.push("#!/bin/bash");
    lines.push(`# ${tool.name} Launcher — Generated by Pipeline CMS`);
    lines.push(`# RTX 5090 Optimized — ${new Date().toISOString().split("T")[0]}`);
    lines.push("");
    lines.push(`cd "${path}" || exit 1`);
    if (tool.venvActivate) {
      lines.push("source venv/bin/activate");
    }
    lines.push("");
    lines.push(`echo "[INFO] Starting ${tool.name}..."`);
    lines.push("");
    lines.push(`${tool.executable}${flagStr ? " \\\\" : ""}`);
    if (flagStr) {
      const parts = flagStr.split(" ");
      for (let i = 0; i < parts.length; i++) {
        const end = i < parts.length - 1 ? " \\\\" : "";
        lines.push(`  ${parts[i]}${end}`);
      }
    }
    lines.push("");
    return lines.join("\n");
  }, [tool, paths, buildCommand]);

  // Save defaults
  const handleSave = () => {
    saveDefaults({ paths, flags: flagStates, values: flagValues, customFlags });
    setSavedNotice(true);
    setTimeout(() => setSavedNotice(false), 2000);
  };

  // Reset to tool defaults
  const handleReset = () => {
    setFlagStates((prev) => {
      const next = { ...prev, [tool.id]: {} as Record<string, boolean> };
      for (const f of tool.flags) next[tool.id][f.id] = f.default;
      return next;
    });
    setFlagValues((prev) => {
      const next = { ...prev, [tool.id]: {} as Record<string, string> };
      for (const f of tool.flags) {
        if (f.hasValue) next[tool.id][f.id] = f.value ?? "";
      }
      return next;
    });
    setCustomFlags((prev) => ({ ...prev, [tool.id]: "" }));
    setPaths((prev) => ({ ...prev, [tool.id]: tool.defaultPath }));
  };

  // Copy command
  const handleCopy = () => {
    navigator.clipboard.writeText(fullCommand);
    setCopied(true);
    toast.success("Command copied to clipboard");
    setTimeout(() => setCopied(false), 1500);
  };

  // Download
  const handleDownload = () => {
    if (platform === "windows") {
      downloadFile(`launch_${tool.id}.bat`, generateBat());
    } else {
      downloadFile(`launch_${tool.id}.sh`, generateSh());
    }
  };

  // ---- Launch via Tauri backend ----
  const handleLaunch = useCallback(async () => {
    const toolId = tool.id;
    setProcessStates((prev) => ({
      ...prev,
      [toolId]: { status: "starting", output: [`[INFO] Launching ${tool.name}...`], startedAt: Date.now() },
    }));

    if (hasTauri) {
      try {
        const res = await fetch(`${getApiBase()}/launcher/start`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tool_id: toolId, path: paths[toolId], command: fullCommand,
            venv_activate: tool.venvActivate, port: tool.port,
          }),
        });
        if (!res.ok) throw new Error(await res.text() || `HTTP ${res.status}`);
        const data = await res.json();
        const pid = data.pid || null;
        const streamId = data.stream_id;

        setProcessStates((prev) => ({
          ...prev,
          [toolId]: { ...prev[toolId], status: "starting", pid, output: [...prev[toolId].output, `[INFO] Process started (PID: ${pid})`] },
        }));

        if (streamId) {
          if (sseRef.current[toolId]) sseRef.current[toolId].close();
          const es = new EventSource(`${getApiBase()}/launcher/stream?stream_id=${streamId}`);
          sseRef.current[toolId] = es;
          es.addEventListener("output", (e) => {
            try {
              const d = JSON.parse(e.data);
              setProcessStates((prev) => ({ ...prev, [toolId]: { ...prev[toolId], status: "running", output: [...prev[toolId].output, d.text] } }));
            } catch {}
          });
          es.addEventListener("exit", (e) => {
            try {
              const d = JSON.parse(e.data);
              const code = d.exit_code ?? -1;
              setProcessStates((prev) => ({ ...prev, [toolId]: { ...prev[toolId], status: code === 0 ? "stopped" : "error", error: code !== 0 ? `Exited with code ${code}` : undefined, output: [...prev[toolId].output, `[EXIT] Process exited with code ${code}`] } }));
            } catch (parseErr) {
              console.warn("QuickLauncher: failed to parse exit event", parseErr);
            }
            es.close();
            delete sseRef.current[toolId];
          });
          es.onerror = () => { es.close(); delete sseRef.current[toolId]; };
        } else {
          setProcessStates((prev) => ({ ...prev, [toolId]: { ...prev[toolId], status: "running" } }));
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Failed to launch";
        setProcessStates((prev) => ({ ...prev, [toolId]: { ...prev[toolId], status: "error", error: msg, output: [...prev[toolId].output, `[ERROR] ${msg}`] } }));
        toast.error(`${tool.name}: ${msg}`);
      }
    } else {
      // Browser mode — simulated demo launch
      const mockOutput = [
        `[INFO] Working directory: ${paths[toolId]}`,
        tool.venvActivate ? `[INFO] Activating venv...` : null,
        `[INFO] Command: ${fullCommand}`,
        ``,
        `[DEMO] Simulated launch — install Tauri desktop app for real process control`,
        `[DEMO] Real-time SSE output would appear here in desktop mode`,
        ``,
        tool.port > 0 ? `[INFO] Would listen on port ${tool.port}` : `[INFO] Process started`,
        `[INFO] ${tool.name} ready`,
      ].filter(Boolean) as string[];

      let lineIdx = 0;
      const iv = setInterval(() => {
        if (lineIdx < mockOutput.length) {
          setProcessStates((prev) => ({
            ...prev,
            [toolId]: { ...prev[toolId], status: lineIdx > 3 ? "running" : "starting", pid: 12345 + Math.floor(Math.random() * 1000), output: [...prev[toolId].output, mockOutput[lineIdx]] },
          }));
          lineIdx++;
        } else {
          clearInterval(iv);
          setProcessStates((prev) => ({ ...prev, [toolId]: { ...prev[toolId], status: "running" } }));
        }
      }, 350);
    }
  }, [tool, paths, fullCommand, hasTauri]);

  // ---- Stop process ----
  const handleStop = useCallback(async () => {
    const toolId = tool.id;
    setProcessStates((prev) => ({ ...prev, [toolId]: { ...prev[toolId], status: "stopping" } }));
    if (hasTauri) {
      try {
        await fetch(`${getApiBase()}/launcher/stop`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tool_id: toolId }),
        });
      } catch (stopErr) {
        console.warn(`QuickLauncher: stop request failed for ${toolId}`, stopErr);
        toast.warning(`Could not reach backend while stopping ${tool.name}`);
      }
    }
    if (sseRef.current[toolId]) {
      sseRef.current[toolId].close();
      delete sseRef.current[toolId];
    }
    setTimeout(() => {
      setProcessStates((prev) => ({
        ...prev,
        [toolId]: { ...prev[toolId], status: "stopped", pid: undefined, error: undefined, output: [...prev[toolId].output, `[INFO] ${tool.name} stopped`] },
      }));
    }, hasTauri ? 100 : 600);
  }, [tool, hasTauri]);

  // ---- Clear output ----
  const handleClearOutput = useCallback(() => {
    setProcessStates((prev) => ({ ...prev, [tool.id]: { ...prev[tool.id], output: [] } }));
  }, [tool.id]);

  const ToolIcon = tool.icon;

  return (
    <div className="space-y-4">
      {/* Tool tabs */}
      <div className="flex items-center justify-between">
        <div className="flex gap-1 bg-card border border-border rounded-lg p-1">
          {ALL_TOOLS.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                onClick={() => setActiveTool(t.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs transition-colors ${
                  activeTool === t.id
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {t.name}
                {/* Status dot on tab */}
                {processStates[t.id]?.status === "running" && (
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                )}
                {processStates[t.id]?.status === "starting" && (
                  <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse" />
                )}
                {processStates[t.id]?.status === "error" && (
                  <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                )}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-1.5">
          {["RTX 5090 32GB", "CUDA 12.8", "Blackwell"].map((tag) => (
            <span
              key={tag}
              className="text-[9px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground"
            >
              {tag}
            </span>
          ))}
        </div>
      </div>

      {/* Path input */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-center gap-2 mb-2">
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{ backgroundColor: `${tool.color}15` }}
          >
            <ToolIcon className="w-4 h-4" style={{ color: tool.color }} />
          </div>
          <div>
            <h3 className="text-xs text-foreground">{tool.name} Installation Path</h3>
            <p className="text-[10px] text-muted-foreground">{tool.pathHint}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex-1 flex items-center gap-2 bg-secondary/50 border border-border rounded-lg px-3 py-2">
            <FolderOpen className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <input
              type="text"
              value={paths[tool.id]}
              onChange={(e) => setPaths((prev) => ({ ...prev, [tool.id]: e.target.value }))}
              className="flex-1 bg-transparent text-[12px] text-foreground focus:outline-none"
              style={{ fontFamily: "'JetBrains Mono', monospace" }}
              placeholder={tool.defaultPath}
            />
          </div>
        </div>
      </div>

      {/* Status bar */}
      <StatusBar
        tool={tool}
        processState={currentProcess}
        onHealthCheck={() => runHealthCheck(tool.id, tool.port)}
        healthChecking={healthCheckingState[tool.id] || false}
        portAlive={portAliveState[tool.id] ?? null}
      />

      {/* Presets */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[10px] text-muted-foreground uppercase tracking-wider mr-1">Presets:</span>
        {tool.presets.map((preset) => (
          <button
            key={preset.id}
            onClick={() => applyPreset(preset)}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-border/50 bg-secondary/30 hover:bg-secondary/60 hover:border-border transition-colors group"
            title={preset.description}
          >
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{ backgroundColor: preset.color }}
            />
            <span className="text-[11px] text-muted-foreground group-hover:text-foreground">
              {preset.label}
            </span>
          </button>
        ))}
        <span className="text-[9px] text-muted-foreground/40 mx-1">|</span>
        <button
          onClick={enableAll}
          className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
        >
          Enable all
        </button>
        <span className="text-[9px] text-muted-foreground/30">·</span>
        <button
          onClick={disableAll}
          className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
        >
          Disable all
        </button>
        <span className="text-[9px] text-muted-foreground/30">·</span>
        <span className="text-[10px] text-muted-foreground">
          <span style={{ color: tool.color }}>{enabledCount}</span> of {tool.flags.length} enabled
        </span>
      </div>

      {/* Flag categories */}
      <div className="space-y-2">
        {tool.categories.map((cat) => {
          const CatIcon = cat.icon;
          const catFlags = tool.flags.filter((f) => f.category === cat.key);
          if (catFlags.length === 0) return null;
          const expanded = expandedCats.has(cat.key);
          const enabled = catEnabledCount(cat.key);
          const total = catTotalCount(cat.key);

          return (
            <div key={cat.key} className="rounded-xl border border-border bg-card overflow-hidden">
              {/* Category header */}
              <button
                onClick={() => toggleCategory(cat.key)}
                className="flex items-center justify-between w-full px-4 py-2.5 hover:bg-secondary/30 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <CatIcon className="w-3.5 h-3.5" style={{ color: cat.color }} />
                  <span className="text-xs text-foreground">{cat.label}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className="text-[9px] px-1.5 py-0.5 rounded"
                    style={{
                      backgroundColor: `${cat.color}15`,
                      color: enabled === total ? cat.color : "var(--muted-foreground)",
                    }}
                  >
                    {enabled}/{total}
                  </span>
                  {expanded ? (
                    <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                  )}
                </div>
              </button>

              {/* Flags grid */}
              {expanded && (
                <div className="px-4 pb-4 pt-1 border-t border-border">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-2">
                    {catFlags.map((f) => {
                      const isEnabled = flagStates[tool.id]?.[f.id] ?? false;
                      return (
                        <div
                          key={f.id}
                          className={`rounded-lg border transition-all px-3 py-2.5 ${
                            isEnabled
                              ? "border-border bg-secondary/50"
                              : "border-border/30 bg-transparent opacity-60"
                          }`}
                        >
                          <label className="flex items-start gap-2.5 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={isEnabled}
                              onChange={() => toggleFlag(f.id)}
                              className="accent-[var(--primary)] w-3.5 h-3.5 rounded mt-0.5 shrink-0"
                            />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span
                                  className="text-[11px]"
                                  style={{
                                    fontFamily: "'JetBrains Mono', monospace",
                                    color: isEnabled ? tool.color : "var(--muted-foreground)",
                                  }}
                                >
                                  {f.label}
                                </span>
                                {f.rtx5090Note && isEnabled && (
                                  <span className="text-[8px] px-1 py-0.5 rounded bg-primary/10 text-primary">
                                    {f.rtx5090Note}
                                  </span>
                                )}
                              </div>
                              <p className="text-[10px] text-muted-foreground/70 mt-0.5 leading-relaxed">
                                {f.description}
                              </p>
                              {f.hasValue && isEnabled && (
                                <input
                                  type="text"
                                  value={flagValues[tool.id]?.[f.id] ?? ""}
                                  onChange={(e) => setFlagValue(f.id, e.target.value)}
                                  onClick={(e) => e.stopPropagation()}
                                  className="mt-1.5 w-full bg-background border border-border/50 rounded px-2 py-1 text-[11px] text-foreground focus:outline-none focus:border-primary/30"
                                  style={{ fontFamily: "'JetBrains Mono', monospace" }}
                                  placeholder={f.value}
                                />
                              )}
                            </div>
                          </label>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Custom flags */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-center gap-2 mb-2">
          <Terminal className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-xs text-foreground">Custom Flags</span>
          <span className="text-[10px] text-muted-foreground">(appended to command)</span>
        </div>
        <input
          type="text"
          value={customFlags[tool.id] || ""}
          onChange={(e) => setCustomFlags((prev) => ({ ...prev, [tool.id]: e.target.value }))}
          className="w-full bg-secondary/50 border border-border rounded-lg px-3 py-2 text-[12px] text-foreground focus:outline-none focus:border-primary/30 placeholder:text-muted-foreground/40"
          style={{ fontFamily: "'JetBrains Mono', monospace" }}
          placeholder="--extra-flag --another-flag value"
        />
      </div>

      {/* Command preview */}
      <div className="rounded-xl border border-border bg-code-bg overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2 bg-code-header border-b border-border">
          <div className="flex items-center gap-2">
            <Terminal className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-[11px] text-zinc-400" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
              Generated Command
            </span>
            <span
              className="text-[9px] px-1.5 py-0.5 rounded"
              style={{ backgroundColor: `${tool.color}15`, color: tool.color }}
            >
              {tool.name}
            </span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={handleCopy}
            title="Copy command"
          >
            {copied ? (
              <Check className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <Copy className="w-3.5 h-3.5 text-zinc-500" />
            )}
          </Button>
        </div>
        <div
          className="p-4 overflow-x-auto"
          style={{ fontFamily: "'JetBrains Mono', monospace" }}
        >
          <pre className="text-[11px] text-zinc-300 whitespace-pre-wrap break-all">
            <span className="text-zinc-600">{">"} </span>
            {fullCommand}
          </pre>
        </div>
      </div>

      {/* Process output terminal */}
      {currentProcess.output.length > 0 && (
        <ProcessTerminal
          output={currentProcess.output}
          onClear={handleClearOutput}
          toolColor={tool.color}
        />
      )}

      {/* Action bar */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Platform toggle */}
        <div className="flex bg-card border border-border rounded-lg p-0.5 mr-2">
          <button
            onClick={() => setPlatform("windows")}
            className={`px-2.5 py-1.5 rounded-md text-[11px] transition-colors ${
              platform === "windows"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Windows
          </button>
          <button
            onClick={() => setPlatform("linux")}
            className={`px-2.5 py-1.5 rounded-md text-[11px] transition-colors ${
              platform === "linux"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Linux
          </button>
        </div>

        <Button onClick={handleSave} variant="secondary" className="gap-1.5 text-xs h-9">
          {savedNotice ? (
            <Check className="w-3.5 h-3.5 text-emerald-400" />
          ) : (
            <Save className="w-3.5 h-3.5" />
          )}
          {savedNotice ? "Saved!" : "Save as Default"}
        </Button>

        <Button onClick={handleReset} variant="ghost" className="gap-1.5 text-xs h-9">
          <RotateCcw className="w-3.5 h-3.5" />
          Reset
        </Button>

        <div className="flex-1" />

        <Button
          onClick={handleDownload}
          variant="secondary"
          className="gap-1.5 text-xs h-9"
        >
          <Download className="w-3.5 h-3.5" />
          Download {platform === "windows" ? ".bat" : ".sh"}
        </Button>

        {isRunning || isStopping ? (
          <Button
            onClick={handleStop}
            variant="destructive"
            className="gap-1.5 text-xs h-9"
            disabled={isStopping}
          >
            {isStopping ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Square className="w-3.5 h-3.5" />
            )}
            {isStopping ? "Stopping..." : `Stop ${tool.name}`}
          </Button>
        ) : (
          <Button
            onClick={handleLaunch}
            className="gap-1.5 text-xs h-9"
            style={{ backgroundColor: tool.color }}
            disabled={currentProcess.status === "starting"}
          >
            {currentProcess.status === "starting" ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Play className="w-3.5 h-3.5" />
            )}
            {hasTauri ? `Launch ${tool.name}` : `Launch ${tool.name}`}
          </Button>
        )}

        {/* Restart shortcut */}
        {isRunning && (
          <Button
            onClick={async () => { await handleStop(); setTimeout(handleLaunch, 1000); }}
            variant="ghost"
            className="gap-1.5 text-xs h-9"
            title="Stop then relaunch"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </Button>
        )}
      </div>

      {/* Mode notice + Package link */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {hasTauri ? (
            <span className="flex items-center gap-1 text-[10px] text-emerald-400">
              <Wifi className="w-3 h-3" />
              Tauri desktop mode — full process control enabled
            </span>
          ) : (
            <span className="flex items-center gap-1 text-[10px] text-muted-foreground/50">
              <Globe className="w-3 h-3" />
              Browser mode — simulated launch (download .bat for real use, or install Tauri for full control)
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {!hasTauri && tool.port > 0 && portAliveState[tool.id] && (
            <span className="flex items-center gap-1 text-[10px] text-emerald-400">
              <Wifi className="w-3 h-3" />
              Port {tool.port} detected — {tool.name} is running externally
            </span>
          )}
          <button
            onClick={() => bridge.openPackage("rtx5090-core-setup")}
            className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-primary transition-colors"
            title="Install/update via Script Packages"
          >
            <Settings2 className="w-3 h-3" />
            Manage Packages
          </button>
        </div>
      </div>
    </div>
  );
}