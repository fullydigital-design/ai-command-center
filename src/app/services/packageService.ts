// ============================================================
// Package Service — Script Package management layer
// ============================================================
//
// RIGHT NOW:  Mock data + localStorage persistence for UI prototype.
// MIGRATION:  Tauri commands for zip extraction, file system ops,
//             script execution with stdout streaming.
//
// Tauri commands this maps to:
//   invoke("list_packages")          → listPackages()
//   invoke("import_package", {path}) → importPackage()
//   invoke("run_action", {pkg, act}) → runAction()
//   invoke("get_package_readme")     → getPackageReadme()
//   invoke("get_config_content")     → getConfigContent()
//   invoke("save_config_content")    → saveConfigContent()
//   invoke("delete_package")         → deletePackage()
//   invoke("check_requirements")     → checkRequirements()
//
// ============================================================

import { shouldTryBackend, getApiBase } from "./env";
import { fetchBackend } from "./fetchWithRetry";
import type {
  PackageManifest,
  InstalledPackage,
  PackageStatus,
  PackageAction,
  ActionExecution,
  PackageCategory,
  CustomNodeEntry,
} from "./packageTypes";
import type { TerminalLine } from "./setupService";
import { classifyLine } from "./setupService";

// ── Storage ──────────────────────────────────────────────────

const STORAGE_KEY = "ai_cmd_center_packages";

function loadPackages(): InstalledPackage[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function savePackages(pkgs: InstalledPackage[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(pkgs));
}

// ── Public API ───────────────────────────────────────────────

/**
 * Get all installed packages.
 * Browser: returns mock + localStorage packages.
 * Tauri: reads from package directory on disk.
 */
export async function listPackages(): Promise<InstalledPackage[]> {
  if (shouldTryBackend()) {
    try {
      const res = await fetchBackend(`${getApiBase()}/packages`);
      if (res.ok) return await res.json();
    } catch { /* fall through */ }
  }

  // Merge built-in mock packages with any user-imported ones
  const stored = loadPackages();
  const builtIn = getBuiltInPackages();

  // Don't duplicate — stored packages override built-in by ID
  const storedIds = new Set(stored.map((p) => p.manifest.id));
  const merged = [
    ...builtIn.filter((p) => !storedIds.has(p.manifest.id)),
    ...stored,
  ];

  return merged;
}

/**
 * Get a single package by ID.
 */
export async function getPackageById(id: string): Promise<InstalledPackage | null> {
  const pkgs = await listPackages();
  return pkgs.find((p) => p.manifest.id === id) ?? null;
}

/**
 * Get packages filtered by category.
 */
export async function getPackagesByCategory(
  category: PackageCategory
): Promise<InstalledPackage[]> {
  const pkgs = await listPackages();
  return pkgs.filter((p) => p.manifest.category === category);
}

/**
 * Import a package from a zip file.
 * Browser: simulates extraction, stores manifest in localStorage.
 * Tauri: extracts zip to packages directory, validates manifest.
 */
export async function importPackage(
  _file: File
): Promise<{ success: boolean; package?: InstalledPackage; error?: string }> {
  if (shouldTryBackend()) {
    try {
      const formData = new FormData();
      formData.append("file", _file);
      const res = await fetchBackend(`${getApiBase()}/packages/import`, {
        method: "POST",
        body: formData,
      });
      if (res.ok) return await res.json();
    } catch { /* fall through */ }
  }

  // Browser simulation: parse filename for info
  return {
    success: false,
    error: "Package import requires Tauri desktop app. In browser mode, use the built-in packages.",
  };
}

/**
 * Delete/uninstall a package.
 */
export async function deletePackage(
  id: string
): Promise<{ success: boolean; error?: string }> {
  if (shouldTryBackend()) {
    try {
      const res = await fetchBackend(`${getApiBase()}/packages/${id}`, { method: "DELETE" });
      if (res.ok) return await res.json();
    } catch { /* fall through */ }
  }

  const stored = loadPackages();
  const filtered = stored.filter((p) => p.manifest.id !== id);
  savePackages(filtered);
  return { success: true };
}

/**
 * Import a package from a manifest JSON object (AI-generated or manual).
 * Browser: creates the InstalledPackage in localStorage.
 * Tauri: writes manifest.json + scaffold files to the package directory.
 */
export async function importManifest(
  manifest: PackageManifest
): Promise<{ success: boolean; package?: InstalledPackage; error?: string }> {
  // Validate required fields
  if (!manifest.id || !manifest.name || !manifest.version) {
    return { success: false, error: "Manifest is missing required fields (id, name, or version)." };
  }

  if (shouldTryBackend()) {
    try {
      const res = await fetchBackend(`${getApiBase()}/packages/import-manifest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(manifest),
      });
      if (res.ok) return await res.json();
    } catch { /* fall through to browser mode */ }
  }

  // Browser mode: store in localStorage
  const stored = loadPackages();

  // Check for duplicate IDs — update if already exists
  const existingIdx = stored.findIndex((p) => p.manifest.id === manifest.id);
  const pkg: InstalledPackage = {
    manifest,
    status: "installed",
    installedAt: new Date().toISOString(),
    extractedPath: `packages/${manifest.id}`,
  };

  if (existingIdx >= 0) {
    stored[existingIdx] = pkg;
  } else {
    stored.push(pkg);
  }

  savePackages(stored);
  return { success: true, package: pkg };
}

/**
 * Run a package action.
 * Browser: simulates terminal output.
 * Tauri: executes scripts, streams stdout.
 */
export async function runAction(
  packageId: string,
  actionId: string,
  onLine: (line: TerminalLine) => void,
  onDone: (exitCode: number) => void
): Promise<{ streamId: string }> {
  if (shouldTryBackend()) {
    try {
      const res = await fetchBackend(`${getApiBase()}/packages/${packageId}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actionId }),
      });
      if (res.ok) {
        const data = await res.json();
        // Connect to SSE stream
        connectToStream(data.streamId, onLine, onDone);
        return { streamId: data.streamId };
      }
    } catch { /* fall through */ }
  }

  // Browser simulation
  const streamId = `sim-${Date.now()}`;
  simulateActionOutput(packageId, actionId, onLine, onDone);
  return { streamId };
}

/**
 * Stop a running action.
 */
export async function stopAction(streamId: string): Promise<void> {
  if (shouldTryBackend()) {
    try {
      await fetchBackend(`${getApiBase()}/packages/stop/${streamId}`, { method: "POST" });
    } catch { /* ignore */ }
  }
  // Browser: simulation auto-completes, nothing to stop
}

/**
 * Get README content for a package.
 */
export async function getPackageReadme(packageId: string): Promise<string | null> {
  if (shouldTryBackend()) {
    try {
      const res = await fetchBackend(`${getApiBase()}/packages/${packageId}/readme`);
      if (res.ok) return await res.text();
    } catch { /* fall through */ }
  }

  // Return mock README
  return getBuiltInReadme(packageId);
}

/**
 * Get config file content for editing.
 */
export async function getConfigContent(
  packageId: string,
  configId: string
): Promise<string | null> {
  if (shouldTryBackend()) {
    try {
      const res = await fetchBackend(
        `${getApiBase()}/packages/${packageId}/configs/${configId}`
      );
      if (res.ok) return await res.text();
    } catch { /* fall through */ }
  }

  return getBuiltInConfig(packageId, configId);
}

