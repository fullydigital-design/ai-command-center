// ============================================================
// Setup Service — Abstraction layer for RTX5090 setup scripts
// ============================================================
//
// RIGHT NOW:  Simulated data for UI prototype.
// MIGRATION:  Swap to FastAPI calls that run the BAT/Python scripts.
//
// FastAPI endpoints this maps to:
//   GET    /api/setup/detect              → detectInstalls()
//   POST   /api/setup/run                 → runSetupAction()
//   GET    /api/setup/stream              → connectToSetupStream() (SSE)
//   GET    /api/setup/preflight           → getPreflightChecks()
//   GET    /api/audit/path                → getPathAudit()
//   POST   /api/audit/path/fix            → applyPathFixes()
//   GET    /api/audit/env                 → getEnvAudit()
//   POST   /api/audit/env/fix             → applyEnvFixes()
//   GET    /api/setup/model-audit         → getModelAudit()
//   POST   /api/setup/reset               → runReset()
//
// ─────────────────────────────────────────────────────────
// PYTHON BACKEND IMPLEMENTATION GUIDE
// ─────────────────────────────────────────────────���───────
//
// This service wraps two scripts:
//   1. RTX5090_FULL_SETUP.bat  → Full AI stack installer/updater (16 menu options)
//   2. RTX5090_PATH_AUDIT.py   → PATH + env var audit/fixer
//
// Backend approach:
//   - subprocess.Popen() the BAT with stdin piped (to send menu choices)
//   - Stream stdout over SSE for real-time terminal output
//   - PATH_AUDIT.py gets a --json flag for structured output
//
// Required pip packages (in addition to existing requirements.txt):
//   pip install sse-starlette
//
// Example FastAPI implementation:
//
//   import asyncio, subprocess, json
//   from fastapi import APIRouter
//   from sse_starlette.sse import EventSourceResponse
//
//   router = APIRouter()
//
//   @router.get("/api/setup/detect")
//   async def detect():
//       """Check which tools are installed (mirrors BAT :detect_installs)"""
//       import os
//       base = settings.ai_root  # e.g. C:\_AI\_test_fresh_all_AI
//       return {
//           "comfyui":  os.path.exists(os.path.join(base, "ComfyUI", "main.py")),
//           "swarmui":  os.path.exists(os.path.join(base, "SwarmUI", "launchtools")),
//           "kohya":    os.path.exists(os.path.join(base, "kohya_ss", "sdxl_train_network.py"))
//                       or os.path.exists(os.path.join(base, "kohya_ss", "sd-scripts", "sdxl_train_network.py")),
//           "musubi":   os.path.exists(os.path.join(base, "musubi-tuner", "train_network.py"))
//                       or os.path.exists(os.path.join(base, "musubi-tuner", ".git")),
//       }
//
//   @router.post("/api/setup/run")
//   async def run_setup(action: str):
//       """Start a setup action; returns a stream_id for SSE"""
//       # Map action to BAT menu choice
//       choices = {
//           "full": "1", "comfyui": "2", "swarmui": "3",
//           "kohya": "4", "musubi": "5", "system": "6",
//           "nodes-models": "7", "update-all": "8",
//           "cleanup": "9", "diagnostics": "0",
//           "comfy-reset": "C", "model-audit": "S",
//           "path-cleanup": "P",
//       }
//       choice = choices.get(action)
//       # Launch BAT in subprocess with piped stdin/stdout
//       proc = subprocess.Popen(
//           ["cmd", "/c", "RTX5090_FULL_SETUP.bat"],
//           stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
//           text=True, cwd=settings.ai_root
//       )
//       proc.stdin.write(choice + "\n")
//       proc.stdin.flush()
//       # Store proc in active_processes dict, return stream_id
//       stream_id = str(proc.pid)
//       active_processes[stream_id] = proc
//       return {"stream_id": stream_id}
//
//   @router.get("/api/setup/stream")
//   async def stream(stream_id: str):
//       """SSE stream of setup stdout"""
//       proc = active_processes.get(stream_id)
//       async def generate():
//           for line in iter(proc.stdout.readline, ""):
//               yield {"event": "output", "data": json.dumps({"line": line.rstrip()})}
//           yield {"event": "done", "data": json.dumps({"exit_code": proc.wait()})}
//       return EventSourceResponse(generate())
//
//   @router.get("/api/audit/path")
//   async def path_audit():
//       """Run PATH_AUDIT.py with --json flag"""
//       result = subprocess.run(
//           ["python", "RTX5090_PATH_AUDIT.py", "3.12", "--json"],
//           capture_output=True, text=True, cwd=settings.ai_root
//       )
//       return json.loads(result.stdout)
//
//   @router.post("/api/audit/path/fix")
//   async def path_fix():
//       """Run PATH_AUDIT.py with --fix flag"""
//       result = subprocess.run(
//           ["python", "RTX5090_PATH_AUDIT.py", "3.12", "--fix"],
//           capture_output=True, text=True, cwd=settings.ai_root
//       )
//       return {"success": result.returncode == 0, "output": result.stdout}
//
//   @router.post("/api/setup/reset")
//   async def reset(level: str, confirmation: str):
//       """Run reset — requires confirmation token matching level"""
//       expected = {"soft": "RESET", "hard": "HARDRESET", "nuclear": "NUCLEAR"}
//       if confirmation != expected.get(level):
//           raise HTTPException(400, "Invalid confirmation")
//       # Pipe "R\n{choice}\n{confirmation}\n" to BAT
//       ...
//
// ============================================================

