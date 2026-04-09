// ============================================================
// Training Service — Abstraction layer for Training Monitor
// ============================================================
//
// RIGHT NOW:  Simulated data for UI prototype.
// MIGRATION:  Swap to FastAPI calls. The component code stays untouched.
//
// FastAPI endpoints this maps to:
//   GET  /api/training/jobs              → getTrainingJobs()
//   GET  /api/training/jobs/:id          → getJobDetail()
//   GET  /api/training/jobs/:id/loss     → getLossHistory()
//   GET  /api/training/gpu               → getGpuStats()
//   GET  /api/training/services          → getServiceHealth()
//   GET  /api/training/poll              → pollTrainingUpdates() (SSE or WebSocket)
//
// ─────────────────────────────────────────────────────────
// PYTHON BACKEND IMPLEMENTATION GUIDE
// ─────────────────────────────────────────────────────────
//
// Required pip packages:
//   pip install fastapi uvicorn psutil pynvml tbparse tomli
//
// How each data source works:
//
// 1. PROCESS DETECTION (psutil)
//    - Scan all processes for cmdline containing "accelerate" or "musubi"
//    - Parse CLI args to find --config_file (path to .toml)
//    - Kohya: `accelerate launch --config_file ... train_network.py --config_file train.toml`
//    - Musubi: `python musubi_tuner/train.py --config_file train.toml`
//
// 2. CONFIG PARSING (tomli)
//    - Read the .toml config file found from process args
//    - Extract: output_name, pretrained_model_name_or_path, train_data_dir,
//      resolution, train_batch_size, max_train_epochs, max_train_steps,
//      learning_rate, output_dir, logging_dir
//
// 3. TENSORBOARD LOGS (tbparse)
//    - Point SummaryReader at the logging_dir from the config
//    - Read scalars: "loss", "train/loss", "lr", "epoch"
//    - This gives you the full loss curve + current training state
//    - Example:
//      from tbparse import SummaryReader
//      reader = SummaryReader(log_dir)
//      loss_df = reader.scalars[reader.scalars.tag == "loss"]
//
// 4. GPU STATS (pynvml)
//    - nvmlInit() → nvmlDeviceGetHandleByIndex(0)
//    - nvmlDeviceGetUtilizationRates → gpu_util, mem_util
//    - nvmlDeviceGetMemoryInfo → used, total
//    - nvmlDeviceGetTemperature, nvmlDeviceGetPowerUsage
//
// 5. SERVICE HEALTH (psutil + socket)
//    - Check if port 7860 (Kohya), 6006 (TensorBoard) are open
//    - Or scan processes for matching command lines
//
// 6. REAL-TIME UPDATES — Three upgrade paths (frontend supports all)
//
//    OPTION A: Simple polling (current default — works today)
//    ────────────────────────────────────────────────────────
//    Frontend: setInterval → GET /api/training/poll every 3s
//    Backend:
//      @app.get("/api/training/poll")
//      async def poll():
//          return scan_training_jobs()  # Same as /api/training/jobs
//    Pros: Simplest, works everywhere. Cons: Wastes requests when idle.
//
//    OPTION B: Server-Sent Events (recommended upgrade)
//    ────────────────────────────────────────────────────────
//    Frontend: new EventSource("/api/training/stream")
//    Backend:
//      from sse_starlette.sse import EventSourceResponse
//      @app.get("/api/training/stream")
//      async def stream():
//          async def generate():
//              while True:
//                  jobs = scan_training_jobs()
//                  yield {"event": "update", "data": json.dumps(jobs)}
//                  await asyncio.sleep(3)
//          return EventSourceResponse(generate())
//    Pros: Efficient (server only sends when data changes), auto-reconnect.
//    Cons: One-directional (server → client only).
//    pip install: sse-starlette
//
//    OPTION C: WebSocket (for bidirectional needs)
//    ────────────────────────────────────────────────────────
//    Frontend: new WebSocket("ws://127.0.0.1:8000/ws/training")
//    Backend:
//      @app.websocket("/ws/training")
//      async def ws(websocket: WebSocket):
//          await websocket.accept()
//          while True:
//              jobs = scan_training_jobs()
//              await websocket.send_json(jobs)
//              await asyncio.sleep(3)
//    Pros: Bidirectional (can send commands back to backend).
//    Cons: More complex, needs manual reconnect handling.
//
//    MIGRATION: The frontend's pollTrainingUpdates() function below
//    already checks isTauriEnv(). To upgrade from polling to SSE:
//    1. Add connectToSSE() function that creates an EventSource
//    2. Call it once on mount instead of setInterval
//    3. On each "update" event, update the jobs state
//    The UI code in TrainingPage.tsx needs zero changes either way.
//
// ============================================================