/**
 * Save modified config file.
 */
export async function saveConfigContent(
  packageId: string,
  configId: string,
  content: string
): Promise<{ success: boolean; error?: string }> {
  if (shouldTryBackend()) {
    try {
      const res = await fetchBackend(
        `${getApiBase()}/packages/${packageId}/configs/${configId}`,
        {
          method: "PUT",
          headers: { "Content-Type": "text/plain" },
          body: content,
        }
      );
      if (res.ok) return await res.json();
    } catch { /* fall through */ }
  }

  // Browser: store in localStorage
  const key = `pkg_config_${packageId}_${configId}`;
  localStorage.setItem(key, content);
  return { success: true };
}

/**
 * Check if system meets package requirements.
 */
export async function checkRequirements(
  packageId: string
): Promise<{ met: boolean; issues: string[] }> {
  if (shouldTryBackend()) {
    try {
      const res = await fetchBackend(`${getApiBase()}/packages/${packageId}/requirements`);
      if (res.ok) return await res.json();
    } catch { /* fall through */ }
  }

  // Browser: assume everything is met (can't check)
  return { met: true, issues: [] };
}

/**
 * Get available package updates (checks update URLs).
 */
export async function checkForUpdates(): Promise<
  Array<{ packageId: string; currentVersion: string; newVersion: string }>
> {
  // Browser: simulate one update available
  return [
    {
      packageId: "rtx5090-core-setup",
      currentVersion: "2.4.0",
      newVersion: "2.5.0",
    },
  ];
}

/**
 * Get custom nodes list from a package.
 */
export async function getPackageNodes(
  packageId: string
): Promise<CustomNodeEntry[]> {
  if (shouldTryBackend()) {
    try {
      const res = await fetchBackend(`${getApiBase()}/packages/${packageId}/nodes`);
      if (res.ok) return await res.json();
    } catch { /* fall through */ }
  }

  if (packageId === "comfyui-nodes-pack") return MOCK_NODES;
  return [];
}

// ── SSE Stream Connection ────────────────────────────────────

function connectToStream(
  streamId: string,
  onLine: (line: TerminalLine) => void,
  onDone: (exitCode: number) => void
) {
  const es = new EventSource(`${getApiBase()}/packages/stream/${streamId}`);
  let lineId = 0;

  es.addEventListener("output", (e) => {
    const data = JSON.parse(e.data);
    onLine({
      id: lineId++,
      text: data.line,
      type: classifyLine(data.line),
      timestamp: Date.now(),
    });
  });

  es.addEventListener("done", (e) => {
    const data = JSON.parse(e.data);
    es.close();
    onDone(data.exit_code);
  });

  es.onerror = () => {
    es.close();
    onDone(-1);
  };
}

// ── Browser Simulation ───────────────────────────────────────

function simulateActionOutput(
  packageId: string,
  actionId: string,
  onLine: (line: TerminalLine) => void,
  onDone: (exitCode: number) => void
) {
  const lines = getSimulatedOutput(packageId, actionId);
  let i = 0;
  let lineId = 0;

  const emit = () => {
    if (i >= lines.length) {
      onDone(0);
      return;
    }
    const text = lines[i];
    onLine({
      id: lineId++,
      text,
      type: classifyLine(text),
      timestamp: Date.now(),
    });
    i++;
    // Variable timing for realism
    const delay = text.includes("[OK]") ? 80 :
                  text.includes("[INSTALL]") ? 200 :
                  text.includes("progress") || text.includes("##") ? 120 :
                  text.startsWith("  ") ? 60 : 100;
    setTimeout(emit, delay);
  };

  setTimeout(emit, 300);
}

