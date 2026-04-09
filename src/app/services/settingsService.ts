// ============================================================
// Settings Service — Abstraction layer for all settings I/O
// ============================================================
//
// RIGHT NOW:  Everything uses localStorage (browser prototype).
// MIGRATION:  When the Tauri + FastAPI backend is ready, swap
//             the implementation in this file to call your API
//             endpoints. The component code stays untouched.
//
// FastAPI endpoints this will map to:
//   GET    /api/settings              → loadSettings()
//   PUT    /api/settings              → saveSettings()
//   POST   /api/settings/test-key     → testApiKey()
//   GET    /api/models/lookup?id=...  → fetchModelInfo()
//   GET    /api/models/search?q=...   → searchModels()
//   GET    /api/paths/validate        → validatePaths()
//   GET    /api/health                → getBackendStatus()
// ============================================================

import type {
  AiModel,
  ApiKeyTestResult,
  AppSettings,
  BackendStatus,
  ModelProvider,
  PathConfig,
} from "./types";
import { shouldTryBackend, getApiBase } from "./env";
import { fetchHealth, fetchBackend, fetchExternalAPI } from "./fetchWithRetry";
import { TOOL_REGISTRY } from "./toolsRegistry";

// --- Storage keys ---
const STORAGE_KEY = "ai_command_center_settings";
const MODELS_STORAGE_KEY = "ai_command_center_models";

// --- Internal helpers (will be removed when backend is connected) ---

function readLocalStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeLocalStorage(key: string, value: unknown) {
  localStorage.setItem(key, JSON.stringify(value));
}

// ============================================================
// PUBLIC API — Components import these functions
// ============================================================

/**
 * Check if a real backend is available.
 * In browser mode, returns a stub. In Tauri mode, pings FastAPI.
 */
export async function getBackendStatus(): Promise<BackendStatus> {
  if (!shouldTryBackend()) {
    return { connected: false, mode: "browser" };
  }

  try {
    const res = await fetchHealth(`${getApiBase()}/health`);
    if (!res.ok) throw new Error("Backend unreachable");
    const data = await res.json();
    return {
      connected: true,
      mode: "tauri",
      version: data.version,
      pythonVersion: data.python_version,
      fastapiPort: data.port,
    };
  } catch {
    return { connected: false, mode: "browser" };
  }
}

/**
 * Load all settings. Browser: localStorage. Tauri: GET /api/settings.
 */
export async function loadAllSettings(defaultPaths: PathConfig[]): Promise<AppSettings> {
  if (shouldTryBackend()) {
    try {
      const res = await fetchBackend(`${getApiBase()}/settings`);
      return await res.json();
    } catch {
      // Fall through to localStorage if backend is down
    }
  }

  // --- Browser/localStorage mode ---
  const raw = readLocalStorage<Record<string, string>>(STORAGE_KEY, {});
  const models = readLocalStorage<AiModel[]>(MODELS_STORAGE_KEY, []);

  const apiKeys: Record<string, string> = {};
  for (const key of Object.keys(raw)) {
    if (key.startsWith("api_key_")) {
      apiKeys[key.replace("api_key_", "")] = raw[key];
    }
  }

  const paths = defaultPaths.map((p) => ({
    ...p,
    path: raw[`path_${p.id}`] || p.path,
  }));

  return {
    apiKeys,
    selectedModel: raw.selected_model || "",
    models,
    paths,
  };
}

/**
 * Save all settings. Browser: localStorage. Tauri: PUT /api/settings.
 */
