// Mock data for System service — extracted for readability

import type {
  SystemSpec,
  GPUStats,
  AIProcess,
  DiskCategory,
  SoftwareItem,
  CleanupItem,
  EnvVar,
  OptimizationItem,
} from "../systemService";

export const mockSystemSpecs: SystemSpec[] = [
  { icon: "Cpu", label: "CPU", value: "AMD Ryzen 9 9950X", sub: "16C/32T @ 5.7 GHz" },
  { icon: "Zap", label: "GPU", value: "NVIDIA RTX 5090", sub: "32 GB GDDR7 @ 1792 GB/s" },
  { icon: "MemoryStick", label: "RAM", value: "86 GB DDR5", sub: "6400 MHz CL30" },
  { icon: "HardDrive", label: "Storage", value: "2 TB M.2 Gen 5", sub: "14,000 MB/s Read" },
  { icon: "Thermometer", label: "Cooling", value: "Custom Loop", sub: "360mm Radiator" },
  { icon: "Wifi", label: "Network", value: "2.5 GbE + WiFi 7", sub: "Connected" },
];

export const mockGPUStats: GPUStats = {
  vramUsedGB: 2.4,
  vramTotalGB: 32.0,
  vramPercent: 7.5,
  gpuUtilPercent: 3,
  memUtilPercent: 8,
  tempC: 42,
  powerW: 45,
  powerLimitW: 575,
  fanPercent: 30,
  clockGpuMHz: 210,
  clockMemMHz: 1500,
  clockMaxGpuMHz: 2407,
  clockMaxMemMHz: 1750,
  pcieGen: 5,
  pcieLinkWidth: 16,
  driverVersion: "572.16",
  cudaVersion: "12.8",
};

export const mockAIProcesses: AIProcess[] = [
  { pid: 14280, name: "ComfyUI Server", type: "server", vramMB: 1840, ramMB: 3200, cpuPercent: 2.1, uptime: "3h 42m", status: "idle" },
  { pid: 8812, name: "FastAPI Backend", type: "server", vramMB: 0, ramMB: 280, cpuPercent: 0.8, uptime: "3h 42m", status: "running" },
  { pid: 22104, name: "SwarmUI Backend", type: "server", vramMB: 520, ramMB: 1400, cpuPercent: 1.2, uptime: "1h 15m", status: "idle" },
];

export const mockDiskBreakdown: DiskCategory[] = [
  { label: "Checkpoints (SD/FLUX)", sizeGB: 142.8, color: "#6d5aff", count: 28, path: "C:\\_AI\\_test_fresh_all_AI\\models\\checkpoints" },
  { label: "LoRAs", sizeGB: 34.2, color: "#00d4aa", count: 156, path: "C:\\_AI\\_test_fresh_all_AI\\models\\loras" },
  { label: "Video Models (Wan/HV)", sizeGB: 89.6, color: "#ff6b6b", count: 8, path: "C:\\_AI\\_test_fresh_all_AI\\models\\video" },
  { label: "GGUF Quantized", sizeGB: 67.4, color: "#ffd93d", count: 14, path: "C:\\_AI\\_test_fresh_all_AI\\models\\gguf" },
  { label: "VAE / CLIP / Text Enc", sizeGB: 18.9, color: "#4ecdc4", count: 22, path: "C:\\_AI\\_test_fresh_all_AI\\models\\clip" },
  { label: "ControlNet / IP-Adapter", sizeGB: 28.1, color: "#ff9f43", count: 18, path: "C:\\_AI\\_test_fresh_all_AI\\models\\controlnet" },
  { label: "Embeddings / TI", sizeGB: 2.1, color: "#a29bfe", count: 84, path: "C:\\_AI\\_test_fresh_all_AI\\models\\embeddings" },
  { label: "Outputs (images/video)", sizeGB: 58.3, color: "#636e72", count: 12400, path: "C:\\_AI\\_test_fresh_all_AI\\outputs" },
  { label: "Training Data", sizeGB: 22.6, color: "#e17055", count: 6, path: "C:\\_AI\\_test_fresh_all_AI\\training_data" },
  { label: "Free Space", sizeGB: 536.0, color: "#2d3436", count: 0, path: "" },
];

