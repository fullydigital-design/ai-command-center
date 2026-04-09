// ============================================================
// AI Service — OpenRouter API integration with streaming
// ============================================================
//
// 3-tier abstraction:
//   1. Tauri mode → POST /api/ai/chat (FastAPI proxies to OpenRouter)
//   2. Browser mode → Direct fetch to OpenRouter API
//   3. No key → Returns helpful error message
//
// Uses OpenRouter key + selected model from Settings (apiKeys.ts)
//
// FastAPI endpoints (for backend implementation):
//   POST /api/ai/chat           → streamChat()
//   POST /api/ai/analyze-config → analyzeTrainingConfig()
//   POST /api/ai/analyze-script → analyzeScript()
//   POST /api/ai/generate-script → generateScript()
// ============================================================

import { getApiKey } from "./apiKeys";
import { fetchExternalAPI, fetchBackend, fetchStream } from "./fetchWithRetry";

// --- Types ---

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
}

export interface AISuggestion {
  id: string;
  category: "critical" | "performance" | "quality" | "optional" | "rtx5090";
  title: string;
  description: string;
  currentValue?: string;
  suggestedValue?: string;
  field?: string; // The config key this applies to, e.g. "learning_rate"
  applied: boolean;
  dismissed: boolean;
}

export interface AIStreamCallbacks {
  onToken: (token: string) => void;
  onComplete: (fullText: string) => void;
  onError: (error: string) => void;
}

export interface GeneratedFile {
  filename: string;
  content: string;
  tool: string;
  type: "launcher" | "installer" | "updater" | "custom";
  platform: "windows" | "linux";
  generatedAt: string;
  aiModified: boolean;
}

// --- Constants ---

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";
const TAURI_API_BASE = "http://127.0.0.1:8000/api";

const HARDWARE_CONTEXT = `
Hardware Profile:
- GPU: NVIDIA GeForce RTX 5090 (32GB GDDR7 VRAM, Blackwell architecture, CUDA 12.8)
- CPU: AMD Ryzen 9 9950X (16 cores / 32 threads, 5.7GHz boost)
- RAM: 86GB DDR5
- OS: Windows 10/11
- AI Root: C:\\_AI\\_test_fresh_all_AI\\
- Installed tools: ComfyUI (:8188), SwarmUI (:7801), Kohya SS (:7860), Musubi Tuner, Ollama (:11434)
`.trim();

// --- Environment detection (single source of truth: env.ts) ---
import { shouldTryBackend } from "./env";

function getSelectedModel(): string {
  try {
    const raw = localStorage.getItem("ai_command_center_settings");
    if (!raw) return "anthropic/claude-sonnet-4-20250514";
    const parsed = JSON.parse(raw);
    return parsed.selected_model || "anthropic/claude-sonnet-4-20250514";
  } catch {
    return "anthropic/claude-sonnet-4-20250514";
  }
}

// ============================================================
// UNIFIED AI ERROR HANDLING
// ============================================================

export type AIErrorKind =
  | "auth"           // Missing or invalid API key
  | "rate-limit"     // 429 Too Many Requests
  | "model-not-found"// Invalid model ID
  | "context-length" // Prompt too long for model
  | "content-filter" // Content moderation triggered
  | "network"        // Connection failed / timeout
  | "aborted"        // User cancelled
  | "server"         // 500+ upstream errors
  | "unknown";       // Catch-all

export class AIError extends Error {
  kind: AIErrorKind;
  statusCode?: number;
  retryable: boolean;
  userMessage: string;

  constructor(kind: AIErrorKind, message: string, opts?: { statusCode?: number; retryable?: boolean }) {
    super(message);
    this.name = "AIError";
    this.kind = kind;
    this.statusCode = opts?.statusCode;
    this.retryable = opts?.retryable ?? false;
    this.userMessage = AIError.friendlyMessage(kind, message);
  }

  static friendlyMessage(kind: AIErrorKind, raw: string): string {
    switch (kind) {
      case "auth":
        return "Invalid or missing OpenRouter API key. Check Settings → API Keys.";
      case "rate-limit":
        return "Rate limited by OpenRouter. Wait a moment and try again.";
      case "model-not-found":
        return `Model not available on OpenRouter. ${raw} Check Settings → AI Model.`;
      case "context-length":
        return "Prompt is too long for this model. Try shortening your message or using a model with a larger context window.";
      case "content-filter":
        return "Content was flagged by the model's safety filter. Try rephrasing your request.";
      case "network":
        return "Could not connect to OpenRouter. Check your internet connection.";
      case "aborted":
        return "Request cancelled.";
      case "server":
        return "OpenRouter or upstream provider is having issues. Try again shortly.";
      default:
        return raw || "An unexpected error occurred.";
    }
  }
}