function getSimulatedOutput(packageId: string, actionId: string): string[] {
  // Default generic output
  const base = [
    "",
    "  =============================================================",
    `   Running: ${actionId}`,
    "  =============================================================",
    "",
  ];

  if (actionId === "full_setup" || actionId === "system_setup") {
    return [
      ...base,
      "  [CHECK] winget ... OK",
      "  [CHECK] Git ... OK",
      "  [CHECK] Python 3.12.8 via py -3.12 ... OK",
      "  [CHECK] .NET 8 SDK ... OK",
      "  [CHECK] VS Build Tools C++ ... OK",
      "  [CHECK] VS Code ... OK",
      "  [CHECK] 7-Zip ... OK",
      "  [CHECK] ffmpeg ... OK",
      "",
      "  [OK] NVIDIA driver",
      "       NVIDIA GeForce RTX 5090",
      "       Driver: 572.16",
      "       VRAM: 32768 MB  RAM: 96 GB",
      "       Performance Profile: Ultra",
      "",
      "  [OK] CUDA Toolkit 12.8",
      "  [OK] cuDNN",
      "",
      "  --- PyTorch ---",
      "  Python: 3.12.8 via py -3.12 / Wheels: cu128",
      "",
      "  [OK] PyTorch + CUDA",
      "  [UPGRADE] Checking updates...",
      "  [OK] xformers",
      "  [OK] SageAttention",
      "",
      "  --- AI Packages - auto-upgrade ---",
      "",
      "   [########------------]  8/46  accelerate",
      "   [############--------] 16/46  opencv-python",
      "   [################----] 24/46  huggingface-hub",
      "   [##################--] 32/46  diffusers",
      "   [####################] 40/46  gradio",
      "   [####################] 46/46  lark",
      "",
      "  +-------------------------------------------------------+",
      "  |  AI Packages: 46 total | 46 OK | 0 WARN",
      "  +-------------------------------------------------------+",
      "",
      "  [CHECK] VS Code extensions...",
      "   [####################] 5/5  ms-vscode.cpptools .. already installed",
      "",
      "  +-------------------------------------------------------+",
      "  |  System Setup Complete",
      "  |  Time: 2m 14s",
      "  +-------------------------------------------------------+",
    ];
  }

  if (actionId === "install_comfyui" || actionId === "setup_comfyui") {
    return [
      ...base,
      "  [INSTALL] ComfyUI - fresh install...",
      "",
      "  Cloning into 'ComfyUI'...",
      "  remote: Enumerating objects: 1847, done.",
      "  remote: Counting objects: 100% (1847/1847), done.",
      "  Receiving objects: 100% (1847/1847), 4.28 MiB, done.",
      "  [OK] ComfyUI cloned",
      "",
      "  [INSTALL] ComfyUI requirements...",
      "  [OK] Requirements installed",
      "",
      "  [SETUP] Shared models folder...",
      "  [CREATE] extra_model_paths.yaml",
      "  [OK] Shared models at C:\\_AI\\models",
      "",
      "  [CREATE] LAUNCH_ComfyUI.bat",
      "  [OK] Launcher created",
      "",
      "  [OK] ComfyUI installed!",
    ];
  }

  if (actionId === "install_swarmui" || actionId === "setup_swarmui") {
    return [
      ...base,
      "  [INSTALL] SwarmUI - fresh install...",
      "",
      "  Cloning into 'SwarmUI'...",
      "  remote: Enumerating objects: 3241, done.",
      "  Receiving objects: 100% (3241/3241), 12.1 MiB, done.",
      "  [OK] SwarmUI cloned",
      "",
      "  Submodule 'src/BuiltinExtensions/ComfyUIBackend' registered",
      "  Submodule path 'src/BuiltinExtensions/ComfyUIBackend': checked out",
      "",
      "  [SETUP] SwarmUI model root -> C:\\_AI\\models",
      "  [SETUP] SwarmUI performance settings...",
      "       System RAM: 96 GB  VRAM: 32768 MB",
      "       Model cache: 76 GB",
      "  [OK] SwarmUI performance settings configured",
      "  [SETUP] SwarmUI backend config (ComfyUI extra args)...",
      "  [OK] SwarmUI backend configured: --gpu-only --cuda-malloc --fast --reserve-vram 0.5",
      "",
      "  [CREATE] LAUNCH_SwarmUI.bat",
      "  [OK] LAUNCH_SwarmUI.bat created",
      "",
      "  [OK] SwarmUI installed!",
      "  [NOTE] First launch will complete .NET build + ComfyUI backend setup.",
    ];
  }

  if (actionId === "install_kohya" || actionId === "setup_kohya") {
    return [
      ...base,
      "  [INSTALL] Kohya ss / sd-scripts...",
      "",
      "  Cloning into 'kohya_ss'...",
      "  remote: Enumerating objects: 2156, done.",
      "  Receiving objects: 100% (2156/2156), 8.4 MiB, done.",
      "",
      "  [INSTALL] Kohya requirements...",
      "  [OK] Requirements installed",
      "",
      "  [CREATE] LAUNCH_Kohya.bat",
      "  [OK] LAUNCH_Kohya.bat created",
      "",
      "  [CREATE] Sample config: sdxl_lora_example.toml",
      "  [CREATE] Sample config: flux_lora_example.toml",
      "  [OK] Sample configs in C:\\_AI\\kohya_ss\\configs",
      "",
      "  [OK] Kohya ss installed!",
    ];
  }

  if (actionId === "install_musubi" || actionId === "setup_musubi") {
    return [
      ...base,
      "  [INSTALL] Musubi Tuner...",
      "",
      "  Cloning into 'musubi-tuner'...",
      "  remote: Enumerating objects: 891, done.",
      "  Receiving objects: 100% (891/891), 2.1 MiB, done.",
      "",
      "  [INSTALL] Musubi requirements...",
      "  [OK] Requirements installed",
      "",
      "  [CREATE] LAUNCH_Musubi.bat",
      "  [OK] LAUNCH_Musubi.bat created",
      "",
      "  [CREATE] Sample config: hunyuan_video_lora.toml",
      "  [CREATE] Sample config: wan21_video_lora.toml",
      "  [OK] Sample configs in C:\\_AI\\musubi-tuner\\configs",
      "",
      "  [OK] Musubi Tuner installed!",
    ];
  }

  if (actionId === "update_all") {
    return [
      ...base,
      "  [UPDATE] ComfyUI...",
      "  Already up to date.",
      "  [SKIP] Already up to date - pip install skipped",
      "  [OK] ComfyUI (no changes)",
      "",
      "  [UPDATE] SwarmUI...",
      "  Already up to date.",
      "  [OK] SwarmUI (no changes)",
      "",
      "  [UPDATE] Kohya ss...",
      "  remote: 3 new commits",
      "  Updating a1b2c3d..e4f5g6h",
      "  [OK] Kohya ss (updated)",
      "",
      "  [UPDATE] Musubi Tuner...",
      "  Already up to date.",
      "  [OK] Musubi Tuner (no changes)",
      "",
      "  [UPDATE] Python packages...",
      "   [####################] 46/46  lark",
      "",
      "  +-------------------------------------------------------+",
      "  |  Quick Update Complete",
      "  |  Updated: 1  |  No changes: 3",
      "  +-------------------------------------------------------+",
    ];
  }

  if (actionId === "cleanup") {
    return [
      ...base,
      "  [CLEAN] __pycache__ directories...",
      "  [OK] Removed 47 __pycache__ dirs",
      "",
      "  [CLEAN] .pyc files...",
      "  [OK] Removed 312 .pyc files",
      "",
      "  [CLEAN] pip cache...",
      "  [OK] pip cache purged (freed 2.1 GB)",
      "",
      "  +-------------------------------------------------------+",
      "  |  Cleanup Complete",
      "  |  Freed: ~2.3 GB",
      "  +-------------------------------------------------------+",
    ];
  }

  if (actionId === "diagnostics") {
    return [
      ...base,
      "  --- System ---",
      "  OS:     Windows 11 Pro 24H2",
      "  CPU:    AMD Ryzen 9 9950X (16C/32T)",
      "  RAM:    96 GB DDR5-6000",
      "  GPU:    NVIDIA GeForce RTX 5090 (32 GB)",
      "  Driver: 572.16",
      "  CUDA:   12.8",
      "  cuDNN:  9.x",
      "",
      "  --- Python ---",
      "  Version: 3.12.8",
      "  PyTorch: 2.6.0+cu128",
      "  CUDA available: True",
      "  xformers: 0.0.29",
      "",
      "  --- Installed Tools ---",
      "  [OK] ComfyUI        C:\\_AI\\ComfyUI",
      "  [OK] SwarmUI         C:\\_AI\\SwarmUI",
      "  [OK] Kohya ss        C:\\_AI\\kohya_ss",
      "  [OK] Musubi Tuner    C:\\_AI\\musubi-tuner",
      "",
      "  --- Shared Models ---",
      "  Root: C:\\_AI\\models",
      "  Total files: 12",
      "  checkpoints: 3  |  loras: 4  |  vae: 2  |  controlnet: 1  |  clip: 2",
      "",
      "  +-------------------------------------------------------+",
      "  |  Diagnostics Complete - All systems OK",
      "  +-------------------------------------------------------+",
    ];
  }

  if (actionId === "model_audit") {
    return [
      ...base,
      "  [OK] Shared models root: C:\\_AI\\models",
      "",
      "  Model subdirectories:",
      "    [OK]          checkpoints ... 3 files",
      "    [OK]                  vae ... 2 files",
      "    [OK]                loras ... 4 files",
      "    [OK]           controlnet ... 1 files",
      "    [OK]                 clip ... 2 files",
      "    [OK]          clip_vision ... 0 files",
      "    [OK]       upscale_models ... 0 files",
      "    [OK]           embeddings ... 0 files",
      "    [OK]            ipadapter ... 0 files",
      "    [OK]                 unet ... 1 files",
      "    [OK]     diffusion_models ... 0 files",
      "",
      "  Total model files: 13",
      "",
      "  Configuration files:",
      "  [OK] ComfyUI extra_model_paths.yaml",
      "  [OK] SwarmUI Model-Paths.fds",
      "  [OK] SwarmUI ComfyUI backend extra_model_paths.yaml",
      "",
      "  +-------------------------------------------------------+",
      "  |  Shared Models Audit Complete",
      "  |  OK: 14   Warnings: 0",
      "  |  All model links are properly configured!",
      "  +-------------------------------------------------------+",
    ];
  }

  if (actionId === "install_nodes") {
    return [
      ...base,
      "  Custom Nodes for ComfyUI:",
      "",
      "   [#-------------------]  1/22  ComfyUI-Manager .. installed",
      "   [##------------------]  2/22  ComfyUI-Impact-Pack .. installed",
      "   [###-----------------]  3/22  ComfyUI-Inspire-Pack .. installed",
      "   [####----------------]  4/22  ComfyUI-KJNodes .. installed",
      "   [#####---------------]  5/22  ComfyUI-GGUF .. installed",
      "   [######--------------]  6/22  ComfyUI-Custom-Scripts .. installed",
      "   [#######-------------]  8/22  ComfyUI-VideoHelperSuite .. installed",
      "   [##########----------] 11/22  ComfyUI-Florence2 .. installed",
      "   [#############-------] 15/22  ComfyUI_essentials .. installed",
      "   [################----] 18/22  ComfyUI-Crystools .. installed",
      "   [##################--] 20/22  comfyui-reactor-node .. installed",
      "   [####################] 22/22  ComfyUI-FaceID-Plus .. installed",
      "",
      "  +-------------------------------------------------------+",
      "  |  Custom Nodes: 22 total | 22 installed | 0 updated | 0 WARN",
      "  |  Time: 4m 32s",
      "  +-------------------------------------------------------+",
    ];
  }

  if (actionId === "path_cleanup") {
    return [
      ...base,
      "  [RUN] PATH audit + cleanup...",
      "",
      "  === SYSTEM PATH ===",
      "  [OK] C:\\Windows\\system32",
      "  [OK] C:\\Windows",
      "  [OK] C:\\Program Files\\NVIDIA GPU Computing Toolkit\\CUDA\\v12.8\\bin",
      "  [OK] C:\\Users\\User\\AppData\\Local\\Programs\\Python\\Python312",
      "  [OK] C:\\Program Files\\Git\\cmd",
      "",
      "  === USER PATH ===",
      "  [OK] C:\\Users\\User\\.dotnet\\tools",
      "  [OK] C:\\Users\\User\\AppData\\Local\\Programs\\Microsoft VS Code\\bin",
      "",
      "  === ENVIRONMENT VARIABLES ===",
      "  [OK] CUDA_HOME = C:\\Program Files\\NVIDIA GPU Computing Toolkit\\CUDA\\v12.8",
      "  [OK] CUDA_PATH = C:\\Program Files\\NVIDIA GPU Computing Toolkit\\CUDA\\v12.8",
      "  [OK] NVIDIA_TF32_OVERRIDE = 1",
      "  [OK] PYTORCH_CUDA_ALLOC_CONF = expandable_segments:True,garbage_collection_threshold:0.8",
      "",
      "  No stale entries found. PATH is clean!",
      "",
      "  PATH cleanup complete.",
    ];
  }

  // Generic output
  return [
    ...base,
    `  [INFO] Running action: ${actionId}`,
    "  [OK] Action completed successfully.",
  ];
}