export const mockSoftwareVersions: SoftwareItem[] = [
  // === AI Stack (critical) ===
  { name: "PyTorch", currentVersion: "2.6.0+cu128", latestVersion: "2.6.0+cu128", hasUpdate: false, category: "AI Stack", lastChecked: "1 hr ago", autoUpdate: false, critical: true, compatibility: "ok", compatNote: "CUDA 12.8 match" },
  { name: "xformers", currentVersion: "0.0.29.post2", latestVersion: "0.0.29.post3", hasUpdate: true, category: "AI Stack", lastChecked: "1 hr ago", autoUpdate: false, critical: true, compatibility: "warning", compatNote: "Minor patch available — fixes memory leak in SDXL attention" },
  { name: "triton", currentVersion: "3.2.0", latestVersion: "3.2.0", hasUpdate: false, category: "AI Stack", lastChecked: "1 hr ago", autoUpdate: false, critical: true, compatibility: "ok", compatNote: "Compatible with PyTorch 2.6" },
  { name: "transformers", currentVersion: "4.48.1", latestVersion: "4.49.0", hasUpdate: true, category: "AI Stack", lastChecked: "1 hr ago", autoUpdate: false, critical: false, compatibility: "ok", compatNote: "New version adds Wan2.1 14B support" },
  { name: "diffusers", currentVersion: "0.32.2", latestVersion: "0.33.0", hasUpdate: true, category: "AI Stack", lastChecked: "1 hr ago", autoUpdate: false, critical: false, compatibility: "ok", compatNote: "New FLUX Kontext pipeline" },
  { name: "safetensors", currentVersion: "0.5.2", latestVersion: "0.5.2", hasUpdate: false, category: "AI Stack", lastChecked: "1 hr ago", autoUpdate: false, critical: true, compatibility: "ok" },
  { name: "onnxruntime-gpu", currentVersion: "1.20.0", latestVersion: "1.20.1", hasUpdate: true, category: "AI Stack", lastChecked: "1 hr ago", autoUpdate: false, critical: false, compatibility: "ok", compatNote: "Performance improvements for RTX 50-series" },

  // === GPU / Runtime ===
  { name: "NVIDIA Driver", currentVersion: "572.16", latestVersion: "572.16", hasUpdate: false, category: "GPU", lastChecked: "1 hr ago", autoUpdate: false, critical: true, compatibility: "ok", compatNote: "RTX 5090 Day-1 driver" },
  { name: "CUDA Toolkit", currentVersion: "12.8.0", latestVersion: "12.8.1", hasUpdate: true, category: "GPU", lastChecked: "1 hr ago", autoUpdate: false, critical: true, compatibility: "warning", compatNote: "Patch fixes cuBLAS performance regression on Blackwell" },
  { name: "cuDNN", currentVersion: "9.7.0", latestVersion: "9.7.0", hasUpdate: false, category: "GPU", lastChecked: "1 hr ago", autoUpdate: false, critical: true, compatibility: "ok" },
  { name: "TensorRT", currentVersion: "10.7.0", latestVersion: "10.7.0", hasUpdate: false, category: "GPU", lastChecked: "1 hr ago", autoUpdate: false, critical: false, compatibility: "ok", compatNote: "Blackwell support included" },

  // === Runtime ===
  { name: "Python", currentVersion: "3.12.8", latestVersion: "3.13.1", hasUpdate: true, category: "Runtime", lastChecked: "1 hr ago", autoUpdate: false, critical: true, compatibility: "warning", compatNote: "3.13 has breaking changes for some AI packages — stay on 3.12 for now" },
  { name: "Node.js", currentVersion: "22.13.0", latestVersion: "22.13.0", hasUpdate: false, category: "Runtime", lastChecked: "1 hr ago", autoUpdate: true, critical: false },
  { name: "Git", currentVersion: "2.47.1", latestVersion: "2.47.1", hasUpdate: false, category: "Dev Tools", lastChecked: "1 hr ago", autoUpdate: true, critical: true },
  { name: "pip", currentVersion: "24.3.1", latestVersion: "25.0.0", hasUpdate: true, category: "Package Manager", lastChecked: "1 hr ago", autoUpdate: true, critical: false },

  // === Media ===
  { name: "FFmpeg", currentVersion: "7.1", latestVersion: "7.1", hasUpdate: false, category: "Media", lastChecked: "1 hr ago", autoUpdate: false, critical: false },
  { name: "Visual C++ Redist", currentVersion: "14.42", latestVersion: "14.42", hasUpdate: false, category: "Runtime", lastChecked: "1 hr ago", autoUpdate: false, critical: false },
  { name: "7-Zip", currentVersion: "24.09", latestVersion: "24.09", hasUpdate: false, category: "Utility", lastChecked: "1 hr ago", autoUpdate: false, critical: false },
];