import type { DataSource } from "./types";
import { isTauriEnv, shouldTryBackend, getApiBase } from "./env";
import { fetchBackend } from "./fetchWithRetry";

// --- Types ---

/** Setup action IDs — maps to BAT menu choices */
export type SetupAction =
  | "full"
  | "comfyui"
  | "swarmui"
  | "kohya"
  | "musubi"
  | "system"
  | "nodes-models"
  | "update-all"
  | "cleanup"
  | "diagnostics"
  | "comfy-reset"
  | "model-audit"
  | "path-cleanup";

/** Reset levels — maps to BAT [R] submenu */
export type ResetLevel = "soft" | "hard" | "nuclear";

/** Tool install status (mirrors BAT :detect_installs) */
export interface ToolInstallStatus {
  id: string;
  name: string;
  installed: boolean;
  path: string;
  batMenuOption: string; // BAT menu key, e.g. "2" for ComfyUI
  setupAction: SetupAction;
}

/** Preflight check item (mirrors BAT diagnostics phase) */
export interface PreflightCheck {
  id: string;
  name: string;
  status: "ok" | "missing" | "outdated" | "warning";
  currentVersion?: string;
  requiredVersion?: string;
  detail: string;
  fixAction?: SetupAction;
}

/** PATH audit entry (mirrors RTX5090_PATH_AUDIT.py output) */
export interface PathAuditEntry {
  entry: string;
  scope: "system" | "user";
  status: "ok" | "stale" | "missing";
}

/** Environment variable audit entry */
export interface EnvAuditEntry {
  name: string;
  current: string | null;
  expected: string | null;
  status: "ok" | "fix" | "set" | "stale";
}

/** PATH audit result (full output from RTX5090_PATH_AUDIT.py --json) */
export interface PathAuditResult {
  systemPath: PathAuditEntry[];
  userPath: PathAuditEntry[];
  envVars: EnvAuditEntry[];
  oldFolders: Array<{ path: string; sizeMb: number }>;
  pythonFound: string | null;
  pythonInPath: boolean;
  totalIssues: number;
}

/** Model directory audit entry */
export interface ModelDirAudit {
  name: string;
  path: string;
  fileCount: number;
  exists: boolean;
}

/** Model audit result (mirrors BAT [S] Shared Models Audit) */
export interface ModelAuditResult {
  modelsRoot: string;
  modelsRootExists: boolean;
  directories: ModelDirAudit[];
  totalModelFiles: number;
  comfyYamlOk: boolean;
  swarmYamlOk: boolean;
  warnings: number;
}

/** Terminal output line (for streaming) */
export interface TerminalLine {
  id: number;
  text: string;
  type: "info" | "ok" | "warn" | "error" | "install" | "progress" | "plain";
  timestamp: number;
}

/** Setup task state */
export interface SetupTask {
  streamId: string | null;
  action: SetupAction;
  running: boolean;
  lines: TerminalLine[];
  exitCode: number | null;
  startTime: number;
}