export async function saveAllSettings(settings: AppSettings): Promise<void> {
  if (shouldTryBackend()) {
    try {
      await fetchBackend(`${getApiBase()}/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      return;
    } catch {
      // Fall through to localStorage
    }
  }

  // --- Browser mode ---
  const flat: Record<string, string> = {};
  for (const [id, key] of Object.entries(settings.apiKeys)) {
    flat[`api_key_${id}`] = key;
  }
  flat.selected_model = settings.selectedModel;
  for (const p of settings.paths) {
    flat[`path_${p.id}`] = p.path;
  }
  writeLocalStorage(STORAGE_KEY, flat);
  writeLocalStorage(MODELS_STORAGE_KEY, settings.models);
}

/**
 * Save just the models list (called on every add/remove for persistence).
 */
export async function saveModels(models: AiModel[]): Promise<void> {
  if (shouldTryBackend()) {
    try {
      await fetchBackend(`${getApiBase()}/settings/models`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(models),
      });
      return;
    } catch {
      // Fall through
    }
  }
  writeLocalStorage(MODELS_STORAGE_KEY, models);
}

/**
 * Test an API key. Browser: simulated validation. Tauri: POST /api/settings/test-key.
 */
export async function testApiKey(
  keyId: string,
  keyValue: string,
  keyPrefix: string
): Promise<ApiKeyTestResult> {
  if (shouldTryBackend()) {
    try {
      const res = await fetchBackend(`${getApiBase()}/settings/test-key`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key_id: keyId, key_value: keyValue }),
      });
      return await res.json();
    } catch {
      return { valid: false, error: "Backend unreachable" };
    }
  }

  // --- Browser simulation ---
  await new Promise((r) => setTimeout(r, 1500));

  const isValid = keyValue.length > 10 && (keyPrefix === "" || keyValue.startsWith(keyPrefix));

  if (!isValid) {
    return { valid: false, error: "Invalid key format or authentication failed" };
  }

  // Simulated rate limits / usage per provider
  const simulated: Record<string, Pick<ApiKeyTestResult, "rateLimit" | "usage">> = {
    github: { rateLimit: "5,000 req/hr", usage: "127 / 5,000 used" },
    openrouter: { rateLimit: "200 req/min", usage: "$2.34 credits remaining" },
    huggingface: { rateLimit: "Unlimited", usage: "Gated model access: enabled" },
    civitai: { rateLimit: "100 req/min", usage: "Active" },
  };

  return { valid: true, ...(simulated[keyId] || {}) };
}

/**
 * Fetch model info from OpenRouter.
 * Browser: simulated lookup from known models DB.
 * Tauri: GET /api/models/lookup?id=provider/slug
 *        (backend calls OpenRouter API with your key)
 */
export async function fetchModelInfo(
  providerId: string,
  modelSlug: string,
  _openRouterKey?: string  // Used by backend, ignored in browser mode
): Promise<AiModel | null> {
  const fullId = providerId === "custom" ? modelSlug : `${providerId}/${modelSlug}`;

  if (shouldTryBackend()) {
    try {
      const res = await fetchBackend(
        `${getApiBase()}/models/lookup?id=${encodeURIComponent(fullId)}`
      );
      if (!res.ok) return null;
      const data = await res.json();
      return { ...data, userAdded: true };
    } catch {
      // Fall through to simulation
    }
  }

  // --- Browser simulation ---
  await new Promise((r) => setTimeout(r, 800));

  // Known models database (simulates what OpenRouter API returns)
  const knownModels: Record<string, Omit<AiModel, "id" | "userAdded">> = {
    "openai/gpt-4o-2024-11-20": { name: "GPT-4o (Nov 2024)", provider: "OpenAI", contextWindow: "128K", costPer1k: "$0.0025 / $0.01" },
    "openai/gpt-4.1-2025-04-14": { name: "GPT-4.1", provider: "OpenAI", contextWindow: "1M", costPer1k: "$0.002 / $0.008" },
    "openai/gpt-4.1-mini-2025-04-14": { name: "GPT-4.1 Mini", provider: "OpenAI", contextWindow: "1M", costPer1k: "$0.0004 / $0.0016" },
    "openai/gpt-4.1-nano-2025-04-14": { name: "GPT-4.1 Nano", provider: "OpenAI", contextWindow: "1M", costPer1k: "$0.0001 / $0.0004" },
    "openai/o3-2025-04-16": { name: "o3", provider: "OpenAI", contextWindow: "200K", costPer1k: "$0.01 / $0.04" },
    "openai/o4-mini-2025-04-16": { name: "o4 Mini", provider: "OpenAI", contextWindow: "200K", costPer1k: "$0.0011 / $0.0044" },
    "openai/gpt-5-mini-2025-08-07": { name: "GPT-5 Mini", provider: "OpenAI", contextWindow: "1M", costPer1k: "$0.003 / $0.012" },
    "anthropic/claude-sonnet-4-20250514": { name: "Claude Sonnet 4", provider: "Anthropic", contextWindow: "200K", costPer1k: "$0.003 / $0.015" },
    "anthropic/claude-3.5-haiku-20241022": { name: "Claude 3.5 Haiku", provider: "Anthropic", contextWindow: "200K", costPer1k: "$0.001 / $0.005" },
    "anthropic/claude-opus-4-20250514": { name: "Claude Opus 4", provider: "Anthropic", contextWindow: "200K", costPer1k: "$0.015 / $0.075" },
    "google/gemini-2.5-flash-preview": { name: "Gemini 2.5 Flash", provider: "Google", contextWindow: "1M", costPer1k: "$0.00015 / $0.0035" },
    "google/gemini-2.5-pro-preview": { name: "Gemini 2.5 Pro", provider: "Google", contextWindow: "1M", costPer1k: "$0.00125 / $0.01" },
    "deepseek/deepseek-chat-v3-0324": { name: "DeepSeek V3 (Mar)", provider: "DeepSeek", contextWindow: "64K", costPer1k: "$0.00014 / $0.00028" },
    "deepseek/deepseek-r1": { name: "DeepSeek R1", provider: "DeepSeek", contextWindow: "64K", costPer1k: "$0.00055 / $0.0022" },
    "meta-llama/llama-4-maverick": { name: "Llama 4 Maverick", provider: "Meta", contextWindow: "1M", costPer1k: "$0.00025 / $0.001" },
    "meta-llama/llama-4-scout": { name: "Llama 4 Scout", provider: "Meta", contextWindow: "512K", costPer1k: "$0.00015 / $0.0006" },
    "mistralai/mistral-large-2411": { name: "Mistral Large", provider: "Mistral", contextWindow: "128K", costPer1k: "$0.002 / $0.006" },
    "mistralai/codestral-2501": { name: "Codestral", provider: "Mistral", contextWindow: "256K", costPer1k: "$0.0003 / $0.0009" },
    "qwen/qwen-2.5-72b-instruct": { name: "Qwen 2.5 72B", provider: "Qwen", contextWindow: "128K", costPer1k: "$0.0003 / $0.0004" },
    "qwen/qwen-2.5-coder-32b-instruct": { name: "Qwen 2.5 Coder 32B", provider: "Qwen", contextWindow: "128K", costPer1k: "$0.00015 / $0.0002" },
    "x-ai/grok-3-mini-beta": { name: "Grok 3 Mini", provider: "xAI", contextWindow: "128K", costPer1k: "$0.0003 / $0.0005" },
    "x-ai/grok-3-beta": { name: "Grok 3", provider: "xAI", contextWindow: "128K", costPer1k: "$0.003 / $0.015" },
    "cohere/command-r-plus-08-2024": { name: "Command R+", provider: "Cohere", contextWindow: "128K", costPer1k: "$0.0025 / $0.01" },
  };

  if (knownModels[fullId]) {
    return { id: fullId, ...knownModels[fullId], userAdded: true };
  }

  // Unknown model — still allow adding, but with placeholder metadata
  const providers = getModelProviders();
  const providerLabel = providers.find((p) => p.id === providerId)?.label || providerId;
  return {
    id: fullId,
    name: modelSlug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    provider: providerLabel,
    contextWindow: "\u2014",
    costPer1k: "Check OpenRouter",
    userAdded: true,
  };
}

/**
 * Validate that local paths exist on disk.
 * Browser: always returns true (can't check FS).
 * Tauri: POST /api/paths/validate with the paths array.
 */
export async function validatePaths(
  paths: PathConfig[]
): Promise<PathConfig[]> {
  if (shouldTryBackend()) {
    try {
      const res = await fetchBackend(`${getApiBase()}/paths/validate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(paths.map((p) => ({ id: p.id, path: p.path }))),
      });
      const results: Array<{ id: string; exists: boolean }> = await res.json();
      return paths.map((p) => ({
        ...p,
        exists: results.find((r) => r.id === p.id)?.exists ?? p.exists,
      }));
    } catch {
      return paths;
    }
  }

  // Browser mode — assume all paths exist (can't verify from browser)
  return paths;
}