// ── Built-in Mock Packages ───────────────────────────────────

function getBuiltInPackages(): InstalledPackage[] {
  return [
    {
      manifest: CORE_SETUP_MANIFEST,
      status: "installed",
      installedAt: "2026-02-20T10:00:00Z",
      lastRunAt: "2026-02-24T15:30:00Z",
      extractedPath: "C:\\_AI\\packages\\rtx5090-core-setup",
      updateAvailable: "2.5.0",
    },
    {
      manifest: COMFYUI_NODES_MANIFEST,
      status: "installed",
      installedAt: "2026-02-20T10:30:00Z",
      lastRunAt: "2026-02-22T09:00:00Z",
      extractedPath: "C:\\_AI\\packages\\comfyui-nodes-pack",
    },
    {
      manifest: TRAINING_IMAGES_MANIFEST,
      status: "installed",
      installedAt: "2026-02-21T14:00:00Z",
      extractedPath: "C:\\_AI\\packages\\training-images",
    },
    {
      manifest: TRAINING_VIDEO_MANIFEST,
      status: "not-installed",
      installedAt: "",
      extractedPath: "",
    },
    {
      manifest: MODELS_STARTER_MANIFEST,
      status: "installed",
      installedAt: "2026-02-20T11:00:00Z",
      lastRunAt: "2026-02-20T11:00:00Z",
      extractedPath: "C:\\_AI\\packages\\models-starter",
    },
  ];
}

// ── Core Setup Package Manifest ──────────────────────────────