/** Reset option display info */
export interface ResetOption {
  level: ResetLevel;
  title: string;
  description: string;
  removes: string[];
  keeps: string[];
  confirmText: string;
  danger: "low" | "medium" | "critical";
}

// ============================================================
// PUBLIC API
// ============================================================

export function getDataSource(): DataSource {
  return isTauriEnv() ? "process" : "simulated";
}

/**
 * Detect which AI tools are installed.
 * Browser: simulated status based on typical fresh install.
 * Tauri: GET /api/setup/detect (checks filesystem)
 */
export async function detectInstalls(): Promise<ToolInstallStatus[]> {
  if (shouldTryBackend()) {
    try {
      const res = await fetchBackend(`${getApiBase()}/setup/detect`);
      if (res.ok) return await res.json();
    } catch { /* fall through */ }
  }

  return [
    { id: "comfyui", name: "ComfyUI", installed: true, path: "C:\\_AI\\_test_fresh_all_AI\\ComfyUI", batMenuOption: "2", setupAction: "comfyui" },
    { id: "swarmui", name: "SwarmUI", installed: true, path: "C:\\_AI\\_test_fresh_all_AI\\SwarmUI", batMenuOption: "3", setupAction: "swarmui" },
    { id: "kohya", name: "Kohya SS", installed: true, path: "C:\\_AI\\_test_fresh_all_AI\\kohya_ss", batMenuOption: "4", setupAction: "kohya" },
    { id: "musubi", name: "Musubi Tuner", installed: true, path: "C:\\_AI\\_test_fresh_all_AI\\musubi-tuner", batMenuOption: "5", setupAction: "musubi" },
  ];
}

/**
 * Run preflight system checks (mirrors BAT diagnostics phase).
 * Browser: simulated results for your RTX 5090 build.
 * Tauri: GET /api/setup/preflight (runs actual checks)
 */
export async function getPreflightChecks(): Promise<PreflightCheck[]> {
  if (shouldTryBackend()) {
    try {
      const res = await fetchBackend(`${getApiBase()}/setup/preflight`);
      if (res.ok) return await res.json();
    } catch { /* fall through */ }
  }

  return [
    { id: "python", name: "Python 3.12", status: "ok", currentVersion: "3.12.8", requiredVersion: "3.10+", detail: "Python 3.12.8 (recommended)", fixAction: "system" },
    { id: "git", name: "Git", status: "ok", currentVersion: "2.47.1", detail: "Git for Windows", fixAction: "system" },
    { id: "cuda", name: "CUDA Toolkit", status: "ok", currentVersion: "12.8.0", requiredVersion: "12.6+", detail: "NVIDIA CUDA Compiler", fixAction: "system" },
    { id: "nvidia", name: "NVIDIA Driver", status: "ok", currentVersion: "572.16", requiredVersion: "570+", detail: "RTX 5090 driver", fixAction: "system" },
    { id: "dotnet", name: ".NET 8 SDK", status: "ok", currentVersion: "8.0.404", requiredVersion: "8.x", detail: "Required for SwarmUI", fixAction: "system" },
    { id: "vsbuild", name: "VS Build Tools", status: "ok", detail: "Visual Studio 2022 Build Tools C++", fixAction: "system" },
    { id: "vscode", name: "VS Code", status: "ok", currentVersion: "1.96.2", detail: "With Python + Copilot extensions", fixAction: "system" },
    { id: "ffmpeg", name: "FFmpeg", status: "ok", currentVersion: "7.1", detail: "Audio/video processing", fixAction: "system" },
    { id: "7zip", name: "7-Zip", status: "ok", currentVersion: "24.09", detail: "Archive utility", fixAction: "system" },
    { id: "winget", name: "winget", status: "ok", detail: "Windows Package Manager", fixAction: "system" },
  ];
}

/**
 * Run a setup action (triggers BAT section).
 * Browser: simulated terminal output.
 * Tauri: POST /api/setup/run → returns stream_id for SSE.
 */