/**
 * Classify an OpenRouter HTTP error response into a typed AIError.
 */
export function classifyAIError(
  status: number,
  body?: { error?: { message?: string; code?: string | number; type?: string } }
): AIError {
  const msg = body?.error?.message || `HTTP ${status}`;
  const code = String(body?.error?.code || "");
  const type = body?.error?.type || "";

  if (status === 401 || status === 403 || code === "invalid_api_key") {
    return new AIError("auth", msg, { statusCode: status });
  }
  if (status === 429 || code === "rate_limit_exceeded") {
    return new AIError("rate-limit", msg, { statusCode: status, retryable: true });
  }
  if (status === 404 || code === "model_not_found" || msg.toLowerCase().includes("no endpoints found")) {
    return new AIError("model-not-found", msg, { statusCode: status });
  }
  if (status === 400 && (msg.toLowerCase().includes("context length") || msg.toLowerCase().includes("too long") || code === "context_length_exceeded")) {
    return new AIError("context-length", msg, { statusCode: status });
  }
  if (status === 400 && (type === "content_filter" || msg.toLowerCase().includes("content filter") || msg.toLowerCase().includes("moderation"))) {
    return new AIError("content-filter", msg, { statusCode: status });
  }
  if (status >= 500) {
    return new AIError("server", msg, { statusCode: status, retryable: true });
  }
  return new AIError("unknown", msg, { statusCode: status });
}

/**
 * Classify a caught JS error (network failures, aborts, etc.)
 */
export function classifyCaughtError(e: unknown): AIError {
  if (e instanceof AIError) return e;
  if (e instanceof DOMException && e.name === "AbortError") {
    return new AIError("aborted", "Request aborted");
  }
  if (e instanceof TypeError && (e.message.includes("fetch") || e.message.includes("network") || e.message.includes("Failed to fetch"))) {
    return new AIError("network", e.message, { retryable: true });
  }
  const msg = e instanceof Error ? e.message : String(e);
  return new AIError("unknown", msg);
}

// ============================================================
// MODEL VALIDATION (OpenRouter /api/v1/models)
// ============================================================

interface OpenRouterModel {
  id: string;
  name: string;
  context_length: number;
  pricing?: { prompt: string; completion: string };
}

let modelListCache: { models: OpenRouterModel[]; ts: number } | null = null;
const MODEL_CACHE_TTL = 60 * 60 * 1000; // 1 hour

/**
 * Fetch all available models from OpenRouter. Cached for 1 hour.
 * This is a public endpoint — no API key required.
 */
export async function fetchAvailableModels(): Promise<OpenRouterModel[]> {
  if (modelListCache && Date.now() - modelListCache.ts < MODEL_CACHE_TTL) {
    return modelListCache.models;
  }
  try {
    const res = await fetchExternalAPI("https://openrouter.ai/api/v1/models");
    if (!res.ok) return modelListCache?.models || [];
    const data = await res.json();
    const models: OpenRouterModel[] = (data.data || []).map((m: any) => ({
      id: m.id,
      name: m.name || m.id,
      context_length: m.context_length || 0,
      pricing: m.pricing,
    }));
    modelListCache = { models, ts: Date.now() };
    return models;
  } catch {
    return modelListCache?.models || [];
  }
}

/**
 * Validate that the selected model exists on OpenRouter.
 * Returns the model info if valid, or throws AIError if not.
 */
export async function validateModel(modelId: string): Promise<OpenRouterModel | null> {
  const models = await fetchAvailableModels();
  if (models.length === 0) return null; // Can't validate — network issue, allow through
  const match = models.find((m) => m.id === modelId);
  if (!match) {
    throw new AIError(
      "model-not-found",
      `"${modelId}" is not available on OpenRouter.`,
      { statusCode: 404 }
    );
  }
  return match;
}

/**
 * Get a list of model IDs for autocomplete / dropdown.
 * Filtered to AI/CGI relevant models (optional filter string).
 */