import type {
  TrainingJob,
  GpuStats,
  ServiceHealth,
  DataSource,
  LossDataPoint,
} from "./types";

// --- Environment detection (single source of truth: env.ts) ---
import { isTauriEnv, shouldTryBackend, getApiBase } from "./env";
import { fetchBackend, fetchHealth } from "./fetchWithRetry";
import { TOOL_REGISTRY } from "./toolsRegistry";

// --- Loss curve generator (browser simulation) ---

function generateLossHistory(steps: number): LossDataPoint[] {
  return Array.from({ length: steps }, (_, i) => ({
    step: (i + 1) * 10,
    loss: 0.5 * Math.exp(-i * 0.03) + Math.random() * 0.02 + 0.02,
  }));
}

// --- Mock data (browser prototype) ---

const mockJobs: TrainingJob[] = [
  {
    id: "sim-1",
    name: "Character LoRA v3 - Anime Style",
    type: "kohya-lora",
    tool: "kohya",
    status: "running",
    progress: 62,
    epoch: 8,
    totalEpochs: 12,
    currentStep: 3720,
    totalSteps: 6000,
    loss: 0.0847,
    learningRate: "1e-4",
    batchSize: 4,
    resolution: "1024x1024",
    dataset: "character_dataset_v3",
    datasetSize: 156,
    startTime: "2 hrs ago",
    eta: "1h 15m",
    gpuUsage: 89,
    vramUsage: 24.6,
    model: "FLUX.1-dev",
    outputPath: "C:\\_AI\\_test_fresh_all_AI\\training_data\\output\\character_lora_v3",
    lossHistory: generateLossHistory(37),
    configPath: "C:\\_AI\\_test_fresh_all_AI\\kohya_ss\\presets\\character_lora_v3.toml",
    tensorboardLogDir: "C:\\_AI\\_test_fresh_all_AI\\training_data\\logs\\character_lora_v3",
  },
  {
    id: "sim-2",
    name: "Musubi Video Fine-tune - Walk Cycle",
    type: "musubi-video",
    tool: "musubi",
    status: "running",
    progress: 34,
    epoch: 3,
    totalEpochs: 8,
    currentStep: 1360,
    totalSteps: 4000,
    loss: 0.1234,
    learningRate: "5e-5",
    batchSize: 1,
    resolution: "512x512",
    dataset: "walk_cycle_clips",
    datasetSize: 48,
    startTime: "45 min ago",
    eta: "3h 20m",
    gpuUsage: 95,
    vramUsage: 28.4,
    model: "Wan2.1 I2V 14B",
    outputPath: "C:\\_AI\\_test_fresh_all_AI\\training_data\\output\\musubi_walk_cycle",
    lossHistory: generateLossHistory(13),
    configPath: "C:\\_AI\\_test_fresh_all_AI\\musubi-tuner\\configs\\walk_cycle.toml",
    tensorboardLogDir: "C:\\_AI\\_test_fresh_all_AI\\training_data\\logs\\musubi_walk_cycle",
  },
  {
    id: "sim-3",
    name: "SDXL LoRA - Landscape Style",
    type: "kohya-sdxl",
    tool: "kohya",
    status: "completed",
    progress: 100,
    epoch: 20,
    totalEpochs: 20,
    currentStep: 8000,
    totalSteps: 8000,
    loss: 0.0623,
    learningRate: "1e-4",
    batchSize: 2,
    resolution: "1024x1024",
    dataset: "landscape_photos",
    datasetSize: 312,
    startTime: "Yesterday",
    eta: "Completed",
    gpuUsage: 0,
    vramUsage: 0,
    model: "Illustrious XL v3",
    outputPath: "C:\\_AI\\_test_fresh_all_AI\\training_data\\output\\landscape_lora",
    lossHistory: generateLossHistory(80),
    configPath: "C:\\_AI\\_test_fresh_all_AI\\kohya_ss\\presets\\landscape_sdxl.toml",
    tensorboardLogDir: "C:\\_AI\\_test_fresh_all_AI\\training_data\\logs\\landscape_lora",
  },
  {
    id: "sim-4",
    name: "Video LoRA - Camera Pan",
    type: "musubi-video",
    tool: "musubi",
    status: "failed",
    progress: 15,
    epoch: 1,
    totalEpochs: 10,
    currentStep: 600,
    totalSteps: 4000,
    loss: 0.4521,
    learningRate: "1e-4",
    batchSize: 1,
    resolution: "512x512",
    dataset: "camera_pan_clips",
    datasetSize: 32,
    startTime: "3 hrs ago",
    eta: "Failed - OOM",
    gpuUsage: 0,
    vramUsage: 0,
    model: "Wan2.1 I2V 14B",
    outputPath: "C:\\_AI\\_test_fresh_all_AI\\training_data\\output\\camera_pan_lora",
    lossHistory: generateLossHistory(6),
    configPath: "C:\\_AI\\_test_fresh_all_AI\\musubi-tuner\\configs\\camera_pan.toml",
    tensorboardLogDir: "C:\\_AI\\_test_fresh_all_AI\\training_data\\logs\\camera_pan_lora",
  },
];