// ============================================================
// STATIC DATA — Provider list and default paths
// ============================================================

/** Model providers for the "Add Model" dropdown */
export function getModelProviders(): ModelProvider[] {
  return [
    { id: "openai", label: "OpenAI", modelsUrl: "https://openrouter.ai/models?q=openai", placeholder: "e.g. gpt-4o-2024-11-20" },
    { id: "anthropic", label: "Anthropic", modelsUrl: "https://openrouter.ai/models?q=anthropic", placeholder: "e.g. claude-sonnet-4-20250514" },
    { id: "google", label: "Google", modelsUrl: "https://openrouter.ai/models?q=google", placeholder: "e.g. gemini-2.5-flash-preview" },
    { id: "deepseek", label: "DeepSeek", modelsUrl: "https://openrouter.ai/models?q=deepseek", placeholder: "e.g. deepseek-chat-v3-0324" },
    { id: "meta-llama", label: "Meta", modelsUrl: "https://openrouter.ai/models?q=meta-llama", placeholder: "e.g. llama-4-maverick" },
    { id: "mistralai", label: "Mistral", modelsUrl: "https://openrouter.ai/models?q=mistralai", placeholder: "e.g. mistral-large-2411" },
    { id: "qwen", label: "Qwen", modelsUrl: "https://openrouter.ai/models?q=qwen", placeholder: "e.g. qwen-2.5-72b-instruct" },
    { id: "x-ai", label: "xAI", modelsUrl: "https://openrouter.ai/models?q=x-ai", placeholder: "e.g. grok-3-mini-beta" },
    { id: "cohere", label: "Cohere", modelsUrl: "https://openrouter.ai/models?q=cohere", placeholder: "e.g. command-r-plus-08-2024" },
    { id: "custom", label: "Custom / Other", modelsUrl: "https://openrouter.ai/models", placeholder: "e.g. provider/model-name" },
  ];
}