export const mockCleanupItems: CleanupItem[] = [
  // === AI-specific caches ===
  { id: "1", name: "ComfyUI Temp/Preview", path: "C:\\_AI\\_test_fresh_all_AI\\ComfyUI\\temp", size: "3.2 GB", sizeBytes: 3200, type: "cache", safe: true, selected: true, description: "Preview images and intermediate generation results", lastAccessed: "2 hours ago" },
  { id: "2", name: "ComfyUI Input Cache", path: "C:\\_AI\\_test_fresh_all_AI\\ComfyUI\\input", size: "1.8 GB", sizeBytes: 1800, type: "cache", safe: true, selected: false, description: "Uploaded input images — review before deleting", lastAccessed: "1 day ago" },
  { id: "3", name: "HuggingFace Hub Cache", path: "%USERPROFILE%\\.cache\\huggingface\\hub", size: "8.4 GB", sizeBytes: 8400, type: "cache", safe: false, selected: false, description: "Downloaded model snapshots — deleting re-downloads on next use", lastAccessed: "3 hours ago" },
  { id: "4", name: "pip Cache", path: "%LOCALAPPDATA%\\pip\\cache", size: "2.8 GB", sizeBytes: 2800, type: "cache", safe: true, selected: true, description: "Cached pip wheels — safe to clear, re-downloads as needed", lastAccessed: "1 day ago" },
  { id: "5", name: "torch Hub Cache", path: "%USERPROFILE%\\.cache\\torch\\hub", size: "4.2 GB", sizeBytes: 4200, type: "cache", safe: true, selected: true, description: "Cached PyTorch model downloads", lastAccessed: "5 days ago" },

  // === Orphaned / duplicate models ===
  { id: "6", name: "Duplicate Checkpoints", path: "C:\\_AI\\_test_fresh_all_AI\\models\\**", size: "14.2 GB", sizeBytes: 14200, type: "duplicate", safe: false, selected: false, description: "3 duplicate .safetensors found in multiple directories (same SHA256)", lastAccessed: "2 weeks ago" },
  { id: "7", name: "Old Training Checkpoints", path: "C:\\_AI\\_test_fresh_all_AI\\training_data\\old_checkpoints", size: "12.6 GB", sizeBytes: 12600, type: "orphan", safe: false, selected: false, description: "Intermediate training saves from completed runs — no matching config", lastAccessed: "1 month ago" },
  { id: "8", name: "Orphaned LoRAs (no metadata)", path: "C:\\_AI\\_test_fresh_all_AI\\models\\loras\\unsorted", size: "3.8 GB", sizeBytes: 3800, type: "orphan", safe: false, selected: false, description: "12 LoRA files with no .json metadata or training info", lastAccessed: "3 weeks ago" },

  // === Outputs ===
  { id: "9", name: "Old Generation Outputs (>30d)", path: "C:\\_AI\\_test_fresh_all_AI\\outputs\\old", size: "18.4 GB", sizeBytes: 18400, type: "output", safe: false, selected: false, description: "4,200 images older than 30 days — consider archiving", lastAccessed: "30+ days ago" },

  // === System caches ===
  { id: "10", name: "Python __pycache__", path: "C:\\_AI\\_test_fresh_all_AI\\**\\__pycache__", size: "890 MB", sizeBytes: 890, type: "cache", safe: true, selected: true, description: "Compiled Python bytecode — regenerated automatically", lastAccessed: "today" },
  { id: "11", name: "Windows Temp Files", path: "%TEMP%", size: "1.4 GB", sizeBytes: 1400, type: "temp", safe: true, selected: true, description: "Windows temporary files", lastAccessed: "today" },
  { id: "12", name: "NVIDIA Shader Cache", path: "%LOCALAPPDATA%\\NVIDIA\\GLCache", size: "670 MB", sizeBytes: 670, type: "cache", safe: true, selected: false, description: "Compiled shaders — clearing forces recompilation (one-time lag)", lastAccessed: "today" },
  { id: "13", name: "Log Files", path: "C:\\_AI\\_test_fresh_all_AI\\**\\*.log", size: "560 MB", sizeBytes: 560, type: "logs", safe: true, selected: true, description: "Application log files across all AI tools", lastAccessed: "today" },
  { id: "14", name: "Windows Update Cleanup", path: "C:\\Windows\\SoftwareDistribution\\Download", size: "2.1 GB", sizeBytes: 2100, type: "temp", safe: true, selected: false, description: "Old Windows Update files", lastAccessed: "1 week ago" },
  { id: "15", name: "Thumbnail Cache", path: "%LOCALAPPDATA%\\Microsoft\\Windows\\Explorer", size: "340 MB", sizeBytes: 340, type: "cache", safe: true, selected: true, description: "Windows thumbnail database", lastAccessed: "today" },
];

