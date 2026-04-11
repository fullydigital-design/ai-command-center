// ============================================================
// System Service — Abstraction layer for System Manager
// ============================================================
//
// RIGHT NOW:  Simulated data for UI prototype.
// MIGRATION:  Swap to FastAPI calls. Zero frontend changes.
//
// FastAPI endpoints this maps to:
//   GET    /api/system/specs              → getSystemSpecs()
//   GET    /api/system/gpu-stats          → getGPUStats()        ← NEW: pynvml real-time
//   GET    /api/system/processes          → getAIProcesses()     ← NEW: psutil process scan
//   GET    /api/system/disk-breakdown     → getDiskBreakdown()   ← NEW: model dir scanning
//   GET    /api/system/software           → getSoftwareVersions()
//   POST   /api/system/software/update    → runSoftwareUpdate()
//   GET    /api/system/cleanup            → getCleanupItems()
//   POST   /api/system/cleanup/run        → runCleanup()
//   GET    /api/system/env                → getEnvVars()
//   GET    /api/system/optimizations      → getOptimizations()
//   POST   /api/system/optimizations/apply → applyOptimization()
//   GET    /api/system/health-score       → getHealthScore()
//
// ─────────────────────────────────────────────────────────
// PYTHON BACKEND IMPLEMENTATION GUIDE
// ─────────────────────────────────────────────────────────
//
// Required pip packages:
//   pip install psutil pynvml wmi py-cpuinfo GPUtil packaging
//
// 1. SYSTEM SPECS (psutil + wmi + pynvml)
//    import wmi, psutil, pynvml
//    w = wmi.WMI()
//    cpu = w.Win32_Processor()[0]        → cpu.Name, cpu.NumberOfCores
//    gpu = w.Win32_VideoController()[0]  → gpu.Name, gpu.AdapterRAM
//    mem = psutil.virtual_memory()       → mem.total
//    disk = psutil.disk_usage('C:\\')    → disk.total, disk.used
//
// 2. GPU STATS (pynvml — polled every 2s)
//    pynvml.nvmlInit()
//    handle = pynvml.nvmlDeviceGetHandleByIndex(0)
//    mem_info = pynvml.nvmlDeviceGetMemoryInfo(handle)
//    util = pynvml.nvmlDeviceGetUtilizationRates(handle)
//    temp = pynvml.nvmlDeviceGetTemperature(handle, NVML_TEMPERATURE_GPU)
//    power = pynvml.nvmlDeviceGetPowerUsage(handle) / 1000  # mW → W
//    clock_gpu = pynvml.nvmlDeviceGetClockInfo(handle, NVML_CLOCK_GRAPHICS)
//    clock_mem = pynvml.nvmlDeviceGetClockInfo(handle, NVML_CLOCK_MEM)
//
// 3. AI PROCESSES (psutil)
//    for p in psutil.process_iter(['pid','name','cmdline','memory_info','cpu_percent']):
//      cmd = ' '.join(p.info['cmdline'] or [])
//      # Match known AI processes: python main.py (ComfyUI), train.py, etc.
//      # Read GPU memory per-process via pynvml.nvmlDeviceGetComputeRunningProcesses()
//
// 4. DISK BREAKDOWN (os + pathlib)
//    # Walk model directories, categorize by extension/path:
//    #   .safetensors/.ckpt → checkpoints / LoRAs (by parent dir name)
//    #   .gguf → quantized models
//    #   .pt/.bin → embeddings, VAEs
//    #   .mp4/.png → outputs
//
// 5. SOFTWARE VERSIONS (subprocess)
//    python_ver = subprocess.check_output(['python', '--version'])
//    # For PyTorch: python -c "import torch; print(torch.__version__)"
//    # For xformers: python -c "import xformers; print(xformers.__version__)"
//    # For triton: python -c "import triton; print(triton.__version__)"
//    # Compatibility check:
//    #   torch.version.cuda must match system CUDA (major.minor)
//    #   xformers version must be compatible with torch version
//
// 6. CLEANUP SCANNING (os + pathlib)
//    def dir_size(path):
//        return sum(f.stat().st_size for f in pathlib.Path(path).rglob('*') if f.is_file())
//
// 7. OPTIMIZATION CHECKS (winreg + subprocess)
//    # GPU Scheduling: HKLM\SYSTEM\CurrentControlSet\Control\GraphicsDrivers → HwSchMode
//    # Power Plan: subprocess powercfg /getactivescheme
//    # ReBAR: nvidia-smi --query-gpu=bar1.total --format=csv
//    # CUDA_VISIBLE_DEVICES, PYTORCH_CUDA_ALLOC_CONF, etc.
//
// ============================================================

import type { DataSource } from "./types";
import { shouldTryBackend } from "./env";
import { createService, createServiceAction } from "./createService";
import {
  mockSystemSpecs,
  mockGPUStats,
  mockAIProcesses,
  mockDiskBreakdown,
  mockSoftwareVersions,
  mockCleanupItems,
  mockEnvVars,
  mockOptimizations,
} from "./mocks/system.mock";

// --- Types ---

export interface SystemSpec {
  icon: string; // lucide icon name
  label: string;
  value: string;
  sub: string;
}