/** API key configurations (what keys exist, not the values) */
export function getApiKeyConfigs() {
  return [
    {
      id: "github",
      name: "GitHub",
      description: "Repository monitoring, update detection, git operations. Increases rate limit from 60 to 5,000 requests/hour.",
      icon: "\uD83D\uDC19",
      placeholder: "ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
      docsUrl: "https://github.com/settings/tokens",
      required: true,
      keyPrefix: "ghp_",
    },
    {
      id: "openrouter",
      name: "OpenRouter",
      description: "AI assistant features \u2014 training advice, prompt engineering, troubleshooting, optimization suggestions. Access to Claude, GPT-4o, DeepSeek, Llama, and more.",
      icon: "\uD83E\uDDE0",
      placeholder: "sk-or-v1-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
      docsUrl: "https://openrouter.ai/keys",
      required: true,
      keyPrefix: "sk-or-",
    },
    {
      id: "huggingface",
      name: "HuggingFace",
      description: "Access gated models (FLUX, Wan2.1), check model versions, download from Hub. Free token for gated model access.",
      icon: "\uD83E\uDD17",
      placeholder: "hf_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
      docsUrl: "https://huggingface.co/settings/tokens",
      required: false,
      keyPrefix: "hf_",
    },
    {
      id: "civitai",
      name: "CivitAI",
      description: "Model discovery, LoRA/checkpoint downloads, community resources. Free API key from your CivitAI account.",
      icon: "\uD83C\uDFAD",
      placeholder: "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
      docsUrl: "https://civitai.com/user/account",
      required: false,
      keyPrefix: "",
    },
  ];
}