const CORE_SETUP_MANIFEST: PackageManifest = {
  id: "rtx5090-core-setup",
  name: "RTX 5090 AI Stack Setup",
  version: "2.4.0",
  minAppVersion: "1.0.0",
  author: "AI Command Center",
  created: "2026-02-15T00:00:00Z",
  updated: "2026-02-20T00:00:00Z",
  description: "Full system setup + install/update for ComfyUI, SwarmUI, Kohya SS, and Musubi Tuner",
  longDescription: "Complete AI stack installer for RTX 5090 rigs. Handles system prerequisites (Python, CUDA, Git, .NET), installs all 4 AI tools with optimized launch configs, creates shared models folder, and generates performance-tuned launchers.",
  category: "setup",
  tags: ["setup", "comfyui", "swarmui", "kohya", "musubi", "cuda", "pytorch"],
  color: "#6d5aff",
  icon: "Rocket",

  requires: {
    python: ">=3.10,<=3.12",
    gpu: "nvidia",
    os: "windows",
    minVramMb: 8000,
  },

  actions: [
    {
      id: "full_setup",
      label: "Full Setup",
      icon: "Rocket",
      description: "System + all AI tools + shared models + launchers",
      group: "Install",
      estimatedDurationSec: 600,
      steps: [
        { run: "scripts/path_audit.py", type: "python", admin: true, label: "PATH cleanup" },
        { run: "scripts/setup_system.bat", type: "bat", label: "System prerequisites" },
        { run: "scripts/setup_comfyui.bat", type: "bat", label: "ComfyUI" },
        { run: "scripts/setup_swarmui.bat", type: "bat", label: "SwarmUI" },
        { run: "scripts/setup_kohya.bat", type: "bat", label: "Kohya SS" },
        { run: "scripts/setup_musubi.bat", type: "bat", label: "Musubi Tuner" },
        { run: "scripts/cleanup.bat", type: "bat", label: "Cleanup" },
        { run: "scripts/diagnostics.py", type: "python", label: "Diagnostics" },
      ],
    },
    {
      id: "system_setup",
      label: "System Only",
      icon: "Cpu",
      description: "Drivers, Python, CUDA, packages — no AI tools",
      group: "Install",
      estimatedDurationSec: 180,
      steps: [
        { run: "scripts/setup_system.bat", type: "bat", label: "System setup" },
        { run: "scripts/diagnostics.py", type: "python", label: "Diagnostics" },
      ],
    },
    {
      id: "setup_comfyui",
      label: "ComfyUI",
      icon: "Palette",
      description: "Install or update ComfyUI with shared models",
      group: "Install",
      estimatedDurationSec: 120,
      steps: [
        { run: "scripts/setup_comfyui.bat", type: "bat", label: "ComfyUI install/update" },
      ],
    },
    {
      id: "setup_swarmui",
      label: "SwarmUI",
      icon: "Bug",
      description: "Install or update SwarmUI with optimized settings",
      group: "Install",
      estimatedDurationSec: 180,
      steps: [
        { run: "scripts/setup_swarmui.bat", type: "bat", label: "SwarmUI install/update" },
      ],
    },
    {
      id: "setup_kohya",
      label: "Kohya SS",
      icon: "FlaskConical",
      description: "Install or update Kohya ss / sd-scripts",
      group: "Install",
      estimatedDurationSec: 120,
      steps: [
        { run: "scripts/setup_kohya.bat", type: "bat", label: "Kohya install/update" },
      ],
    },
    {
      id: "setup_musubi",
      label: "Musubi Tuner",
      icon: "Film",
      description: "Install or update Musubi Tuner for video training",
      group: "Install",
      estimatedDurationSec: 90,
      steps: [
        { run: "scripts/setup_musubi.bat", type: "bat", label: "Musubi install/update" },
      ],
    },
    {
      id: "update_all",
      label: "Quick Update All",
      icon: "RefreshCw",
      description: "Git pull + pip upgrade for all installed tools",
      group: "Maintain",
      estimatedDurationSec: 120,
      steps: [
        { run: "scripts/update_all.bat", type: "bat", label: "Update all" },
      ],
    },
    {
      id: "cleanup",
      label: "Cleanup",
      icon: "Trash2",
      description: "Remove __pycache__, .pyc, pip cache",
      group: "Maintain",
      estimatedDurationSec: 30,
      steps: [
        { run: "scripts/cleanup.bat", type: "bat", label: "Cleanup" },
      ],
    },
    {
      id: "diagnostics",
      label: "Diagnostics",
      icon: "Stethoscope",
      description: "Full system summary — hardware, Python, tools, models",
      group: "Maintain",
      estimatedDurationSec: 15,
      steps: [
        { run: "scripts/diagnostics.py", type: "python", label: "System diagnostics" },
      ],
    },
    {
      id: "model_audit",
      label: "Shared Models Audit",
      icon: "FolderSearch",
      description: "Verify shared model links and file counts",
      group: "Maintain",
      estimatedDurationSec: 10,
      steps: [
        { run: "scripts/model_audit.bat", type: "bat", label: "Model audit" },
      ],
    },
    {
      id: "path_cleanup",
      label: "PATH Cleanup",
      icon: "Route",
      description: "Fix stale Python/CUDA paths in Windows environment",
      group: "Maintain",
      admin: true,
      estimatedDurationSec: 20,
      steps: [
        { run: "scripts/path_audit.py", type: "python", admin: true, label: "PATH audit + fix" },
      ],
    },
    {
      id: "soft_reset",
      label: "Soft Reset",
      icon: "RotateCcw",
      description: "Remove app repos only, keep models + training data",
      group: "Reset",
      danger: "medium",
      confirmRequired: true,
      confirmMessage: "This will remove ComfyUI, SwarmUI, Kohya, and Musubi repos. Models and training data will be preserved. Type RESET to confirm.",
      steps: [
        { run: "scripts/reset_soft.bat", type: "bat", label: "Soft reset" },
      ],
    },
    {
      id: "hard_reset",
      label: "Hard Reset",
      icon: "RotateCcw",
      description: "Remove apps + configs + caches, keep models",
      group: "Reset",
      danger: "critical",
      confirmRequired: true,
      confirmMessage: "This will remove all app repos, generated configs, caches, and logs. Models and training data will be preserved. Type HARDRESET to confirm.",
      steps: [
        { run: "scripts/reset_hard.bat", type: "bat", label: "Hard reset" },
      ],
    },
  ],

  configs: [
    {
      id: "comfyui_models_yaml",
      label: "ComfyUI Shared Models",
      description: "extra_model_paths.yaml — points ComfyUI to shared models folder",
      file: "configs/comfyui_models.yaml",
      target: "{COMFYUI_DIR}/extra_model_paths.yaml",
      format: "yaml",
      editable: true,
    },
  ],

  files: [
    { path: "manifest.json", type: "data" },
    { path: "README.md", type: "readme" },
    { path: "scripts/setup_system.bat", type: "script" },
    { path: "scripts/setup_comfyui.bat", type: "script" },
    { path: "scripts/setup_swarmui.bat", type: "script" },
    { path: "scripts/setup_kohya.bat", type: "script" },
    { path: "scripts/setup_musubi.bat", type: "script" },
    { path: "scripts/update_all.bat", type: "script" },
    { path: "scripts/cleanup.bat", type: "script" },
    { path: "scripts/diagnostics.py", type: "script" },
    { path: "scripts/path_audit.py", type: "script" },
    { path: "scripts/model_audit.bat", type: "script" },
    { path: "scripts/reset_soft.bat", type: "script" },
    { path: "scripts/reset_hard.bat", type: "script" },
    { path: "configs/comfyui_models.yaml", type: "config" },
  ],

  readme: "README.md",

  changelog: [
    {
      version: "2.4.0",
      date: "2026-02-20",
      changes: [
        "Added VRAM profile auto-detection (Ultra/High/Medium/Low)",
        "SwarmUI performance settings now auto-configured",
        "Smart pull: skip pip install if git shows no changes",
        "Added shared models audit (menu option S)",
      ],
    },
    {
      version: "2.3.0",
      date: "2026-02-10",
      changes: [
        "Added Musubi Tuner support",
        "Added PATH cleanup via Python script",
        "Training data skeleton auto-created",
      ],
    },
  ],
};

// ── ComfyUI Nodes Package ────────────────────────────────────

const COMFYUI_NODES_MANIFEST: PackageManifest = {
  id: "comfyui-nodes-pack",
  name: "ComfyUI Essential Nodes",
  version: "1.2.0",
  minAppVersion: "1.0.0",
  author: "AI Command Center",
  created: "2026-02-15T00:00:00Z",
  updated: "2026-02-20T00:00:00Z",
  description: "22 recommended custom nodes for ComfyUI — Manager, Impact Pack, ControlNet, IP-Adapter, and more",
  category: "nodes",
  tags: ["comfyui", "nodes", "controlnet", "ipadapter", "face"],
  color: "#6d5aff",
  icon: "Puzzle",

  requires: {
    python: ">=3.10,<=3.12",
    gpu: "nvidia",
    os: "windows",
    dependsOn: ["rtx5090-core-setup"],
  },

  actions: [
    {
      id: "install_nodes",
      label: "Install All Nodes",
      icon: "Download",
      description: "Clone and install all 22 recommended custom nodes",
      group: "Install",
      estimatedDurationSec: 300,
      steps: [
        { run: "scripts/install_all_nodes.bat", type: "bat", label: "Install nodes" },
      ],
    },
    {
      id: "update_nodes",
      label: "Update All Nodes",
      icon: "RefreshCw",
      description: "Git pull all existing custom nodes",
      group: "Maintain",
      estimatedDurationSec: 120,
      steps: [
        { run: "scripts/update_nodes.bat", type: "bat", label: "Update nodes" },
      ],
    },
  ],

  configs: [],

  files: [
    { path: "manifest.json", type: "data" },
    { path: "README.md", type: "readme" },
    { path: "scripts/install_all_nodes.bat", type: "script" },
    { path: "scripts/update_nodes.bat", type: "script" },
    { path: "nodes/recommended_nodes.json", type: "data" },
  ],

  nodesFile: "nodes/recommended_nodes.json",
  readme: "README.md",

  changelog: [
    {
      version: "1.2.0",
      date: "2026-02-20",
      changes: [
        "Added ComfyUI-FaceID-Plus",
        "Added ComfyUI-Crystools for debug + monitoring",
        "Updated all node URLs to latest",
      ],
    },
  ],
};