// ============================================================
// PUBLIC API
// ============================================================

/**
 * Get the data source for all training data.
 * Components use this to show "Simulated" vs "Live" badges.
 */
export function getDataSource(): DataSource {
  return isTauriEnv() ? "process" : "simulated";
}

/**
 * Fetch all detected training jobs.
 * Browser: returns mock data.
 * Tauri: GET /api/training/jobs (scans processes + TensorBoard logs)
 */
export async function getTrainingJobs(): Promise<TrainingJob[]> {
  if (shouldTryBackend()) {
    try {
      const res = await fetchBackend(`${getApiBase()}/training/jobs`);
      if (!res.ok) throw new Error("Failed to fetch jobs");
      return await res.json();
    } catch {
      // Fall through to mock data
    }
  }
  return [...mockJobs];
}

/**
 * Poll for updated training data (called every N seconds).
 * Browser: simulates progress ticks on running jobs.
 * Tauri: GET /api/training/poll (returns only changed fields for efficiency)
 */
export async function pollTrainingUpdates(
  currentJobs: TrainingJob[]
): Promise<TrainingJob[]> {
  if (shouldTryBackend()) {
    try {
      const res = await fetchBackend(`${getApiBase()}/training/poll`);
      if (!res.ok) throw new Error("Poll failed");
      return await res.json();
    } catch {
      return currentJobs;
    }
  }

  // --- Browser simulation: tick running jobs forward ---
  return currentJobs.map((j) => {
    if (j.status !== "running") return j;
    const newStep = Math.min(j.totalSteps, j.currentStep + Math.floor(Math.random() * 5) + 1);
    const newProgress = (newStep / j.totalSteps) * 100;
    const newEpoch = Math.floor((newStep / j.totalSteps) * j.totalEpochs) + 1;
    const newLoss = Math.max(0.02, j.loss + (Math.random() - 0.55) * 0.005);
    return {
      ...j,
      currentStep: newStep,
      progress: newProgress,
      epoch: Math.min(j.totalEpochs, newEpoch),
      loss: newLoss,
      lossHistory: [...j.lossHistory, { step: newStep, loss: newLoss }].slice(-100),
      gpuUsage: Math.max(70, Math.min(99, j.gpuUsage + (Math.random() - 0.5) * 5)),
      vramUsage: Math.max(20, Math.min(31, j.vramUsage + (Math.random() - 0.5) * 0.5)),
    };
  });
}