/** Default local directory paths */
export function getDefaultPaths(): PathConfig[] {
  return [
    { id: "ai_root", label: "AI Root Directory", path: "C:\\_AI\\_test_fresh_all_AI", description: "Base directory for all AI tools", exists: true },
    { id: "comfyui", label: "ComfyUI", path: "C:\\_AI\\_test_fresh_all_AI\\ComfyUI", description: "ComfyUI installation", exists: true },
    { id: "swarmui", label: "SwarmUI", path: "C:\\_AI\\_test_fresh_all_AI\\SwarmUI", description: "SwarmUI installation", exists: true },
    { id: "kohya", label: "Kohya SS", path: "C:\\_AI\\_test_fresh_all_AI\\kohya_ss", description: "Kohya SS training GUI", exists: true },
    { id: "musubi", label: "Musubi Tuner", path: "C:\\_AI\\_test_fresh_all_AI\\musubi-tuner", description: "Musubi video tuner", exists: true },
    { id: "models", label: "Models Directory", path: "C:\\_AI\\_test_fresh_all_AI\\models", description: "Shared model storage", exists: true },
    { id: "training_data", label: "Training Data", path: "C:\\_AI\\_test_fresh_all_AI\\training_data", description: "Datasets & training outputs", exists: true },
  ];
}

/**
 * Generate the config.json that the FastAPI backend expects.
 * This is what gets written to disk when running locally.
 */
export function generateBackendConfig(
  paths: PathConfig[],
  selectedModel: string
): object {
  return {
    ai_root: paths.find((p) => p.id === "ai_root")?.path,
    services: {
      comfyui: { path: paths.find((p) => p.id === "comfyui")?.path, port: TOOL_REGISTRY.comfyui.port },
      swarmui: { path: paths.find((p) => p.id === "swarmui")?.path, port: TOOL_REGISTRY.swarmui.port },
      kohya: { path: paths.find((p) => p.id === "kohya")?.path, port: TOOL_REGISTRY.kohya.port },
      musubi: { path: paths.find((p) => p.id === "musubi")?.path, port: TOOL_REGISTRY.musubi.port },
    },
    models_dir: paths.find((p) => p.id === "models")?.path,
    training_data_dir: paths.find((p) => p.id === "training_data")?.path,
    selected_ai_model: selectedModel,
  };
}

// ============================================================
// EXPORT / IMPORT / RESET
// ============================================================

export interface ExportedSettings {
  _format: "ai-command-center-settings";
  _version: 1;
  _exportedAt: string;
  apiKeys: Record<string, string>;
  selectedModel: string;
  models: AiModel[];
  paths: PathConfig[];
  packages?: unknown;  // include installed packages if present
}

/**
 * Export all settings to a downloadable JSON file.
 * Redacts API key values to last 4 chars for safety (opt-in full export).
 */
export async function exportSettings(
  opts: { includeFullKeys?: boolean; includePaths?: boolean } = {}
): Promise<ExportedSettings> {
  const settings = await loadAllSettings(getDefaultPaths());
  const packages = readLocalStorage("ai_cmd_packages", null);

  const apiKeys: Record<string, string> = {};
  for (const [id, key] of Object.entries(settings.apiKeys)) {
    if (!key) continue;
    if (opts.includeFullKeys) {
      apiKeys[id] = key;
    } else {
      // Redact: keep prefix + last 4 chars
      apiKeys[id] = key.length > 8
        ? key.slice(0, 6) + "…" + key.slice(-4)
        : "••••" + key.slice(-4);
    }
  }

  return {
    _format: "ai-command-center-settings",
    _version: 1,
    _exportedAt: new Date().toISOString(),
    apiKeys,
    selectedModel: settings.selectedModel,
    models: settings.models,
    paths: opts.includePaths !== false ? settings.paths : [],
    packages: packages || undefined,
  };
}