export async function getModelSuggestions(filter?: string): Promise<{ id: string; name: string }[]> {
  const models = await fetchAvailableModels();
  let filtered = models;
  if (filter) {
    const q = filter.toLowerCase();
    filtered = models.filter(
      (m) => m.id.toLowerCase().includes(q) || m.name.toLowerCase().includes(q)
    );
  }
  return filtered.slice(0, 50).map((m) => ({ id: m.id, name: m.name }));
}

// --- Core streaming chat ---

export async function streamChat(
  messages: ChatMessage[],
  systemPrompt: string,
  callbacks: AIStreamCallbacks,
  signal?: AbortSignal
): Promise<void> {
  const apiKey = getApiKey("openrouter");

  if (!apiKey) {
    callbacks.onError(
      new AIError("auth", "No OpenRouter API key configured.").userMessage
    );
    return;
  }

  const model = getSelectedModel();

  // Validate model before sending (non-blocking — skip if network fails)
  try {
    await validateModel(model);
  } catch (e) {
    if (e instanceof AIError && e.kind === "model-not-found") {
      callbacks.onError(e.userMessage);
      return;
    }
  }

  const apiMessages = [
    { role: "system" as const, content: systemPrompt },
    ...messages.map((m) => ({ role: m.role, content: m.content })),
  ];

  if (shouldTryBackend()) {
    // Tier 1: Tauri backend proxies to OpenRouter
    try {
      const res = await fetchStream(`${TAURI_API_BASE}/ai/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: apiMessages, model, stream: true }),
        signal,
      });

      if (res.ok && res.body) {
        await processSSEStream(res.body, callbacks);
        return;
      }
      // Fall through to direct API if backend fails
    } catch {
      // Fall through
    }
  }

  // Tier 2: Direct OpenRouter API call from browser
  try {
    const res = await fetchStream(OPENROUTER_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": window.location.origin,
        "X-Title": "AI Command Center",
      },
      body: JSON.stringify({
        model,
        messages: apiMessages,
        stream: true,
        temperature: 0.7,
        max_tokens: 4096,
      }),
      signal,
    });

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({ error: { message: res.statusText } }));
      const aiErr = classifyAIError(res.status, errBody);
      callbacks.onError(aiErr.userMessage);
      return;
    }

    if (res.body) {
      await processSSEStream(res.body, callbacks);
    }
  } catch (e: unknown) {
    const aiErr = classifyCaughtError(e);
    if (aiErr.kind === "aborted") return;
    callbacks.onError(aiErr.userMessage);
  }
}

// --- Non-streaming chat (for analysis/suggestions) ---

export async function chatCompletion(
  messages: ChatMessage[],
  systemPrompt: string,
  signal?: AbortSignal
): Promise<string> {
  const apiKey = getApiKey("openrouter");

  if (!apiKey) {
    throw new AIError("auth", "No OpenRouter API key configured.");
  }

  const model = getSelectedModel();

  // Validate model before sending
  try {
    await validateModel(model);
  } catch (e) {
    if (e instanceof AIError) throw e;
  }

  const apiMessages = [
    { role: "system" as const, content: systemPrompt },
    ...messages.map((m) => ({ role: m.role, content: m.content })),
  ];

  if (shouldTryBackend()) {
    try {
      const res = await fetchBackend(`${TAURI_API_BASE}/ai/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: apiMessages, model, stream: false }),
        signal,
      });
      if (res.ok) {
        const data = await res.json();
        return data.choices?.[0]?.message?.content || "";
      }
    } catch {
      // Fall through
    }
  }

  try {
    const res = await fetchExternalAPI(OPENROUTER_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": window.location.origin,
        "X-Title": "AI Command Center",
      },
      body: JSON.stringify({
        model,
        messages: apiMessages,
        stream: false,
        temperature: 0.4,
        max_tokens: 4096,
      }),
      signal,
    });

    if (!res.ok) {
      const errBody = await res.json().catch(() => null);
      throw classifyAIError(res.status, errBody);
    }

    const data = await res.json();
    return data.choices?.[0]?.message?.content || "";
  } catch (e) {
    throw classifyCaughtError(e);
  }
}

// --- SSE Stream processor ---

async function processSSEStream(
  body: ReadableStream<Uint8Array>,
  callbacks: AIStreamCallbacks
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let fullText = "";
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6).trim();
        if (data === "[DONE]") continue;

        try {
          const parsed = JSON.parse(data);
          const token = parsed.choices?.[0]?.delta?.content;
          if (token) {
            fullText += token;
            callbacks.onToken(token);
          }
        } catch {
          // Skip malformed JSON
        }
      }
    }
    callbacks.onComplete(fullText);
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") return;
    callbacks.onError(e instanceof Error ? e.message : "Stream error");
  }
}