/**
 * Get GPU stats.
 * Browser: simulated RTX 5090 stats.
 * Tauri: GET /api/training/gpu (pynvml)
 */
export async function getGpuStats(): Promise<GpuStats> {
  if (shouldTryBackend()) {
    try {
      const res = await fetchBackend(`${getApiBase()}/training/gpu`);
      if (!res.ok) throw new Error("GPU stats failed");
      return await res.json();
    } catch {
      // Fall through
    }
  }

  return {
    name: "NVIDIA GeForce RTX 5090",
    gpuUtilization: 89,
    vramUsed: 24.6,
    vramTotal: 32,
    temperature: 72,
    powerDraw: 385,
    powerLimit: 575,
  };
}

/**
 * Check which training-related services are running.
 * Browser: simulated.
 * Tauri: GET /api/training/services (psutil port scan)
 */
export async function getServiceHealth(): Promise<ServiceHealth[]> {
  if (shouldTryBackend()) {
    try {
      const res = await fetchHealth(`${getApiBase()}/training/services`);
      if (!res.ok) throw new Error("Service health failed");
      return await res.json();
    } catch {
      // Fall through
    }
  }

  return [
    { id: "kohya", name: TOOL_REGISTRY.kohya.name, running: true, port: TOOL_REGISTRY.kohya.port, url: TOOL_REGISTRY.kohya.url },
    { id: "musubi", name: TOOL_REGISTRY.musubi.name, running: false },
  ];
}

/**
 * Get the full loss history for a specific job.
 * Used when you want to load the complete TensorBoard data for a job.
 * Browser: returns what's already in the job.
 * Tauri: GET /api/training/jobs/:id/loss (reads full TensorBoard event file)
 */
export async function getFullLossHistory(
  jobId: string,
  currentHistory: LossDataPoint[]
): Promise<LossDataPoint[]> {
  if (shouldTryBackend()) {
    try {
      const res = await fetchBackend(`${getApiBase()}/training/jobs/${jobId}/loss`);
      if (!res.ok) throw new Error("Loss history failed");
      return await res.json();
    } catch {
      return currentHistory;
    }
  }
  return currentHistory;
}

// ============================================================
// TENSORBOARD LAUNCHER
// ============================================================
//
// TensorBoard is a training companion utility — not a standalone service.
// This section provides:
//   1. checkTensorBoardStatus() — ping :6006 to see if it's already running
//   2. launchTensorBoard()      — start TensorBoard with --logdir from the selected job
//   3. getTensorBoardCommand()  — get the CLI command for manual launch
//
// FastAPI endpoints:
//   GET  /api/tensorboard/status       → checkTensorBoardStatus()
//   POST /api/tensorboard/launch       → launchTensorBoard({ logdir, port })
//   POST /api/tensorboard/stop         → stopTensorBoard()
// ============================================================

export type TensorBoardState = "checking" | "running" | "stopped" | "launching" | "error";

export interface TensorBoardStatus {
  state: TensorBoardState;
  port: number;
  logdir?: string;        // The --logdir it was launched with (Tauri only)
  pid?: number;           // OS process ID (Tauri only)
  url: string;
  lastChecked: string;
}

/**
 * Check if TensorBoard is already running on the expected port.
 * Browser: HTTP ping to localhost:6006/data/runs
 * Tauri: GET /api/tensorboard/status (returns process info + logdir)
 */
export async function checkTensorBoardStatus(port = 6006): Promise<TensorBoardStatus> {
  const url = `http://localhost:${port}`;
  const now = new Date().toLocaleTimeString();

  // Tauri path — richer info from backend
  if (shouldTryBackend()) {
    try {
      const res = await fetchBackend(`${getApiBase()}/tensorboard/status`);
      if (res.ok) {
        const data = await res.json();
        return {
          state: data.running ? "running" : "stopped",
          port,
          logdir: data.logdir,
          pid: data.pid,
          url,
          lastChecked: now,
        };
      }
    } catch {
      // Fall through to browser ping
    }
  }

  // Browser path — simple HTTP ping
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(`${url}/data/runs`, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (res.ok) {
      return { state: "running", port, url, lastChecked: now };
    }
  } catch {
    // Not reachable
  }

  return { state: "stopped", port, url, lastChecked: now };
}