// ── Training (Images) Package ────────────────────────────────

const TRAINING_IMAGES_MANIFEST: PackageManifest = {
  id: "training-images",
  name: "Image Training Pack",
  version: "1.1.0",
  minAppVersion: "1.0.0",
  author: "AI Command Center",
  created: "2026-02-18T00:00:00Z",
  updated: "2026-02-21T00:00:00Z",
  description: "Training configs for SDXL and FLUX LoRA — optimized for RTX 5090 with 32GB VRAM",
  category: "training",
  tags: ["training", "lora", "sdxl", "flux", "kohya"],
  color: "#ff6b6b",
  icon: "Image",

  requires: {
    python: ">=3.10,<=3.12",
    gpu: "nvidia",
    os: "windows",
    minVramMb: 8000,
    dependsOn: ["rtx5090-core-setup"],
  },

  actions: [
    {
      id: "deploy_configs",
      label: "Deploy Training Configs",
      icon: "FileOutput",
      description: "Copy SDXL + FLUX .toml configs to Kohya SS",
      group: "Setup",
      steps: [
        { run: "scripts/deploy_configs.bat", type: "bat", label: "Deploy configs" },
      ],
    },
  ],

  configs: [
    {
      id: "sdxl_lora",
      label: "SDXL LoRA Training",
      description: "SDXL LoRA config optimized for RTX 5090 — batch size 4-6, bf16",
      file: "configs/sdxl_lora.toml",
      target: "{KOHYA_DIR}/configs/sdxl_lora.toml",
      format: "toml",
      editable: true,
      variables: [
        {
          name: "TRAINING_DATA_DIR",
          label: "Training Data Directory",
          defaultValue: "C:/_AI/training_data/my_concept",
          inputType: "path",
          description: "Folder containing your training images + .txt captions",
        },
        {
          name: "OUTPUT_NAME",
          label: "Output LoRA Name",
          defaultValue: "my_sdxl_lora",
          inputType: "text",
          description: "Filename for the trained LoRA (without extension)",
        },
      ],
    },
    {
      id: "flux_lora",
      label: "FLUX LoRA Training",
      description: "FLUX.1 LoRA config — fp8_base enabled for RTX 5090 native FP8",
      file: "configs/flux_lora.toml",
      target: "{KOHYA_DIR}/configs/flux_lora.toml",
      format: "toml",
      editable: true,
      variables: [
        {
          name: "TRAINING_DATA_DIR",
          label: "Training Data Directory",
          defaultValue: "C:/_AI/training_data/my_concept",
          inputType: "path",
          description: "Folder containing your training images + .txt captions",
        },
        {
          name: "OUTPUT_NAME",
          label: "Output LoRA Name",
          defaultValue: "my_flux_lora",
          inputType: "text",
          description: "Filename for the trained LoRA (without extension)",
        },
      ],
    },
  ],

  files: [
    { path: "manifest.json", type: "data" },
    { path: "README.md", type: "readme" },
    { path: "scripts/deploy_configs.bat", type: "script" },
    { path: "configs/sdxl_lora.toml", type: "config" },
    { path: "configs/flux_lora.toml", type: "config" },
  ],

  readme: "README.md",

  changelog: [
    {
      version: "1.1.0",
      date: "2026-02-21",
      changes: [
        "Added FLUX LoRA config with fp8_base for Blackwell",
        "Increased SDXL batch size to 4 (RTX 5090 headroom)",
      ],
    },
  ],
};

// ── Training (Video) Package ─────────────────────────────────

const TRAINING_VIDEO_MANIFEST: PackageManifest = {
  id: "training-video",
  name: "Video Training Pack",
  version: "1.0.0",
  minAppVersion: "1.0.0",
  author: "AI Command Center",
  created: "2026-02-25T00:00:00Z",
  updated: "2026-02-25T00:00:00Z",
  description: "Training configs for HunyuanVideo and Wan2.1 video LoRAs using Musubi Tuner",
  category: "training",
  tags: ["training", "video", "hunyuanvideo", "wan", "musubi"],
  color: "#ffd93d",
  icon: "Film",

  requires: {
    python: ">=3.10,<=3.12",
    gpu: "nvidia",
    os: "windows",
    minVramMb: 24000,
    dependsOn: ["rtx5090-core-setup"],
  },

  actions: [
    {
      id: "deploy_configs",
      label: "Deploy Video Training Configs",
      icon: "FileOutput",
      description: "Copy HunyuanVideo + Wan2.1 .toml configs to Musubi Tuner",
      group: "Setup",
      steps: [
        { run: "scripts/deploy_video_configs.bat", type: "bat", label: "Deploy configs" },
      ],
    },
  ],

  configs: [
    {
      id: "hunyuan_video",
      label: "HunyuanVideo LoRA",
      description: "HunyuanVideo video LoRA config — 17 frames, fp8_base, gradient checkpointing",
      file: "configs/hunyuan_video_lora.toml",
      target: "{MUSUBI_DIR}/configs/hunyuan_video_lora.toml",
      format: "toml",
      editable: true,
      variables: [
        {
          name: "VIDEO_DATA_DIR",
          label: "Video Data Directory",
          defaultValue: "C:/_AI/training_data/video_example",
          inputType: "path",
          description: "Folder with short video clips + .txt captions",
        },
      ],
    },
    {
      id: "wan21_video",
      label: "Wan2.1 Video LoRA",
      description: "Wan2.1 video LoRA config — 16 frames, optimized for 32GB VRAM",
      file: "configs/wan21_video_lora.toml",
      target: "{MUSUBI_DIR}/configs/wan21_video_lora.toml",
      format: "toml",
      editable: true,
      variables: [
        {
          name: "VIDEO_DATA_DIR",
          label: "Video Data Directory",
          defaultValue: "C:/_AI/training_data/video_example",
          inputType: "path",
          description: "Folder with short video clips + .txt captions",
        },
      ],
    },
  ],

  files: [
    { path: "manifest.json", type: "data" },
    { path: "README.md", type: "readme" },
    { path: "scripts/deploy_video_configs.bat", type: "script" },
    { path: "configs/hunyuan_video_lora.toml", type: "config" },
    { path: "configs/wan21_video_lora.toml", type: "config" },
  ],

  readme: "README.md",
};

// ── Models Starter Package ───────────────────────────────────