// --- System prompt builders ---

export function buildTrainingSystemPrompt(
  tool?: string,
  modelArch?: string,
  datasetInfo?: string
): string {
  return `You are an expert AI training configuration optimizer for a local AI/CGI pipeline.

${HARDWARE_CONTEXT}

${tool ? `Training Tool: ${tool}` : ""}
${modelArch ? `Base Model Architecture: ${modelArch}` : ""}
${datasetInfo ? `Dataset: ${datasetInfo}` : ""}

Your expertise includes:
- Kohya SS training (LoRA, DreamBooth, SDXL, SD3.5)
- Musubi Tuner (HunyuanVideo, Wan2.1 video LoRA)
- TOML config optimization for the specific hardware above
- VRAM budget calculations for RTX 5090 (32GB)
- Training parameter tuning (learning rate, batch size, resolution, network rank)
- bf16 vs fp16 considerations for Blackwell architecture
- gradient_checkpointing, cache_latents, and memory optimization

When analyzing configs:
1. Identify critical issues (VRAM overflow, incompatible settings)
2. Suggest performance optimizations specific to RTX 5090
3. Recommend quality improvements based on dataset size and model type
4. Provide RTX 5090-specific optimizations (bf16, CUDA 12.8 features)

When providing suggestions, use this JSON format in a code block:
\`\`\`json:suggestions
[
  {
    "category": "critical|performance|quality|optional|rtx5090",
    "title": "Short title",
    "description": "Why this change matters",
    "field": "config_key_name",
    "currentValue": "current value or null",
    "suggestedValue": "recommended value"
  }
]
\`\`\`

Always explain your reasoning. Be specific about VRAM estimates.`;
}

export function buildScriptSystemPrompt(scriptType?: string): string {
  return `You are an expert Windows batch script engineer for a local AI/CGI pipeline.

${HARDWARE_CONTEXT}

Your expertise includes:
- Windows .bat/.cmd scripting (advanced: delayed expansion, error levels, subroutines)
- Linux .sh scripting (bash, POSIX compatibility)
- Python virtual environment management (venv, pip, conda)
- CUDA/cuDNN/PyTorch installation and version management
- Git operations for AI tool installation and updates
- ComfyUI, SwarmUI, Kohya SS, Musubi Tuner, Ollama setup and configuration
- Custom node management for ComfyUI
- Error handling, logging, and user prompts in batch files
- RTX5090_FULL_SETUP.bat (~3000 lines, 16 menu options)

${scriptType ? `Current context: Working with ${scriptType}` : ""}

When analyzing scripts:
1. Identify bugs, missing error handling, deprecated commands
2. Suggest performance improvements (--depth 1 for git clone, --no-deps where safe)
3. Flag version-specific issues (CUDA compatibility, PyTorch versions)
4. Recommend best practices for maintainability

When generating scripts:
- Always include @echo off and setlocal for .bat files
- Add error handling (if errorlevel, || exit /b)
- Include descriptive echo statements for user feedback
- Use variables for paths so scripts are portable
- Add comments explaining non-obvious commands

When providing suggestions, use this JSON format in a code block:
\`\`\`json:suggestions
[
  {
    "category": "critical|performance|quality|optional",
    "title": "Short title",
    "description": "What to fix and why",
    "field": "line_number or section_name",
    "currentValue": "current code snippet",
    "suggestedValue": "fixed code snippet"
  }
]
\`\`\``;
}

export function buildGitHubInstallPrompt(repoUrl?: string): string {
  return `You are an expert at cloning, installing, and configuring GitHub repositories for a local AI/CGI pipeline on Windows.

${HARDWARE_CONTEXT}

Your expertise includes:
- Analyzing GitHub repos to determine setup requirements (Python, Node, Rust, .NET, etc.)
- Generating complete .bat install scripts with error handling, venv setup, dependency installation
- ComfyUI custom node installation (clone into custom_nodes/, install requirements, restart)
- Detecting common issues: missing CUDA, wrong Python version, conflicting dependencies
- Creating update scripts that preserve user configs
- Windows-specific path handling (spaces, Unicode, long paths)

${repoUrl ? `Repository URL: ${repoUrl}` : ""}

When generating install scripts:
1. Always use @echo off and setlocal
2. Check prerequisites (git, python, pip) before starting
3. Use --depth 1 for git clone to save space
4. Create/activate venv to avoid dependency conflicts
5. Add [OK], [INFO], [ERROR] prefixed echo statements
6. Include error handling with if errorlevel checks
7. Provide the complete .bat file content in a code block with filename hint

Format code output as:
\`\`\`bat:suggested_filename.bat
content here
\`\`\`

Always explain what the script does and any manual steps needed after running it.`;
}