export const mockEnvVars: EnvVar[] = [
  { key: "CUDA_HOME", value: "C:\\Program Files\\NVIDIA GPU Computing Toolkit\\CUDA\\v12.8", ok: true, required: true, description: "CUDA toolkit installation root" },
  { key: "CUDA_VISIBLE_DEVICES", value: "0", ok: true, required: false, description: "Limit GPU visibility (single GPU = 0)" },
  { key: "PYTORCH_CUDA_ALLOC_CONF", value: "expandable_segments:True,garbage_collection_threshold:0.8", ok: true, required: true, description: "PyTorch VRAM allocator config — critical for 32GB management" },
  { key: "PYTHONPATH", value: "C:\\Python312;C:\\Python312\\Scripts", ok: true, required: true, description: "Python interpreter location" },
  { key: "HF_HOME", value: "C:\\_AI\\_test_fresh_all_AI\\models\\.huggingface", ok: true, required: true, description: "HuggingFace cache directory — model downloads land here" },
  { key: "HF_TOKEN", value: "hf_••••••••••••", ok: true, required: false, description: "HuggingFace API token for gated model downloads" },
  { key: "TRANSFORMERS_CACHE", value: "C:\\_AI\\_test_fresh_all_AI\\models\\.huggingface\\hub", ok: true, required: false, description: "Override default transformers cache (points to HF_HOME)" },
  { key: "PATH (Git)", value: "C:\\Program Files\\Git\\cmd", ok: true, required: true, description: "Git CLI for repo operations" },
  { key: "PATH (FFmpeg)", value: "C:\\ffmpeg\\bin", ok: true, required: true, description: "FFmpeg for video encoding/decoding" },
  { key: "AI_ROOT", value: "C:\\_AI\\_test_fresh_all_AI", ok: true, required: true, description: "Root directory for all AI tools and models" },
  { key: "COMFYUI_PATH", value: "C:\\_AI\\_test_fresh_all_AI\\ComfyUI", ok: true, required: false, description: "ComfyUI installation directory" },
  { key: "TORCH_EXTENSIONS_DIR", value: "C:\\_AI\\_test_fresh_all_AI\\.torch_extensions", ok: false, required: false, description: "Custom torch extensions build cache — NOT SET (using default)" },
];