const MODELS_STARTER_MANIFEST: PackageManifest = {
  id: "models-starter",
  name: "Starter Models Pack",
  version: "1.0.0",
  minAppVersion: "1.0.0",
  author: "AI Command Center",
  created: "2026-02-15T00:00:00Z",
  updated: "2026-02-20T00:00:00Z",
  description: "Download essential starter models — SDXL Base, SDXL VAE, FLUX.1 Schnell from HuggingFace",
  category: "models",
  tags: ["models", "sdxl", "flux", "huggingface", "download"],
  color: "#00d4aa",
  icon: "HardDrive",

  requires: {
    python: ">=3.10",
    gpu: "any",
    os: "windows",
  },

  actions: [
    {
      id: "download_essential",
      label: "Download Essential Models",
      icon: "Download",
      description: "SDXL Base (6.9 GB) + SDXL VAE + FLUX.1 Schnell (23 GB)",
      group: "Download",
      estimatedDurationSec: 900,
      steps: [
        { run: "scripts/download_essential.bat", type: "bat", label: "Download models" },
      ],
    },
    {
      id: "download_sdxl",
      label: "SDXL Only",
      icon: "Download",
      description: "SDXL Base checkpoint + VAE",
      group: "Download",
      estimatedDurationSec: 300,
      steps: [
        { run: "scripts/download_sdxl.bat", type: "bat", label: "Download SDXL" },
      ],
    },
    {
      id: "download_flux",
      label: "FLUX.1 Schnell Only",
      icon: "Download",
      description: "FLUX.1 Schnell (23 GB) — fast inference model",
      group: "Download",
      estimatedDurationSec: 600,
      steps: [
        { run: "scripts/download_flux.bat", type: "bat", label: "Download FLUX" },
      ],
    },
  ],

  configs: [],

  files: [
    { path: "manifest.json", type: "data" },
    { path: "README.md", type: "readme" },
    { path: "scripts/download_essential.bat", type: "script" },
    { path: "scripts/download_sdxl.bat", type: "script" },
    { path: "scripts/download_flux.bat", type: "script" },
  ],

  readme: "README.md",
};

// ── Mock Nodes List ──────────────────────────────────────────

const MOCK_NODES: CustomNodeEntry[] = [
  { name: "ComfyUI-Manager", url: "https://github.com/ltdrdata/ComfyUI-Manager.git", description: "Essential — node package manager", essential: true, category: "management" },
  { name: "ComfyUI-Impact-Pack", url: "https://github.com/ltdrdata/ComfyUI-Impact-Pack.git", description: "Detailer, SAM, bbox", essential: true, category: "processing" },
  { name: "ComfyUI-Inspire-Pack", url: "https://github.com/ltdrdata/ComfyUI-Inspire-Pack.git", description: "Prompt utilities", category: "workflow" },
  { name: "ComfyUI-KJNodes", url: "https://github.com/kijai/ComfyUI-KJNodes.git", description: "Utility nodes", category: "utility" },
  { name: "ComfyUI-GGUF", url: "https://github.com/city96/ComfyUI-GGUF.git", description: "GGUF model loading", essential: true, category: "models" },
  { name: "ComfyUI-Custom-Scripts", url: "https://github.com/pythongosssss/ComfyUI-Custom-Scripts.git", description: "Workflow tools", category: "workflow" },
  { name: "was-node-suite-comfyui", url: "https://github.com/WASasquatch/was-node-suite-comfyui.git", description: "100+ utility nodes", category: "utility" },
  { name: "ComfyUI-VideoHelperSuite", url: "https://github.com/Kosinkadink/ComfyUI-VideoHelperSuite.git", description: "Video I/O", essential: true, category: "video" },
  { name: "ComfyUI-Advanced-ControlNet", url: "https://github.com/Kosinkadink/ComfyUI-Advanced-ControlNet.git", description: "ControlNet tools", essential: true, category: "controlnet" },
  { name: "comfyui_controlnet_aux", url: "https://github.com/Fannovel16/comfyui_controlnet_aux.git", description: "Preprocessors", category: "controlnet" },
  { name: "ComfyUI-AnimateDiff-Evolved", url: "https://github.com/Kosinkadink/ComfyUI-AnimateDiff-Evolved.git", description: "Animation", category: "video" },
  { name: "ComfyUI-Florence2", url: "https://github.com/kijai/ComfyUI-Florence2.git", description: "Captioning", category: "utility" },
  { name: "rgthree-comfy", url: "https://github.com/rgthree/rgthree-comfy.git", description: "Workflow organizer", category: "workflow" },
  { name: "efficiency-nodes-comfyui", url: "https://github.com/jags111/efficiency-nodes-comfyui.git", description: "Batch processing", category: "workflow" },
  { name: "ComfyUI_IPAdapter_plus", url: "https://github.com/cubiq/ComfyUI_IPAdapter_plus.git", description: "IP-Adapter", essential: true, category: "controlnet" },
  { name: "ComfyUI-Easy-Use", url: "https://github.com/yolain/ComfyUI-Easy-Use.git", description: "Simplified workflows", category: "workflow" },
  { name: "ComfyUI_essentials", url: "https://github.com/cubiq/ComfyUI_essentials.git", description: "Essential tools", category: "utility" },
  { name: "ComfyUI-Frame-Interpolation", url: "https://github.com/Fannovel16/ComfyUI-Frame-Interpolation.git", description: "Frame interpolation", category: "video" },
  { name: "ComfyUI_FizzNodes", url: "https://github.com/FizzleDorf/ComfyUI_FizzNodes.git", description: "Scheduling nodes", category: "utility" },
  { name: "ComfyUI-Crystools", url: "https://github.com/crystian/ComfyUI-Crystools.git", description: "Debug + monitor", category: "utility" },
  { name: "comfyui-reactor-node", url: "https://github.com/Gourieff/comfyui-reactor-node.git", description: "Face swap — ReActor", category: "face" },
  { name: "ComfyUI-FaceID-Plus", url: "https://github.com/cubiq/ComfyUI-FaceID-Plus.git", description: "FaceID + IP-Adapter", category: "face" },
];

// ── Mock READMEs ─────────────────────────────────────────────

function getBuiltInReadme(packageId: string): string | null {
  const readmes: Record<string, string> = {
    "rtx5090-core-setup": `# RTX 5090 AI Stack Setup v2.4.0

Complete automated setup for your RTX 5090 AI workstation.

## What This Package Does

1. **System Prerequisites** — Python 3.12, Git, CUDA 12.8, .NET 8, VS Build Tools, ffmpeg, 7-Zip
2. **ComfyUI** — Node-based workflow editor for Stable Diffusion & FLUX
3. **SwarmUI** — User-friendly web UI with queuing & model management
4. **Kohya SS** — Training toolkit for LoRA, DreamBooth, fine-tuning
5. **Musubi Tuner** — Video model training (HunyuanVideo, Wan2.1)

## Folder Structure

\`\`\`
C:\\_AI\\
  ComfyUI/          ← Installed by this package
  SwarmUI/
  kohya_ss/
  musubi-tuner/
  models/            ← Shared models (all tools read from here)
    checkpoints/
    loras/
    vae/
    ...
  training_data/     ← Your datasets
\`\`\`

## Auto-Detected Settings

- **VRAM Profile**: Ultra (32GB) — \`--gpu-only --cuda-malloc --fast\`
- **Model Cache**: 76GB RAM cache for instant model swaps
- **PyTorch**: cu128 wheels for CUDA 12.8
- **FP8**: Native Blackwell support enabled

## Changelog

### v2.4.0 (Feb 20, 2026)
- Added VRAM profile auto-detection
- SwarmUI performance settings auto-configured
- Smart pull: skip pip if no git changes
- Added shared models audit

### v2.3.0 (Feb 10, 2026)
- Added Musubi Tuner support
- Added PATH cleanup via Python script
- Training data skeleton auto-created
`,

    "comfyui-nodes-pack": `# ComfyUI Essential Nodes v1.2.0

22 hand-picked custom nodes for a fully-featured ComfyUI setup.

## Included Nodes

### Essential (must-have)
- **ComfyUI-Manager** — Package manager for nodes
- **ComfyUI-Impact-Pack** — Detailer, SAM, face detection
- **ComfyUI-GGUF** — Load GGUF quantized models
- **ComfyUI-VideoHelperSuite** — Video input/output
- **ComfyUI-Advanced-ControlNet** — Advanced ControlNet
- **ComfyUI_IPAdapter_plus** — IP-Adapter for style/face transfer

### Recommended
- KJNodes, Custom-Scripts, was-node-suite, Florence2, rgthree, etc.

## Usage

Click "Install All Nodes" to clone all 22 nodes into ComfyUI/custom_nodes/.
Each node's requirements.txt is automatically installed.
`,

    "training-images": `# Image Training Pack v1.1.0

Pre-configured training configs for SDXL and FLUX LoRA training.

## Configs Included

### SDXL LoRA
- Optimized for RTX 5090 (32GB VRAM)
- Batch size: 4-6 (more VRAM = faster training)
- Mixed precision: bf16
- AdamW8bit optimizer

### FLUX LoRA
- FP8 base model (native on Blackwell — no quality loss!)
- Batch size: 1-2
- Text encoder outputs cached to disk
- ~12GB VRAM usage with fp8

## How to Use

1. Put your images in \`C:\\_AI\\training_data\\my_concept\\
2. Add matching .txt caption files
3. Edit the config variables (data dir, output name)
4. Click "Deploy Training Configs"
5. Launch Kohya from Quick Launcher
`,
  };

  return readmes[packageId] ?? null;
}

