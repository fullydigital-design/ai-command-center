// ============================================================
// Shared types for the AI Command Center
// These types are the contract between frontend and backend.
// When FastAPI backend is connected, it should use the same shapes.
// ============================================================

/** API key entry as stored/returned by the backend */
export interface ApiKeyEntry {
  id: string;
  name: string;
  description: string;
  icon: string;
  placeholder: string;
  docsUrl: string;
  required: boolean;
  keyPrefix: string;
}

/** Result of testing an API key */
export interface ApiKeyTestResult {
  valid: boolean;
  rateLimit?: string;
  usage?: string;
  error?: string;
}

/** AI model info (matches OpenRouter /api/v1/models shape, simplified) */
export interface AiModel {
  id: string;          // OpenRouter model ID, e.g. "anthropic/claude-sonnet-4-20250514"
  name: string;        // Display name, e.g. "Claude Sonnet 4"
  provider: string;    // Provider label, e.g. "Anthropic"
  contextWindow: string;
  costPer1k: string;   // "input / output" cost string
  recommended?: boolean;
  userAdded?: boolean;
}

/** Provider option for the "Add Model" form */
export interface ModelProvider {
  id: string;
  label: string;
  modelsUrl: string;
  placeholder: string;
}

/** Local directory path config */
export interface PathConfig {
  id: string;
  label: string;
  path: string;
  description: string;
  exists: boolean;
}

/** Full settings bundle — what gets saved/loaded as a unit */
export interface AppSettings {
  apiKeys: Record<string, string>;   // { github: "ghp_xxx", openrouter: "sk-or-xxx", ... }
  selectedModel: string;             // OpenRouter model ID
  models: AiModel[];                 // User's model list
  paths: PathConfig[];               // Local directory paths
}

/** Backend connection info — used for health checks */
export interface BackendStatus {
  connected: boolean;
  mode: "browser" | "tauri";        // Where settings are persisted
  version?: string;
  pythonVersion?: string;
  fastapiPort?: number;
}

// ============================================================
// Training Monitor Types
// ============================================================

/** Training job status */
export type TrainingStatus = "running" | "completed" | "paused" | "failed";

/** Training job type */
export type TrainingType = "kohya-lora" | "kohya-dreambooth" | "musubi-video" | "kohya-sdxl";

/** Training tool */
export type TrainingTool = "kohya" | "musubi";

/** A single loss data point (from TensorBoard event files) */
export interface LossDataPoint {
  step: number;
  loss: number;
}

/**
 * Training job — the core data model.
 *
 * BACKEND SOURCE MAPPING (how FastAPI populates each field):
 * ─────────────────────────────────────────────────────────
 * id            → PID of the training process (psutil)
 * name          → Parsed from --output_name in CLI args or TOML config
 * type/tool     → Detected from process command line (accelerate → kohya, musubi-tuner → musubi)
 * status        → Process state via psutil (running/zombie/stopped)
 * progress      → currentStep / totalSteps
 * epoch/steps   → Parsed from latest TensorBoard event or process stdout
 * loss          → Latest scalar from TensorBoard: tag "loss" or "train/loss"
 * learningRate  → From TOML config file or TensorBoard scalar "lr"
 * batchSize     → From TOML config: train_batch_size
 * resolution    → From TOML config: resolution
 * dataset       → From TOML config: train_data_dir (basename)
 * datasetSize   → File count in train_data_dir
 * startTime     → Process create_time via psutil
 * eta           → Calculated from step rate × remaining steps
 * gpuUsage      → pynvml: nvmlDeviceGetUtilizationRates
 * vramUsage     → pynvml: nvmlDeviceGetMemoryInfo
 * model         → From TOML config: pretrained_model_name_or_path (basename)
 * outputPath    → From TOML config: output_dir
 * configPath    → Full path to the .toml config file
 * tensorboardLogDir → From TOML config: logging_dir
 * lossHistory   → All scalars from TensorBoard event file via tbparse
 */
export interface TrainingJob {
  id: string;
  name: string;
  type: TrainingType;
  tool: TrainingTool;
  status: TrainingStatus;
  progress: number;
  epoch: number;
  totalEpochs: number;
  currentStep: number;
  totalSteps: number;
  loss: number;
  learningRate: string;
  batchSize: number;
  resolution: string;
  dataset: string;
  datasetSize: number;
  startTime: string;
  eta: string;
  gpuUsage: number;
  vramUsage: number;
  model: string;
  outputPath: string;
  lossHistory: LossDataPoint[];
  // Backend-only fields (populated when connected to FastAPI)
  configPath?: string;            // Path to .toml config file
  tensorboardLogDir?: string;     // Path to TensorBoard log directory
  pid?: number;                   // OS process ID
}

/** GPU stats from nvidia-smi / pynvml */
export interface GpuStats {
  name: string;                   // e.g. "NVIDIA GeForce RTX 5090"
  gpuUtilization: number;         // 0-100
  vramUsed: number;               // GB
  vramTotal: number;              // GB
  temperature: number;            // °C
  powerDraw: number;              // W
  powerLimit: number;             // W
}

/** Service health status (is the process running / port open?) */
export interface ServiceHealth {
  id: string;
  name: string;
  running: boolean;
  port?: number;
  pid?: number;
  url?: string;
}

/** Data source indicator — tells the UI where data came from */
export type DataSource = "simulated" | "tensorboard" | "process" | "nvidia" | "config-file";