export const mockOptimizations: OptimizationItem[] = [
  // === GPU Optimizations ===
  { id: "gpu-sched", title: "Enable NVIDIA GPU Scheduling", desc: "Hardware-accelerated GPU scheduling reduces latency for AI workloads by letting the GPU manage its own work queue", status: "enabled", impact: "High", category: "gpu", howTo: "Settings → System → Display → Graphics → Change default graphics settings → Hardware GPU Scheduling ON", currentValue: "Enabled", recommendedValue: "Enabled" },
  { id: "rebar", title: "Enable Resizable BAR (ReBAR)", desc: "Allows CPU to access full 32GB VRAM directly — improves model loading and VRAM-heavy operations on RTX 5090", status: "enabled", impact: "High", category: "gpu", howTo: "Enable in BIOS (Above 4G Decoding + ReBAR) → Verify with nvidia-smi --query-gpu=bar1.total", currentValue: "Enabled (32GB)", recommendedValue: "Enabled" },
  { id: "cuda-alloc", title: "Configure CUDA Memory Allocation", desc: "Set PYTORCH_CUDA_ALLOC_CONF for optimal VRAM management — prevents fragmentation with large models", status: "enabled", impact: "High", category: "gpu", howTo: "Set env var PYTORCH_CUDA_ALLOC_CONF=expandable_segments:True,garbage_collection_threshold:0.8", currentValue: "expandable_segments:True,gc:0.8", recommendedValue: "expandable_segments:True,garbage_collection_threshold:0.8" },
  { id: "tcc-mode", title: "Verify GPU in WDDM Mode (not TCC)", desc: "RTX 5090 should be in WDDM mode for display + compute. TCC mode is for Tesla/datacenter GPUs only", status: "enabled", impact: "Low", category: "gpu", currentValue: "WDDM", recommendedValue: "WDDM" },

  // === Memory Optimizations ===
  { id: "pagefile", title: "Increase Virtual Memory (Page File)", desc: "Set to 86GB+ for large model loading — currently at 32GB. Prevents OOM crashes when loading Wan2.1 14B or multiple models", status: "pending", impact: "High", category: "memory", howTo: "System Properties → Advanced → Performance Settings → Advanced → Virtual Memory → Custom: Min 86016 / Max 131072 MB", currentValue: "32 GB", recommendedValue: "86-128 GB" },
  { id: "mem-priority", title: "Set Process Memory Priority", desc: "Give AI processes higher memory priority to reduce swapping during multi-model workflows", status: "pending", impact: "Medium", category: "memory", howTo: "Automated via backend — sets memory priority class for ComfyUI/Python processes" },
  { id: "disable-trim", title: "Disable Memory Compression (optional)", desc: "Windows memory compression can interfere with CUDA pinned memory allocations", status: "pending", impact: "Low", category: "memory", howTo: "PowerShell (Admin): Disable-MMAgent -MemoryCompression", currentValue: "Enabled", recommendedValue: "Disabled" },

  // === Storage Optimizations ===
  { id: "search-index", title: "Disable Search Indexing on AI Drives", desc: "Prevents disk I/O interference during model loading and training — Windows Search constantly reads files", status: "pending", impact: "Medium", category: "storage", howTo: "Services → Windows Search → Disable, or exclude AI directories from indexing", currentValue: "Enabled", recommendedValue: "Disabled on AI paths" },
  { id: "trim-ssd", title: "Verify SSD TRIM is Enabled", desc: "Ensures optimal SSD performance and write speeds for your Gen 5 NVMe", status: "enabled", impact: "Medium", category: "storage", howTo: "fsutil behavior query DisableDeleteNotify → should be 0", currentValue: "Enabled", recommendedValue: "Enabled" },
  { id: "symlinks", title: "Use Symlinks for Shared Models", desc: "ComfyUI, SwarmUI, and sd-scripts can share model files via symlinks — saves 40+ GB of duplicates", status: "pending", impact: "Medium", category: "storage", howTo: "Backend creates junction points: mklink /J ComfyUI\\models\\checkpoints C:\\_AI\\shared_models\\checkpoints" },

  // === System Optimizations ===
  { id: "power-plan", title: "Set Power Plan to Ultimate Performance", desc: "Ensures maximum CPU/GPU clocks during training and generation — prevents clock throttling", status: "enabled", impact: "High", category: "system", howTo: "powercfg -duplicatescheme e9a42b02-d5df-448d-aa00-03f14749eb61 → powercfg /setactive [GUID]", currentValue: "Ultimate Performance", recommendedValue: "Ultimate Performance" },
  { id: "hibernate", title: "Disable Hibernation", desc: "Frees ~86GB disk space (equal to RAM) and prevents corruption during long training runs", status: "enabled", impact: "Medium", category: "system", howTo: "Admin CMD: powercfg /h off", currentValue: "Disabled", recommendedValue: "Disabled" },
  { id: "fast-startup", title: "Disable Fast Startup", desc: "Prevents driver issues after GPU driver updates — ensures clean boot for CUDA initialization", status: "pending", impact: "Low", category: "system", howTo: "Control Panel → Power Options → Choose what the power buttons do → Disable fast startup" },
  { id: "game-mode", title: "Disable Game Mode / Game Bar", desc: "Game Mode can interfere with CUDA compute scheduling and add overhead", status: "enabled", impact: "Low", category: "system", howTo: "Settings → Gaming → Game Mode OFF; Xbox Game Bar OFF" },

  // === AI Stack Optimizations ===
  { id: "sdpa-default", title: "Verify Torch SDPA as Default Attention", desc: "PyTorch 2.6 uses Scaled Dot-Product Attention by default — faster than xformers for RTX 50-series", status: "enabled", impact: "High", category: "ai-stack", howTo: "ComfyUI auto-detects; for custom scripts: with torch.nn.attention.sdpa_kernel(torch.nn.attention.SDPBackend.FLASH_ATTENTION):", currentValue: "SDPA + Flash Attention", recommendedValue: "SDPA (Flash Attention backend)" },
  { id: "compile", title: "Enable torch.compile for Repeated Workflows", desc: "torch.compile() pre-compiles models for 15-30% speedup on repeated generations — one-time warmup cost", status: "pending", impact: "High", category: "ai-stack", howTo: "ComfyUI: --use-pytorch-cross-attention --force-fp16 + torch.compile in workflow settings" },
  { id: "bf16", title: "Use BF16 Precision Where Possible", desc: "RTX 5090 Blackwell has native BF16 support — faster than FP16 with better numerical stability", status: "pending", impact: "Medium", category: "ai-stack", howTo: "ComfyUI: use --bf16-vae --bf16-unet flags; training: set mixed_precision='bf16' in config" },
  { id: "venvs", title: "Clean Unused Python Virtual Environments", desc: "3 unused venvs detected totaling 4.2 GB — safe to remove if no active projects use them", status: "pending", impact: "Low", category: "ai-stack", howTo: "Backend scans for .venv directories with no recent activation", currentValue: "3 unused (4.2 GB)", recommendedValue: "0 unused" },
];