// ── Mock Config Content ──────────────────────────────────────

function getBuiltInConfig(packageId: string, configId: string): string | null {
  const key = `${packageId}/${configId}`;
  const configs: Record<string, string> = {
    "training-images/sdxl_lora": `# SDXL LoRA Training Config - RTX 5090
# Generated by AI Command Center

[model_arguments]
pretrained_model_name_or_path = "C:/_AI/models/checkpoints/sd_xl_base_1.0.safetensors"

[additional_network_arguments]
network_module = "networks.lora"
network_dim = 32
network_alpha = 16

[optimizer_arguments]
optimizer_type = "AdamW8bit"
learning_rate = 1e-4
lr_scheduler = "cosine_with_restarts"
lr_warmup_steps = 100

[dataset_arguments]
resolution = [1024, 1024]
enable_bucket = true
min_bucket_reso = 512
max_bucket_reso = 2048

[[dataset_arguments.subsets]]
# EDIT THIS: path to your training images
image_dir = "C:/_AI/training_data/my_concept"
num_repeats = 10
caption_extension = ".txt"

[training_arguments]
output_dir = "C:/_AI/kohya_ss/output"
output_name = "my_sdxl_lora"
save_precision = "fp16"
save_every_n_epochs = 1
train_batch_size = 4
max_train_epochs = 10
mixed_precision = "bf16"
cache_latents = true
cache_latents_to_disk = true
gradient_checkpointing = true
xformers = true
seed = 42
`,

    "training-images/flux_lora": `# FLUX.1 LoRA Training Config - RTX 5090
# Generated by AI Command Center

[model_arguments]
pretrained_model_name_or_path = "C:/_AI/models/unet/flux1-dev.safetensors"
clip_l = "C:/_AI/models/clip/clip_l.safetensors"
t5xxl = "C:/_AI/models/clip/t5xxl_fp16.safetensors"
ae = "C:/_AI/models/vae/ae.safetensors"

[additional_network_arguments]
network_module = "networks.lora_flux"
network_dim = 16
network_alpha = 8

[optimizer_arguments]
optimizer_type = "AdamW8bit"
learning_rate = 5e-5
lr_scheduler = "constant_with_warmup"
lr_warmup_steps = 100

[dataset_arguments]
resolution = [1024, 1024]
enable_bucket = true
min_bucket_reso = 512
max_bucket_reso = 2048

[[dataset_arguments.subsets]]
# EDIT THIS: path to your training images
image_dir = "C:/_AI/training_data/my_concept"
num_repeats = 10
caption_extension = ".txt"

[training_arguments]
output_dir = "C:/_AI/kohya_ss/output"
output_name = "my_flux_lora"
save_precision = "bf16"
save_every_n_epochs = 1
train_batch_size = 1
max_train_steps = 1500
mixed_precision = "bf16"
cache_latents = true
cache_latents_to_disk = true
cache_text_encoder_outputs = true
cache_text_encoder_outputs_to_disk = true
gradient_checkpointing = true
# RTX 5090: fp8 base model saves massive VRAM
fp8_base = true
seed = 42
`,

    "rtx5090-core-setup/comfyui_models_yaml": `# Auto-generated by AI Command Center
# Shared models folder so all apps use the same models
shared:
    base_path: C:\\_AI\\models
    checkpoints: checkpoints
    vae: vae
    loras: loras
    controlnet: controlnet
    clip: clip
    clip_vision: clip_vision
    upscale_models: upscale_models
    embeddings: embeddings
    ipadapter: ipadapter
    unet: unet
    diffusion_models: diffusion_models
`,

    "training-video/hunyuan_video": `# HunyuanVideo LoRA Training Config - RTX 5090
# Generated by AI Command Center

[model_arguments]
pretrained_model_name_or_path = "C:/_AI/models/unet/hunyuan-video.safetensors"

[additional_network_arguments]
network_module = "networks.lora"
network_dim = 16
network_alpha = 8

[optimizer_arguments]
optimizer_type = "AdamW8bit"
learning_rate = 3e-5
lr_scheduler = "constant_with_warmup"
lr_warmup_steps = 50

[dataset_arguments]
resolution = [512, 512]
target_frames = 17

[[dataset_arguments.subsets]]
# EDIT THIS: path to your video clips
video_dir = "C:/_AI/training_data/video_example"
caption_extension = ".txt"

[training_arguments]
output_dir = "C:/_AI/musubi-tuner/output"
output_name = "my_hunyuan_lora"
mixed_precision = "bf16"
fp8_base = true
gradient_checkpointing = true
train_batch_size = 1
max_train_steps = 1000
seed = 42
`,

    "training-video/wan21_video": `# Wan2.1 Video LoRA Training Config - RTX 5090
# Generated by AI Command Center

[model_arguments]
pretrained_model_name_or_path = "C:/_AI/models/unet/wan21.safetensors"

[additional_network_arguments]
network_module = "networks.lora"
network_dim = 16
network_alpha = 8

[optimizer_arguments]
optimizer_type = "AdamW8bit"
learning_rate = 3e-5
lr_scheduler = "constant_with_warmup"
lr_warmup_steps = 50

[dataset_arguments]
resolution = [512, 512]
target_frames = 16

[[dataset_arguments.subsets]]
# EDIT THIS: path to your video clips
video_dir = "C:/_AI/training_data/video_example"
caption_extension = ".txt"

[training_arguments]
output_dir = "C:/_AI/musubi-tuner/output"
output_name = "my_wan21_lora"
mixed_precision = "bf16"
fp8_base = true
gradient_checkpointing = true
train_batch_size = 1
max_train_steps = 1000
seed = 42
`,
  };

  // Also check localStorage for user edits
  const localKey = `pkg_config_${packageId}_${configId}`;
  const local = localStorage.getItem(localKey);
  if (local) return local;

  return configs[key] ?? null;
}