export async function runSetupAction(action: SetupAction): Promise<SetupTask> {
  const task: SetupTask = {
    streamId: null,
    action,
    running: true,
    lines: [],
    exitCode: null,
    startTime: Date.now(),
  };

  if (shouldTryBackend()) {
    try {
      const res = await fetchBackend(`${getApiBase()}/setup/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (res.ok) {
        const data = await res.json();
        task.streamId = data.stream_id;
        return task;
      }
    } catch { /* fall through */ }
  }

  // Browser simulation — generate fake terminal lines
  task.lines = simulateSetupOutput(action);
  task.running = false;
  task.exitCode = 0;
  return task;
}

/**
 * Connect to SSE stream for real-time setup output.
 * Only works in Tauri mode.
 * Returns cleanup function.
 */
export function connectToSetupStream(
  streamId: string,
  onLine: (line: TerminalLine) => void,
  onDone: (exitCode: number) => void
): () => void {
  if (!shouldTryBackend()) return () => {};

  let lineId = 0;
  const eventSource = new EventSource(
    `${getApiBase()}/setup/stream?stream_id=${streamId}`
  );

  eventSource.addEventListener("output", (event) => {
    try {
      const data = JSON.parse(event.data);
      onLine({
        id: lineId++,
        text: data.line,
        type: classifyLine(data.line),
        timestamp: Date.now(),
      });
    } catch { /* ignore parse errors */ }
  });

  eventSource.addEventListener("done", (event) => {
    try {
      const data = JSON.parse(event.data);
      onDone(data.exit_code);
    } catch {
      onDone(-1);
    }
    eventSource.close();
  });

  eventSource.onerror = () => {
    console.warn("[SetupService] SSE connection lost");
  };

  return () => eventSource.close();
}

/**
 * Run PATH audit.
 * Browser: simulated clean PATH.
 * Tauri: GET /api/audit/path (runs RTX5090_PATH_AUDIT.py --json)
 */
export async function getPathAudit(): Promise<PathAuditResult> {
  if (shouldTryBackend()) {
    try {
      const res = await fetchBackend(`${getApiBase()}/audit/path`);
      if (res.ok) return await res.json();
    } catch { /* fall through */ }
  }

  return {
    systemPath: [
      { entry: "C:\\Program Files\\NVIDIA GPU Computing Toolkit\\CUDA\\v12.8\\bin", scope: "system", status: "ok" },
      { entry: "C:\\Program Files\\NVIDIA GPU Computing Toolkit\\CUDA\\v12.8\\libnvvp", scope: "system", status: "ok" },
      { entry: "C:\\Python312", scope: "system", status: "ok" },
      { entry: "C:\\Python312\\Scripts", scope: "system", status: "ok" },
      { entry: "C:\\Program Files\\Git\\cmd", scope: "system", status: "ok" },
      { entry: "C:\\Program Files\\7-Zip", scope: "system", status: "ok" },
      { entry: "C:\\ffmpeg\\bin", scope: "system", status: "ok" },
      { entry: "C:\\Program Files\\dotnet", scope: "system", status: "ok" },
      { entry: "C:\\Windows\\System32", scope: "system", status: "ok" },
    ],
    userPath: [
      { entry: "%LOCALAPPDATA%\\Microsoft\\WindowsApps", scope: "user", status: "ok" },
      { entry: "%LOCALAPPDATA%\\Programs\\Microsoft VS Code\\bin", scope: "user", status: "ok" },
    ],
    envVars: [
      { name: "CUDA_HOME", current: "C:\\Program Files\\NVIDIA GPU Computing Toolkit\\CUDA\\v12.8", expected: "C:\\Program Files\\NVIDIA GPU Computing Toolkit\\CUDA\\v12.8", status: "ok" },
      { name: "CUDA_PATH", current: "C:\\Program Files\\NVIDIA GPU Computing Toolkit\\CUDA\\v12.8", expected: "C:\\Program Files\\NVIDIA GPU Computing Toolkit\\CUDA\\v12.8", status: "ok" },
      { name: "CUDA_DEVICE_ORDER", current: "PCI_BUS_ID", expected: "PCI_BUS_ID", status: "ok" },
      { name: "NVIDIA_TF32_OVERRIDE", current: "1", expected: "1", status: "ok" },
      { name: "PYTORCH_CUDA_ALLOC_CONF", current: "expandable_segments:True,garbage_collection_threshold:0.8", expected: "expandable_segments:True,garbage_collection_threshold:0.8", status: "ok" },
      { name: "TORCH_CUDNN_V8_API_ENABLED", current: "1", expected: "1", status: "ok" },
    ],
    oldFolders: [],
    pythonFound: "C:\\Python312",
    pythonInPath: true,
    totalIssues: 0,
  };
}

/**
 * Apply PATH fixes.
 * Browser: simulated success.
 * Tauri: POST /api/audit/path/fix
 */
export async function applyPathFixes(): Promise<{ success: boolean; removed: number; added: number }> {
  if (shouldTryBackend()) {
    try {
      const res = await fetchBackend(`${getApiBase()}/audit/path/fix`, { method: "POST" });
      if (res.ok) return await res.json();
    } catch { /* fall through */ }
  }

  await new Promise((r) => setTimeout(r, 2000));
  return { success: true, removed: 0, added: 0 };
}

/**
 * Apply environment variable fixes.
 * Browser: simulated success.
 * Tauri: POST /api/audit/env/fix
 */
export async function applyEnvFixes(): Promise<{ success: boolean; fixed: number }> {
  if (shouldTryBackend()) {
    try {
      const res = await fetchBackend(`${getApiBase()}/audit/env/fix`, { method: "POST" });
      if (res.ok) return await res.json();
    } catch { /* fall through */ }
  }

  await new Promise((r) => setTimeout(r, 2000));
  return { success: true, fixed: 0 };
}

/**
 * Run model directory audit.
 * Browser: simulated counts.
 * Tauri: GET /api/setup/model-audit (mirrors BAT [S] option)
 */
export async function getModelAudit(): Promise<ModelAuditResult> {
  if (shouldTryBackend()) {
    try {
      const res = await fetchBackend(`${getApiBase()}/setup/model-audit`);
      if (res.ok) return await res.json();
    } catch { /* fall through */ }
  }

  return {
    modelsRoot: "C:\\_AI\\_test_fresh_all_AI\\models",
    modelsRootExists: true,
    directories: [
      { name: "checkpoints", path: "models\\checkpoints", fileCount: 8, exists: true },
      { name: "vae", path: "models\\vae", fileCount: 3, exists: true },
      { name: "loras", path: "models\\loras", fileCount: 24, exists: true },
      { name: "controlnet", path: "models\\controlnet", fileCount: 6, exists: true },
      { name: "clip", path: "models\\clip", fileCount: 4, exists: true },
      { name: "clip_vision", path: "models\\clip_vision", fileCount: 2, exists: true },
      { name: "upscale_models", path: "models\\upscale_models", fileCount: 5, exists: true },
      { name: "embeddings", path: "models\\embeddings", fileCount: 12, exists: true },
      { name: "ipadapter", path: "models\\ipadapter", fileCount: 3, exists: true },
      { name: "unet", path: "models\\unet", fileCount: 2, exists: true },
      { name: "diffusion_models", path: "models\\diffusion_models", fileCount: 4, exists: true },
    ],
    totalModelFiles: 73,
    comfyYamlOk: true,
    swarmYamlOk: true,
    warnings: 0,
  };
}

/**
 * Trigger a reset operation.
 * Browser: simulated.
 * Tauri: POST /api/setup/reset (requires confirmation token)
 */
export async function runReset(
  level: ResetLevel,
  confirmation: string
): Promise<{ success: boolean; message: string }> {
  const expected: Record<ResetLevel, string> = {
    soft: "RESET",
    hard: "HARDRESET",
    nuclear: "NUCLEAR",
  };

  if (confirmation !== expected[level]) {
    return { success: false, message: "Invalid confirmation text" };
  }

  if (shouldTryBackend()) {
    try {
      const res = await fetchBackend(`${getApiBase()}/setup/reset`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ level, confirmation }),
      });
      if (res.ok) return await res.json();
    } catch { /* fall through */ }
  }

  await new Promise((r) => setTimeout(r, 3000));
  return { success: true, message: `${level} reset completed (simulated)` };
}

// ============================================================
// STATIC DATA
// ============================================================

/** Setup actions — maps BAT menu to display data */
export function getSetupActions(): Array<{
  action: SetupAction;
  batKey: string;
  label: string;
  description: string;
  icon: string;
  category: "full" | "tool" | "maintenance";
}> {
  return [
    { action: "full", batKey: "1", label: "Full Setup", description: "Everything — system + ComfyUI + SwarmUI + Kohya + Musubi", icon: "Rocket", category: "full" },
    { action: "comfyui", batKey: "2", label: "ComfyUI", description: "Install or update ComfyUI + custom nodes", icon: "Paintbrush", category: "tool" },
    { action: "swarmui", batKey: "3", label: "SwarmUI", description: "Install or update SwarmUI", icon: "Bug", category: "tool" },
    { action: "kohya", batKey: "4", label: "Kohya SS", description: "Install or update Kohya ss / sd-scripts", icon: "FlaskConical", category: "tool" },
    { action: "musubi", batKey: "5", label: "Musubi Tuner", description: "Install or update Musubi Tuner", icon: "Film", category: "tool" },
    { action: "system", batKey: "6", label: "System Only", description: "Drivers, Python, packages — no app installs", icon: "Cpu", category: "maintenance" },
    { action: "nodes-models", batKey: "7", label: "Custom Nodes + Models", description: "Add-ons for ComfyUI", icon: "Puzzle", category: "maintenance" },
    { action: "update-all", batKey: "8", label: "Update ALL", description: "Quick update pass for all tools", icon: "RefreshCw", category: "maintenance" },
    { action: "cleanup", batKey: "9", label: "Cleanup", description: "Temp files, caches, __pycache__", icon: "Trash2", category: "maintenance" },
    { action: "diagnostics", batKey: "0", label: "Diagnostics", description: "Full system summary", icon: "Stethoscope", category: "maintenance" },
    { action: "comfy-reset", batKey: "C", label: "ComfyUI Reset", description: "Clean custom nodes back to pristine", icon: "RotateCcw", category: "maintenance" },
    { action: "model-audit", batKey: "S", label: "Model Audit", description: "Verify shared model links + counts", icon: "FolderSearch", category: "maintenance" },
    { action: "path-cleanup", batKey: "P", label: "PATH Cleanup", description: "Fix stale Python/CUDA paths", icon: "Route", category: "maintenance" },
  ];
}

/** Reset options for the danger zone */
export function getResetOptions(): ResetOption[] {
  return [
    {
      level: "soft",
      title: "Soft Reset",
      description: "Remove app repos only — models and training data preserved",
      removes: ["ComfyUI", "SwarmUI", "Kohya SS", "Musubi Tuner"],
      keeps: ["models/", "training_data/", "System tools"],
      confirmText: "RESET",
      danger: "low",
    },
    {
      level: "hard",
      title: "Hard Reset",
      description: "Apps + configs + caches — keeps models and training data",
      removes: ["All app repos", "Generated launchers/configs", "__pycache__ and .pyc files", "pip cache", "Setup log"],
      keeps: ["models/", "training_data/"],
      confirmText: "HARDRESET",
      danger: "medium",
    },
    {
      level: "nuclear",
      title: "Nuclear Reset",
      description: "Everything except the setup scripts themselves",
      removes: ["ALL apps", "ALL models (checkpoints, LoRAs, VAEs...)", "ALL training data", "ALL configs, launchers, caches, logs"],
      keeps: ["RTX5090_FULL_SETUP.bat", "RTX5090_PATH_AUDIT.py"],
      confirmText: "NUCLEAR",
      danger: "critical",
    },
  ];
}

// ============================================================
// INTERNAL HELPERS
// ============================================================

/** Classify a terminal output line by its prefix for coloring */
export function classifyLine(text: string): TerminalLine["type"] {
  const t = text.trim();
  if (t.startsWith("[OK]") || t.startsWith("[INSTALLED]") || t.startsWith("[DONE]")) return "ok";
  if (t.startsWith("[WARN]") || t.startsWith("[MISSING]") || t.startsWith("[STALE]")) return "warn";
  if (t.startsWith("[ERROR]") || t.startsWith("[FAIL]")) return "error";
  if (t.startsWith("[AUTO-INSTALL]") || t.startsWith("[INSTALL]") || t.startsWith("[CLONE]") || t.startsWith("[ADD]")) return "install";
  if (t.includes("####") || t.includes("----") || t.includes("====")) return "progress";
  if (t.startsWith("[")) return "info";
  return "plain";
}

/** Generate simulated terminal output for browser mode */
function simulateSetupOutput(action: SetupAction): TerminalLine[] {
  let lineId = 0;
  const now = Date.now();

  const lines: Array<{ text: string; delay: number }> = [];

  const actionLabels: Record<string, string> = {
    full: "FULL SETUP",
    comfyui: "ComfyUI Install/Update",
    swarmui: "SwarmUI Install/Update",
    kohya: "Kohya SS Install/Update",
    musubi: "Musubi Tuner Install/Update",
    system: "SYSTEM SETUP",
    "nodes-models": "Custom Nodes + Models",
    "update-all": "QUICK UPDATE ALL",
    cleanup: "CLEANUP",
    diagnostics: "DIAGNOSTICS",
    "comfy-reset": "ComfyUI Custom Nodes Reset",
    "model-audit": "SHARED MODELS AUDIT",
    "path-cleanup": "PATH CLEANUP",
  };

  const label = actionLabels[action] || action.toUpperCase();

  lines.push({ text: "", delay: 0 });
  lines.push({ text: " +===========================================================+", delay: 50 });
  lines.push({ text: " :     RTX 5090 AI Stack — Setup + Auto-Update               :", delay: 100 });
  lines.push({ text: " :     System: RTX 5090 + Ryzen 9950X + 96GB RAM             :", delay: 150 });
  lines.push({ text: " +===========================================================+", delay: 200 });
  lines.push({ text: "", delay: 250 });
  lines.push({ text: " =============================================================", delay: 300 });
  lines.push({ text: `  ${label}`, delay: 350 });
  lines.push({ text: " =============================================================", delay: 400 });
  lines.push({ text: "", delay: 450 });

  if (action === "system" || action === "full") {
    lines.push({ text: "  [OK] winget", delay: 600 });
    lines.push({ text: "  [OK] Git", delay: 800 });
    lines.push({ text: "  [OK] Python 3.12.8", delay: 1000 });
    lines.push({ text: "  [OK] .NET 8 SDK", delay: 1200 });
    lines.push({ text: "  [OK] VS Build Tools C++", delay: 1400 });
    lines.push({ text: "  [OK] VS Code", delay: 1600 });
    lines.push({ text: "  [OK] 7-Zip", delay: 1800 });
    lines.push({ text: "  [OK] ffmpeg", delay: 2000 });
    lines.push({ text: "", delay: 2100 });
    lines.push({ text: "  [OK] NVIDIA Driver: 572.16", delay: 2300 });
    lines.push({ text: "  [OK] CUDA 12.8.0", delay: 2500 });
    lines.push({ text: "", delay: 2600 });
    lines.push({ text: "  [OK] PyTorch 2.6.0+cu128", delay: 2900 });
    lines.push({ text: "  [OK] xformers 0.0.29", delay: 3100 });
    lines.push({ text: "", delay: 3200 });
  }

  if (action === "comfyui" || action === "full") {
    lines.push({ text: "  [OK] ComfyUI already installed — updating...", delay: 3500 });
    lines.push({ text: "  [OK] git pull — Already up to date.", delay: 3800 });
    lines.push({ text: "  [OK] pip requirements — all satisfied", delay: 4100 });
  }

  if (action === "update-all") {
    lines.push({ text: "  [OK] ComfyUI — Already up to date.", delay: 600 });
    lines.push({ text: "  [OK] SwarmUI — Already up to date.", delay: 1200 });
    lines.push({ text: "  [OK] Kohya SS — Already up to date.", delay: 1800 });
    lines.push({ text: "  [OK] Musubi Tuner — Already up to date.", delay: 2400 });
    lines.push({ text: "  [OK] pip packages — all up to date.", delay: 3000 });
  }

  if (action === "model-audit") {
    lines.push({ text: "  [OK] Shared models root: C:\\_AI\\_test_fresh_all_AI\\models", delay: 600 });
    lines.push({ text: "", delay: 700 });
    lines.push({ text: "  Model subdirectories:", delay: 800 });
    lines.push({ text: "    [OK]          checkpoints ... 8 files", delay: 1000 });
    lines.push({ text: "    [OK]                  vae ... 3 files", delay: 1100 });
    lines.push({ text: "    [OK]                loras ... 24 files", delay: 1200 });
    lines.push({ text: "    [OK]           controlnet ... 6 files", delay: 1300 });
    lines.push({ text: "    [OK]                 clip ... 4 files", delay: 1400 });
    lines.push({ text: "    [OK]          clip_vision ... 2 files", delay: 1500 });
    lines.push({ text: "    [OK]       upscale_models ... 5 files", delay: 1600 });
    lines.push({ text: "    [OK]           embeddings ... 12 files", delay: 1700 });
    lines.push({ text: "    [OK]            ipadapter ... 3 files", delay: 1800 });
    lines.push({ text: "    [OK]                 unet ... 2 files", delay: 1900 });
    lines.push({ text: "    [OK]     diffusion_models ... 4 files", delay: 2000 });
    lines.push({ text: "", delay: 2100 });
    lines.push({ text: "  Total model files: 73", delay: 2200 });
    lines.push({ text: "", delay: 2300 });
    lines.push({ text: "  [OK] ComfyUI extra_model_paths.yaml", delay: 2500 });
    lines.push({ text: "  [OK] SwarmUI Model-Paths.fds", delay: 2700 });
  }

  if (action === "cleanup") {
    lines.push({ text: "  [CLEAN] Removing __pycache__ directories...", delay: 600 });
    lines.push({ text: "  [OK] Removed 47 __pycache__ directories", delay: 1200 });
    lines.push({ text: "  [CLEAN] Removing .pyc files...", delay: 1500 });
    lines.push({ text: "  [OK] Removed 312 .pyc files", delay: 2000 });
    lines.push({ text: "  [CLEAN] Purging pip cache...", delay: 2300 });
    lines.push({ text: "  [OK] pip cache purged", delay: 2800 });
  }

  if (action === "diagnostics") {
    lines.push({ text: "  [OK] Python: 3.12.8", delay: 600 });
    lines.push({ text: "  [OK] Git: 2.47.1", delay: 800 });
    lines.push({ text: "  [OK] CUDA: 12.8.0", delay: 1000 });
    lines.push({ text: "  [OK] NVIDIA Driver: 572.16", delay: 1200 });
    lines.push({ text: "  [OK] PyTorch: 2.6.0+cu128 (CUDA available: True)", delay: 1400 });
    lines.push({ text: "  [OK] GPU: NVIDIA GeForce RTX 5090 (32 GB)", delay: 1600 });
    lines.push({ text: "  [OK] VRAM Free: 28.4 GB / 32.0 GB", delay: 1800 });
    lines.push({ text: "  [OK] RAM Free: 52.1 GB / 86.0 GB", delay: 2000 });
    lines.push({ text: "  [OK] Disk Free: 1.27 TB / 2.00 TB", delay: 2200 });
  }

  if (action === "path-cleanup") {
    lines.push({ text: "  Running RTX5090_PATH_AUDIT.py 3.12 ...", delay: 600 });
    lines.push({ text: "", delay: 800 });
    lines.push({ text: "  ==============================", delay: 900 });
    lines.push({ text: "   SYSTEM PATH AUDIT", delay: 1000 });
    lines.push({ text: "  ==============================", delay: 1100 });
    lines.push({ text: "   [OK]      C:\\Python312", delay: 1300 });
    lines.push({ text: "   [OK]      C:\\Python312\\Scripts", delay: 1400 });
    lines.push({ text: "   [OK]      C:\\Program Files\\Git\\cmd", delay: 1500 });
    lines.push({ text: "   [OK]      C:\\Program Files\\NVIDIA GPU Computing Toolkit\\CUDA\\v12.8\\bin", delay: 1600 });
    lines.push({ text: "", delay: 1800 });
    lines.push({ text: "  [OK] PATH is clean! Nothing to fix.", delay: 2000 });
    lines.push({ text: "  [OK] All environment variables correct!", delay: 2200 });
  }

  // Done
  lines.push({ text: "", delay: lines[lines.length - 1].delay + 300 });
  lines.push({ text: " +-------------------------------------------------------+", delay: lines[lines.length - 1].delay + 100 });
  lines.push({ text: `  ${label} Complete`, delay: lines[lines.length - 1].delay + 100 });
  lines.push({ text: " +-------------------------------------------------------+", delay: lines[lines.length - 1].delay + 100 });

  return lines.map((l) => ({
    id: lineId++,
    text: l.text,
    type: classifyLine(l.text),
    timestamp: now + l.delay,
  }));
}