/**
 * Download exported settings as a JSON file.
 */
export function downloadSettingsFile(data: ExportedSettings): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `ai-command-center-settings-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Validate and import settings from a JSON object.
 * Returns what was imported for confirmation toast.
 */
export async function importSettings(
  data: unknown
): Promise<{ imported: string[]; skipped: string[] }> {
  if (!data || typeof data !== "object") {
    throw new Error("Invalid settings file format.");
  }

  const obj = data as Record<string, unknown>;
  if (obj._format !== "ai-command-center-settings") {
    throw new Error("Not a valid AI Command Center settings file.");
  }

  const imported: string[] = [];
  const skipped: string[] = [];

  // Load current settings as base
  const current = await loadAllSettings(getDefaultPaths());

  // Merge API keys (only non-redacted ones)
  if (obj.apiKeys && typeof obj.apiKeys === "object") {
    const incoming = obj.apiKeys as Record<string, string>;
    for (const [id, val] of Object.entries(incoming)) {
      if (!val || val.includes("…") || val.includes("••••")) {
        skipped.push(`API key: ${id} (redacted)`);
        continue;
      }
      current.apiKeys[id] = val;
      imported.push(`API key: ${id}`);
    }
  }

  // Merge selected model
  if (typeof obj.selectedModel === "string" && obj.selectedModel) {
    current.selectedModel = obj.selectedModel;
    imported.push("Selected AI model");
  }

  // Merge models
  if (Array.isArray(obj.models) && obj.models.length > 0) {
    const existingIds = new Set(current.models.map((m) => m.id));
    let added = 0;
    for (const m of obj.models) {
      if (m && typeof m === "object" && (m as AiModel).id && !existingIds.has((m as AiModel).id)) {
        current.models.push(m as AiModel);
        added++;
      }
    }
    if (added > 0) imported.push(`${added} AI model(s)`);
  }

  // Merge paths
  if (Array.isArray(obj.paths) && obj.paths.length > 0) {
    const pathMap = new Map(current.paths.map((p) => [p.id, p]));
    for (const p of obj.paths) {
      if (p && typeof p === "object" && (p as PathConfig).id && (p as PathConfig).path) {
        const existing = pathMap.get((p as PathConfig).id);
        if (existing) {
          existing.path = (p as PathConfig).path;
        }
      }
    }
    current.paths = Array.from(pathMap.values());
    imported.push("Local paths");
  }

  // Merge packages
  if (obj.packages) {
    writeLocalStorage("ai_cmd_packages", obj.packages);
    imported.push("Script packages");
  }

  // Save merged settings
  await saveAllSettings(current);

  return { imported, skipped };
}

/**
 * Read a JSON file from a File object (for import).
 */
export function readSettingsFile(file: File): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        resolve(JSON.parse(reader.result as string));
      } catch {
        reject(new Error("Could not parse JSON file."));
      }
    };
    reader.onerror = () => reject(new Error("Failed to read file."));
    reader.readAsText(file);
  });
}

/**
 * Reset all app state to defaults.
 * @param level "soft" = clear settings only, "hard" = clear everything
 */
export function resetAllState(level: "soft" | "hard" = "soft"): void {
  const keysToRemove = [
    STORAGE_KEY,
    MODELS_STORAGE_KEY,
  ];

  if (level === "hard") {
    // Clear ALL ai_command_center related localStorage keys
    const allKeys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k) allKeys.push(k);
    }
    for (const k of allKeys) {
      if (
        k.startsWith("ai_command_center") ||
        k.startsWith("ai_cmd") ||
        k.startsWith("launcher_") ||
        k.startsWith("pkg_")
      ) {
        localStorage.removeItem(k);
      }
    }
  } else {
    for (const key of keysToRemove) {
      localStorage.removeItem(key);
    }
  }
}