export function buildSystemConfigPrompt(): string {
  return `You are an expert Windows system administrator specializing in AI/ML workstation optimization.

${HARDWARE_CONTEXT}

Your expertise includes:
- Windows environment variables (setx, system vs user, PATH management)
- CUDA, cuDNN, and GPU driver configuration for RTX 5090 / Blackwell
- Python environment management (multiple venvs, PATH conflicts, pip config)
- PyTorch optimization flags (PYTORCH_CUDA_ALLOC_CONF, torch.compile, bf16)
- HuggingFace ecosystem (HF_HOME, HF_HUB_ENABLE_HF_TRANSFER, cache management)
- Registry tweaks for GPU performance (NVIDIA profile inspector, TDR timeout)
- Scheduled tasks, service management, auto-start configuration
- Disk I/O optimization for model loading (NVMe config, readahead, page file)
- Network optimization for model downloads (aria2, HF transfer, proxy config)

When generating configuration scripts or commands:
1. Explain what each setting does and why it helps
2. Warn about any risks (registry changes, system-wide env vars)
3. Provide the complete script in a code block with filename hint
4. Include verification steps to confirm the change worked
5. Mention if a restart is required

Format code output as:
\`\`\`bat:suggested_filename.bat
content here
\`\`\`
or
\`\`\`powershell:suggested_filename.ps1
content here
\`\`\`

Always explain your reasoning and provide context for why each optimization matters for the RTX 5090.`;
}

export function buildAutoContextPrompt(): string {
  return `You are a versatile AI assistant for a local AI/CGI pipeline command center.

${HARDWARE_CONTEXT}

You can help with ANY of these domains:

1. **Training Configs** — Kohya SS, Musubi Tuner, TOML config optimization, VRAM budgeting, learning rate tuning
2. **Script Engineering** — Windows .bat/.cmd, PowerShell, Python scripts, error handling, automation
3. **GitHub Integration** — Clone repos, install custom nodes, manage dependencies, generate install scripts
4. **System Optimization** — ENV vars, CUDA settings, PATH management, GPU tuning, driver config

Automatically detect what the user is asking about and provide expert-level help.

When generating files (scripts, configs, etc.), always use code blocks with filename hints:
\`\`\`bat:filename.bat
content
\`\`\`
or
\`\`\`toml:filename.toml
content
\`\`\`

Be concise but thorough. Always consider the RTX 5090 32GB VRAM when relevant.`;
}

export function getHardwareContext(): string {
  return HARDWARE_CONTEXT;
}

// --- Utility: Generate unique message ID ---

export function generateMessageId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// --- Utility: Parse suggestions from AI response ---

export function parseSuggestionsFromResponse(text: string): AISuggestion[] {
  const match = text.match(/```json:suggestions\s*\n([\s\S]*?)```/);
  if (!match) return [];

  try {
    const raw = JSON.parse(match[1]);
    if (!Array.isArray(raw)) return [];

    return raw.map((s: Record<string, string>, i: number) => ({
      id: `sug_${Date.now()}_${i}`,
      category: s.category as AISuggestion["category"],
      title: s.title || "Suggestion",
      description: s.description || "",
      field: s.field,
      currentValue: s.currentValue,
      suggestedValue: s.suggestedValue,
      applied: false,
      dismissed: false,
    }));
  } catch {
    return [];
  }
}

// --- Utility: Strip suggestion blocks from display text ---

export function stripSuggestionBlocks(text: string): string {
  return text.replace(/```json:suggestions\s*\n[\s\S]*?```/g, "").trim();
}

// --- Utility: Download generated file ---

export function downloadFile(filename: string, content: string): void {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// --- Utility: Check if AI features are available ---

export function isAIAvailable(): boolean {
  return getApiKey("openrouter").length > 0;
}

export function getAIModelName(): string {
  const model = getSelectedModel();
  // Extract display-friendly name from model ID
  const parts = model.split("/");
  return parts.length > 1 ? parts[1] : model;
}