export interface GPUStats {
  vramUsedGB: number;
  vramTotalGB: number;
  vramPercent: number;
  gpuUtilPercent: number;
  memUtilPercent: number;
  tempC: number;
  powerW: number;
  powerLimitW: number;
  fanPercent: number;
  clockGpuMHz: number;
  clockMemMHz: number;
  clockMaxGpuMHz: number;
  clockMaxMemMHz: number;
  pcieGen: number;
  pcieLinkWidth: number;
  driverVersion: string;
  cudaVersion: string;
}

export interface AIProcess {
  pid: number;
  name: string;
  type: "generation" | "training" | "server" | "download" | "other";
  vramMB: number;
  ramMB: number;
  cpuPercent: number;
  uptime: string;
  status: "running" | "idle" | "loading";
}

export interface DiskCategory {
  label: string;
  sizeGB: number;
  color: string;
  count: number;
  path: string;
}

export interface SoftwareItem {
  name: string;
  currentVersion: string;
  latestVersion: string;
  hasUpdate: boolean;
  category: string;
  lastChecked: string;
  autoUpdate: boolean;
  critical: boolean;
  compatibility?: "ok" | "warning" | "error";
  compatNote?: string;
}

export interface CleanupItem {
  id: string;
  name: string;
  path: string;
  size: string;
  sizeBytes: number;
  type: "cache" | "temp" | "logs" | "orphan" | "duplicate" | "output";
  safe: boolean;
  selected: boolean;
  description?: string;
  lastAccessed?: string;
  exists?: boolean;
}

export interface EnvVar {
  key: string;
  value: string;
  ok: boolean;
  required: boolean;
  description?: string;
}

export interface OptimizationItem {
  id: string;
  title: string;
  desc: string;
  status: "enabled" | "pending" | "error";
  impact: "High" | "Medium" | "Low";
  category: "gpu" | "memory" | "storage" | "system" | "ai-stack";
  howTo?: string;
  currentValue?: string;
  recommendedValue?: string;
}

// ============================================================
// PUBLIC API
// ============================================================

export function getDataSource(): DataSource {
  return shouldTryBackend() ? "process" : "simulated";
}

/** Get hardware specs. Tauri: WMI + psutil + pynvml. */
export const getSystemSpecs = createService<SystemSpec[]>({
  backendPath: "/system/specs",
  mockData: mockSystemSpecs,
  label: "systemService.getSystemSpecs",
});

/** Get real-time GPU statistics. Tauri: pynvml polling. */
export const getGPUStats = createService<GPUStats>({
  backendPath: "/system/gpu-stats",
  mockData: mockGPUStats,
  label: "systemService.getGPUStats",
});

/** Get active AI processes. Tauri: psutil + pynvml process scan. */
export const getAIProcesses = createService<AIProcess[]>({
  backendPath: "/system/processes",
  mockData: mockAIProcesses,
  label: "systemService.getAIProcesses",
});

/** Get disk space breakdown by AI model category. Tauri: scans model dirs. */
export const getDiskBreakdown = createService<DiskCategory[]>({
  backendPath: "/system/disk-breakdown",
  mockData: mockDiskBreakdown,
  label: "systemService.getDiskBreakdown",
});

/** Get installed software with version info + compatibility. Tauri: subprocess version checks. */
export const getSoftwareVersions = createService<SoftwareItem[]>({
  backendPath: "/system/software",
  mockData: mockSoftwareVersions,
  label: "systemService.getSoftwareVersions",
});

/** Run a software update. Tauri: POST /api/system/software/update. */
export const runSoftwareUpdate = createServiceAction<string, boolean>({
  backendPath: "/system/software/update",
  bodySerializer: (name) => JSON.stringify({ name }),
  transform: () => true,
  mockResult: true,
  mockDelay: 3000,
  label: "systemService.runSoftwareUpdate",
});

/** Get cleanup items. Tauri: scans actual directories. */
export const getCleanupItems = createService<CleanupItem[]>({
  backendPath: "/system/cleanup",
  mockData: mockCleanupItems,
  label: "systemService.getCleanupItems",
});

/** Execute cleanup for selected items. Tauri: actually deletes. */
export const runCleanup = createServiceAction<string[], { success: boolean; freedMb: number }>({
  backendPath: "/system/cleanup/run",
  bodySerializer: (itemIds) => JSON.stringify({ item_ids: itemIds }),
  mockResult: { success: true, freedMb: 0 },
  mockDelay: 3000,
  label: "systemService.runCleanup",
});

/** Get environment variables and their validation status. Tauri: os.environ. */
export const getEnvVars = createService<EnvVar[]>({
  backendPath: "/system/env",
  mockData: mockEnvVars,
  label: "systemService.getEnvVars",
});

/** Get optimization suggestions with current status. Tauri: registry + power plan checks. */
export const getOptimizations = createService<OptimizationItem[]>({
  backendPath: "/system/optimizations",
  mockData: mockOptimizations,
  label: "systemService.getOptimizations",
});

/** Apply an optimization. Tauri: POST /api/system/optimizations/apply. */
export const applyOptimization = createServiceAction<string, boolean>({
  backendPath: "/system/optimizations/apply",
  bodySerializer: (id) => JSON.stringify({ id }),
  transform: () => true,
  mockResult: true,
  mockDelay: 2000,
  label: "systemService.applyOptimization",
});

/** Get system health score. Tauri: calculated server-side. */
export const getHealthScore = createService<number>({
  backendPath: "/system/health-score",
  transform: (raw) => (raw as { score: number }).score,
  mockData: 82,
  label: "systemService.getHealthScore",
});