/**
 * Launch TensorBoard pointing at a specific log directory.
 * Tauri: POST /api/tensorboard/launch { logdir, port }
 *        Backend runs: tensorboard --logdir <logdir> --port <port> --bind_all
 * Browser: Returns the command string for manual copy (can't launch processes).
 */
export async function launchTensorBoard(
  logdir: string,
  port = 6006
): Promise<{ success: boolean; message: string; command: string }> {
  const command = `tensorboard --logdir "${logdir}" --port ${port} --bind_all`;

  if (shouldTryBackend()) {
    try {
      const res = await fetchBackend(`${getApiBase()}/tensorboard/launch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ logdir, port }),
      });
      if (res.ok) {
        const data = await res.json();
        return {
          success: true,
          message: data.message || `TensorBoard launched on port ${port}`,
          command,
        };
      }
      const err = await res.text();
      return { success: false, message: `Backend error: ${err}`, command };
    } catch (e) {
      return { success: false, message: `Failed to reach backend: ${e}`, command };
    }
  }

  // Browser mode — can't launch, return the command
  return {
    success: false,
    message: "Launching TensorBoard requires the Tauri backend. Run this command manually:",
    command,
  };
}

/**
 * Stop a running TensorBoard instance.
 * Tauri: POST /api/tensorboard/stop
 * Browser: not possible.
 */
export async function stopTensorBoard(): Promise<{ success: boolean; message: string }> {
  if (shouldTryBackend()) {
    try {
      const res = await fetchBackend(`${getApiBase()}/tensorboard/stop`, { method: "POST" });
      if (res.ok) return { success: true, message: "TensorBoard stopped" };
    } catch {
      // Fall through
    }
  }
  return { success: false, message: "Stop requires the Tauri backend" };
}

/**
 * Build the CLI command for launching TensorBoard with a given logdir.
 * Useful for displaying in the UI as a copyable command.
 */
export function getTensorBoardCommand(logdir: string, port = 6006): string {
  return `tensorboard --logdir "${logdir}" --port ${port} --bind_all`;
}

// ============================================================
// STATIC DATA
// ============================================================

/** Type display config */
export const typeConfig: Record<
  string,
  { label: string; color: string }
> = {
  "kohya-lora": { label: "Kohya LoRA", color: "#6d5aff" },
  "kohya-dreambooth": { label: "DreamBooth", color: "#00d4aa" },
  "musubi-video": { label: "Musubi Video", color: "#ffd93d" },
  "kohya-sdxl": { label: "Kohya SDXL", color: "#4ecdc4" },
};

// ============================================================
// SSE UPGRADE (ready to use — uncomment when backend supports it)
// ============================================================
//
// Replace the polling setInterval in TrainingPage.tsx with this:
//
// import { connectToSSE } from "../services/trainingService";
//
// useEffect(() => {
//   if (!isLive) return; // Only use SSE when backend is connected
//   const cleanup = connectToSSE((updatedJobs) => setJobs(updatedJobs));
//   return cleanup;
// }, [isLive]);

/**
 * Connect to the SSE stream for real-time training updates.
 * Returns a cleanup function to close the connection.
 * Only works when backend is running (Tauri mode).
 */
export function connectToSSE(
  onUpdate: (jobs: TrainingJob[]) => void
): () => void {
  if (!shouldTryBackend()) return () => {};

  const eventSource = new EventSource(`${getApiBase()}/training/stream`);

  eventSource.addEventListener("update", (event) => {
    try {
      const jobs: TrainingJob[] = JSON.parse(event.data);
      onUpdate(jobs);
    } catch {
      // Ignore parse errors
    }
  });

  eventSource.onerror = () => {
    // EventSource auto-reconnects, but we can log it
    console.warn("[TrainingService] SSE connection lost, reconnecting...");
  };

  return () => eventSource.close();
}
