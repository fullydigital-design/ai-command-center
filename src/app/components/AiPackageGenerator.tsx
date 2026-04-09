// ============================================================
// AI Package Generator — Chat-like interface for creating
// new script packages via AI assistance
// ============================================================
//
// 3-tier AI integration:
//   1. API key configured → Real streaming via OpenRouter (any provider)
//   2. No API key → Smart mock generation with realistic manifests
//
// Features:
//   - Chat conversation with follow-up refinements
//   - Live manifest preview (split pane)
//   - Copy / Download manifest.json
//   - "Import Generated" → installs directly into Package Manager
//
// ============================================================

import { useState, useRef, useEffect, useCallback } from "react";
import {
  X,
  Send,
  Sparkles,
  Bot,
  User,
  Copy,
  Check,
  Download,
  Loader2,
  ChevronDown,
  FileCode,
  Package,
  Rocket,
  Puzzle,
  HardDrive,
  Settings2,
  Wand2,
  RotateCcw,
  PackagePlus,
  AlertCircle,
} from "lucide-react";
import { Button } from "./ui/button";
import {
  isAIAvailable,
  generateMessageId,
  downloadFile,
  streamChat,
  getAIModelName,
  getHardwareContext,
} from "../services/aiService";
import type { ChatMessage as AIChatMessage, AIStreamCallbacks } from "../services/aiService";
import { importManifest } from "../services/packageService";
import type { PackageManifest } from "../services/packageTypes";
import { toast } from "sonner";
import { useEscapeKey } from "../hooks/useEscapeKey";

// ── Types ────────────────────────────────────────────────────

interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
  manifest?: string; // JSON manifest if generated
}

interface AiPackageGeneratorProps {
  onClose: () => void;
  /** Called after a manifest is successfully imported into the package list */
  onImported?: () => void;
}

// ── System prompt for manifest generation ────────────────────

function buildPackageGenSystemPrompt(): string {
  return `You are an expert AI package generator for a local AI/CGI Pipeline Command Center.

${getHardwareContext()}

Your job is to generate **complete, valid manifest.json** files for Script Packages.
A Script Package is a self-contained zip with scripts, configs, and a manifest.json that the app uses to display actions, configs, and metadata.

## Package Manifest Schema

The manifest MUST follow this exact TypeScript interface:

\`\`\`typescript
interface PackageManifest {
  id: string;                    // kebab-case, e.g. "my-custom-package"
  name: string;                  // Human-readable name
  version: string;               // Semantic version, e.g. "1.0.0"
  minAppVersion: string;         // e.g. "0.5.0"
  author: string;                // Author name
  created: string;               // ISO date string
  updated: string;               // ISO date string
  description: string;           // Short description
  category: "setup" | "training" | "nodes" | "models" | "utility" | "custom";
  tags: string[];                // Search/filter tags
  color?: string;                // Hex color for UI theming
  icon?: string;                 // Lucide icon name (Rocket, Package, Puzzle, etc.)
  requires: {
    python?: string;             // e.g. ">=3.10,<=3.12"
    gpu?: "nvidia" | "amd" | "any";
    os?: "windows" | "linux" | "macos" | "any";
    minVramMb?: number;
    minRamGb?: number;
    dependsOn?: string[];        // Other package IDs
  };
  actions: Array<{
    id: string;                  // e.g. "install", "update", "launch_comfyui"
    label: string;
    icon?: string;               // Lucide icon name
    description: string;
    group?: string;              // UI grouping
    admin?: boolean;
    confirmRequired?: boolean;
    confirmMessage?: string;
    danger?: "none" | "low" | "medium" | "critical";
    steps: Array<{
      run: string;               // e.g. "scripts/install.bat"
      type: "bat" | "python" | "powershell" | "shell";
      args?: string[];
      env?: Record<string, string>;
      admin?: boolean;
      workdir?: string;
    }>;
    estimatedDurationSec?: number;
  }>;
  configs?: Array<{
    id: string;
    label: string;
    description: string;
    file: string;                // e.g. "configs/training.toml"
    target: string;              // e.g. "{KOHYA_DIR}/configs/"
    format: "toml" | "yaml" | "json" | "ini" | "env" | "text";
    editable?: boolean;
    variables?: Array<{
      name: string;
      label: string;
      defaultValue: string;
      inputType?: "text" | "number" | "path" | "select";
      description?: string;
    }>;
  }>;
  files: Array<{
    path: string;                // e.g. "scripts/install.bat"
    type: "script" | "config" | "readme" | "data" | "template" | "other";
  }>;
  readme?: string;               // e.g. "README.md"
  changelog?: Array<{
    version: string;
    date: string;
    changes: string[];
  }>;
}
\`\`\`

## Rules

1. ALWAYS output the complete manifest as a JSON code block with the marker \`\`\`json:manifest.json
2. Make the manifest realistic and production-ready
3. Include appropriate actions (install, update, launch, cleanup, etc.)
4. Use RTX 5090 optimizations where relevant (FP8, --fast, --cuda-malloc, etc.)
5. Set realistic estimatedDurationSec for each action
6. Include proper file listings for all referenced scripts/configs
7. Use appropriate Lucide icon names (Rocket, Package, Puzzle, HardDrive, Download, RefreshCw, Play, Trash2, Settings2, Code, FlaskConical, Stethoscope, Film, Image, Cpu, Palette, Bug, Shield, Upload, FolderOpen, Sparkles, Route, RotateCcw, FileOutput, FolderSearch, Wand2)
8. Add a changelog entry for v1.0.0
9. Explain what the package does BEFORE the manifest block
10. If the user asks to refine, output the FULL updated manifest (not a diff)

Respond conversationally. Explain your choices. Then provide the manifest.`;
}

// ── Extract manifest JSON from AI response ───────────────────

function extractManifestFromResponse(text: string): string | null {
  // Try ```json:manifest.json block first
  const markerMatch = text.match(/```json:manifest\.json\s*\n([\s\S]*?)```/);
  if (markerMatch) {
    try {
      JSON.parse(markerMatch[1].trim());
      return markerMatch[1].trim();
    } catch { /* invalid JSON, try next */ }
  }

  // Try any ```json block
  const jsonMatch = text.match(/```json\s*\n([\s\S]*?)```/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[1].trim());
      // Validate it looks like a manifest
      if (parsed.id && parsed.name && parsed.actions) {
        return jsonMatch[1].trim();
      }
    } catch { /* invalid JSON */ }
  }

  // Try finding raw JSON object with manifest-like structure
  const rawMatch = text.match(/\{[\s\S]*"id"\s*:\s*"[\s\S]*"actions"\s*:\s*\[[\s\S]*\}/);
  if (rawMatch) {
    try {
      JSON.parse(rawMatch[0]);
      return rawMatch[0];
    } catch { /* nope */ }
  }

  return null;
}

/** Strip the manifest JSON block from display text for cleaner chat */
function stripManifestBlock(text: string): string {
  return text
    .replace(/```json:manifest\.json\s*\n[\s\S]*?```/g, "\n*[Manifest generated — see preview panel →]*\n")
    .replace(/```json\s*\n\{[\s\S]*?"actions"[\s\S]*?```/g, "\n*[Manifest generated — see preview panel →]*\n")
    .trim();
}

// ── Starter templates ────────────────────────────────────────

const TEMPLATES = [
  {
    label: "Tool Setup Package",
    icon: Rocket,
    prompt:
      "Create a script package that installs and configures a new AI tool. It uses Python with a venv on Windows, needs CUDA + RTX 5090. Include install, update, launch, and cleanup actions with proper error handling.",
  },
  {
    label: "Training Config Pack",
    icon: Settings2,
    prompt:
      "Create a training configuration package for fine-tuning LoRA models with Kohya SS on my RTX 5090. Include editable TOML configs for SDXL and FLUX with variables for data dir, output name, learning rate, and batch size.",
  },
  {
    label: "ComfyUI Node Pack",
    icon: Puzzle,
    prompt:
      "Create a script package that installs a curated set of ComfyUI custom nodes for image generation workflows. Include install, update, and remove actions. Include at least 10 popular nodes.",
  },
  {
    label: "Model Downloader",
    icon: HardDrive,
    prompt:
      "Create a package that downloads AI models (checkpoints, LoRAs, VAEs) to C:/_AI/models/ with proper subdirectory structure. Include separate download actions for SDXL, FLUX, and Wan2.1 model sets. Use aria2c or HuggingFace CLI.",
  },
  {
    label: "Diagnostic / Audit",
    icon: Wand2,
    prompt:
      "Create a utility package that audits the AI workspace — checks GPU drivers, CUDA version, Python venvs, disk space, model integrity, and generates a comprehensive health report. Include a PATH cleanup action.",
  },
];

// ── Mock AI manifest generation (fallback when no API key) ───

function generateMockManifest(userPrompt: string): string {
  const lower = userPrompt.toLowerCase();
  const isTraining = lower.includes("train") || lower.includes("lora") || lower.includes("finetune");
  const isNodes = lower.includes("node") || lower.includes("comfyui") || lower.includes("custom node");
  const isModel = lower.includes("model") || lower.includes("download") || lower.includes("checkpoint");
  const isUtility = lower.includes("audit") || lower.includes("diagnostic") || lower.includes("cleanup");

  const category = isTraining ? "training" : isNodes ? "nodes" : isModel ? "models" : isUtility ? "utility" : "setup";
  const nameHint = userPrompt.split(/[.!?,]/)[0].slice(0, 50).trim();
  const id = nameHint.toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, "-").slice(0, 30) || "my-custom-package";

  const manifest = {
    id,
    name: nameHint || "Custom Package",
    version: "1.0.0",
    minAppVersion: "0.5.0",
    author: "AI Generated",
    created: new Date().toISOString().split("T")[0],
    updated: new Date().toISOString().split("T")[0],
    description: `AI-generated package: ${nameHint}`,
    category,
    tags: [category, "ai-generated", "rtx5090"],
    color: category === "training" ? "#ff6b6b" : category === "nodes" ? "#6d5aff" : category === "models" ? "#00d4aa" : category === "utility" ? "#ff9f43" : "#6d5aff",
    icon: category === "training" ? "FlaskConical" : category === "nodes" ? "Puzzle" : category === "models" ? "HardDrive" : category === "utility" ? "Stethoscope" : "Rocket",
    requires: { gpu: "nvidia", os: "windows", minVramMb: 8192, python: ">=3.10" },
    actions: [
      { id: "install", label: "Install", icon: "Download", description: `Install and set up ${nameHint || "the package"}`, group: "Setup", steps: [{ run: "scripts/install.bat", type: "bat", workdir: "." }], estimatedDurationSec: 120 },
      { id: "update", label: "Update", icon: "RefreshCw", description: "Pull latest version and update dependencies", group: "Maintenance", steps: [{ run: "scripts/update.bat", type: "bat", workdir: "." }], estimatedDurationSec: 60 },
      ...(category === "setup" ? [{ id: "launch_tool", label: "Launch", icon: "Play", description: "Start the tool with optimized RTX 5090 flags", group: "Run", steps: [{ run: "scripts/launch.bat", type: "bat", workdir: "." }], estimatedDurationSec: 10 }] : []),
      ...(category === "utility" ? [{ id: "diagnostics", label: "Run Diagnostics", icon: "Stethoscope", description: "Full system health check", group: "Run", steps: [{ run: "scripts/diagnostics.py", type: "python", workdir: "." }], estimatedDurationSec: 15 }] : []),
    ],
    configs: isTraining ? [{ id: "training-config", label: "Training Config", description: "Main training configuration file", file: "configs/training.toml", target: "configs/", format: "toml", editable: true, variables: [{ name: "LEARNING_RATE", label: "Learning Rate", defaultValue: "1e-4" }, { name: "EPOCHS", label: "Training Epochs", defaultValue: "10" }, { name: "BATCH_SIZE", label: "Batch Size", defaultValue: "1" }] }] : [],
    files: [
      { path: "manifest.json", type: "config" },
      { path: "scripts/install.bat", type: "script" },
      { path: "scripts/update.bat", type: "script" },
      ...(category === "setup" ? [{ path: "scripts/launch.bat", type: "script" }] : []),
      ...(category === "utility" ? [{ path: "scripts/diagnostics.py", type: "script" }] : []),
      ...(isTraining ? [{ path: "configs/training.toml", type: "config" }] : []),
      { path: "README.md", type: "readme" },
    ],
    readme: "README.md",
    changelog: [{ version: "1.0.0", date: new Date().toISOString().split("T")[0], changes: ["Initial AI-generated package", "Install, update actions", "RTX 5090 optimized"] }],
  };

  return JSON.stringify(manifest, null, 2);
}

function generateMockResponse(userPrompt: string): { text: string; manifest: string } {
  const manifest = generateMockManifest(userPrompt);
  const parsed = JSON.parse(manifest);

  const text = `I've generated a **${parsed.category}** package called **"${parsed.name}"** with the following structure:

**Actions (${parsed.actions.length}):**
${parsed.actions.map((a: any) => `- **${a.label}** — ${a.description}`).join("\n")}

**Files (${parsed.files.length}):**
${parsed.files.map((f: any) => `- \`${f.path}\` (${f.type})`).join("\n")}

${parsed.configs?.length > 0 ? `**Configs (${parsed.configs.length}):**\n${parsed.configs.map((c: any) => `- **${c.label}** — ${c.description}`).join("\n")}` : ""}

The manifest is ready in the preview panel. You can:
- **Download** it as a .json file
- **Import** it directly into your Package Manager
- **Refine** it by describing what you'd like to change

Would you like me to adjust anything? I can add more actions, change the config format, add environment variables, or modify the requirements.`;

  return { text, manifest };
}

// ── Component ────────────────────────────────────────────────

export function AiPackageGenerator({ onClose, onImported }: AiPackageGeneratorProps) {
  const aiAvailable = isAIAvailable();

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      content: `Welcome to the **AI Package Generator**! Describe the script package you need and I'll generate a complete \`manifest.json\` with actions, configs, and file structure.

${aiAvailable ? `Connected to **${getAIModelName()}** — I'll generate production-ready manifests tailored to your RTX 5090 setup.` : "Running in **demo mode** — responses are simulated. Add an OpenRouter API key in Settings for real AI generation with any model."}

Pick a template below or describe your package from scratch.`,
      timestamp: Date.now(),
    },
  ]);
  const [input, setInput] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [latestManifest, setLatestManifest] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showManifest, setShowManifest] = useState(false);
  const [importStatus, setImportStatus] = useState<"idle" | "importing" | "success" | "error">("idle");
  const [importError, setImportError] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, streamingText]);

  // Auto-focus
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // ── Build conversation history for AI context ──
  const buildAIMessages = useCallback(
    (newUserContent: string): AIChatMessage[] => {
      const history: AIChatMessage[] = messages
        .filter((m) => m.role !== "system" && m.id !== "welcome")
        .map((m) => ({
          id: m.id,
          role: m.role as "user" | "assistant",
          content: m.content,
          timestamp: m.timestamp,
        }));
      history.push({
        id: generateMessageId(),
        role: "user",
        content: newUserContent,
        timestamp: Date.now(),
      });
      return history;
    },
    [messages]
  );

  // ── Send message (real AI or mock) ──
  const handleSend = useCallback(
    async (text?: string) => {
      const prompt = (text ?? input).trim();
      if (!prompt || isGenerating) return;

      const userMsg: ChatMessage = {
        id: generateMessageId(),
        role: "user",
        content: prompt,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, userMsg]);
      setInput("");
      setIsGenerating(true);
      setStreamingText("");
      setImportStatus("idle");
      setImportError(null);

      if (aiAvailable) {
        // ── Real AI via streamChat ──
        const aiMessages = buildAIMessages(prompt);
        const systemPrompt = buildPackageGenSystemPrompt();
        const controller = new AbortController();
        abortRef.current = controller;

        let fullText = "";

        const callbacks: AIStreamCallbacks = {
          onToken: (token: string) => {
            fullText += token;
            setStreamingText(fullText);
          },
          onComplete: (completeText: string) => {
            const manifest = extractManifestFromResponse(completeText);
            const displayText = manifest ? stripManifestBlock(completeText) : completeText;

            const assistantMsg: ChatMessage = {
              id: generateMessageId(),
              role: "assistant",
              content: displayText,
              timestamp: Date.now(),
              manifest: manifest ?? undefined,
            };

            setMessages((prev) => [...prev, assistantMsg]);
            setStreamingText("");
            setIsGenerating(false);

            if (manifest) {
              setLatestManifest(manifest);
              setShowManifest(true);
            }
          },
          onError: (error: string) => {
            const errorMsg: ChatMessage = {
              id: generateMessageId(),
              role: "assistant",
              content: `**Error from AI provider:** ${error}\n\nFalling back to demo mode for this response.`,
              timestamp: Date.now(),
            };
            setMessages((prev) => [...prev, errorMsg]);
            setStreamingText("");
            setIsGenerating(false);
            toast.error("AI generation failed", { description: error });

            // Fallback to mock
            const { text: mockText, manifest } = generateMockResponse(prompt);
            const fallbackMsg: ChatMessage = {
              id: generateMessageId(),
              role: "assistant",
              content: mockText,
              timestamp: Date.now(),
              manifest,
            };
            setMessages((prev) => [...prev, fallbackMsg]);
            setLatestManifest(manifest);
            setShowManifest(true);
          },
        };

        try {
          await streamChat(aiMessages, systemPrompt, callbacks, controller.signal);
        } catch (e) {
          if (!(e instanceof DOMException && e.name === "AbortError")) {
            callbacks.onError(e instanceof Error ? e.message : "Unknown error");
          }
        }
      } else {
        // ── Mock generation ──
        await new Promise((r) => setTimeout(r, 800 + Math.random() * 1200));

        const { text: responseText, manifest } = generateMockResponse(prompt);
        const assistantMsg: ChatMessage = {
          id: generateMessageId(),
          role: "assistant",
          content: responseText,
          timestamp: Date.now(),
          manifest,
        };

        setMessages((prev) => [...prev, assistantMsg]);
        setLatestManifest(manifest);
        setShowManifest(true);
        setIsGenerating(false);
      }
    },
    [input, isGenerating, aiAvailable, buildAIMessages]
  );

  // ── Stop streaming ──
  const handleStop = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }

    // Save whatever we have so far
    if (streamingText) {
      const manifest = extractManifestFromResponse(streamingText);
      const displayText = manifest ? stripManifestBlock(streamingText) : streamingText;

      const partialMsg: ChatMessage = {
        id: generateMessageId(),
        role: "assistant",
        content: displayText + "\n\n*[Generation stopped by user]*",
        timestamp: Date.now(),
        manifest: manifest ?? undefined,
      };
      setMessages((prev) => [...prev, partialMsg]);

      if (manifest) {
        setLatestManifest(manifest);
        setShowManifest(true);
      }
    }

    setStreamingText("");
    setIsGenerating(false);
  }, [streamingText]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleCopy = () => {
    if (latestManifest) {
      navigator.clipboard.writeText(latestManifest);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  const handleDownload = () => {
    if (latestManifest) {
      try {
        const parsed = JSON.parse(latestManifest);
        downloadFile(`${parsed.id || "package"}-manifest.json`, latestManifest);
      } catch {
        downloadFile("manifest.json", latestManifest);
      }
    }
  };

  // ── Import manifest into Package Manager ──
  const handleImport = useCallback(async () => {
    if (!latestManifest) return;

    setImportStatus("importing");
    setImportError(null);

    try {
      const manifest: PackageManifest = JSON.parse(latestManifest);
      const result = await importManifest(manifest);

      if (result.success) {
        setImportStatus("success");
        onImported?.();
        // Auto-clear success after 3s
        setTimeout(() => setImportStatus("idle"), 3000);
        toast.success("Package imported successfully!");
      } else {
        setImportStatus("error");
        setImportError(result.error || "Failed to import manifest.");
        toast.error(result.error || "Failed to import manifest.");
      }
    } catch (e) {
      setImportStatus("error");
      setImportError(e instanceof Error ? e.message : "Invalid manifest JSON.");
      toast.error(e instanceof Error ? e.message : "Invalid manifest JSON.");
    }
  }, [latestManifest, onImported]);

  const handleReset = () => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setMessages([
      {
        id: "welcome",
        role: "assistant",
        content: `Welcome to the **AI Package Generator**! Describe the script package you need and I'll generate a complete \`manifest.json\`.

${aiAvailable ? `Connected to **${getAIModelName()}**.` : "Demo mode — add an OpenRouter API key in Settings for real AI."}

Pick a template or describe your package.`,
        timestamp: Date.now(),
      },
    ]);
    setLatestManifest(null);
    setShowManifest(false);
    setStreamingText("");
    setInput("");
    setImportStatus("idle");
    setImportError(null);
    setIsGenerating(false);
  };

  useEscapeKey(onClose);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60" />
      <div
        className="relative flex flex-col rounded-xl border overflow-hidden"
        style={{
          background: "var(--card)",
          borderColor: "var(--border)",
          width: "min(960px, 92vw)",
          height: "min(720px, 88vh)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary/15 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-primary" />
            </div>
            <div>
              <h3 className="text-sm text-foreground">AI Package Generator</h3>
              <p className="text-[10px] text-muted-foreground">
                {aiAvailable
                  ? <>Streaming via <span className="text-primary">{getAIModelName()}</span></>
                  : "Demo mode — configure API key in Settings for live AI"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={handleReset}
              title="Reset conversation"
            >
              <RotateCcw className="w-3.5 h-3.5 text-muted-foreground" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
              <X className="w-4 h-4 text-muted-foreground" />
            </Button>
          </div>
        </div>

        {/* Body — split view: chat + manifest */}
        <div className="flex-1 flex min-h-0">
          {/* Chat column */}
          <div className={`flex flex-col ${showManifest && latestManifest ? "w-1/2 border-r border-border" : "w-full"}`}>
            {/* Messages */}
            <div ref={scrollRef} className="flex-1 overflow-auto p-4 space-y-4">
              {messages.map((msg) => (
                <div key={msg.id} className={`flex gap-2.5 ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
                  <div
                    className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                      msg.role === "user" ? "bg-primary/15" : "bg-secondary"
                    }`}
                  >
                    {msg.role === "user" ? (
                      <User className="w-3.5 h-3.5 text-primary" />
                    ) : (
                      <Bot className="w-3.5 h-3.5 text-muted-foreground" />
                    )}
                  </div>
                  <div
                    className={`max-w-[85%] rounded-xl px-3.5 py-2.5 text-xs leading-relaxed ${
                      msg.role === "user"
                        ? "bg-primary/10 text-foreground"
                        : "bg-secondary/50 text-foreground"
                    }`}
                  >
                    <MessageContent content={msg.content} />
                  </div>
                </div>
              ))}

              {/* Streaming indicator */}
              {isGenerating && (
                <div className="flex gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-secondary flex items-center justify-center shrink-0">
                    <Bot className="w-3.5 h-3.5 text-muted-foreground" />
                  </div>
                  <div className="max-w-[85%] bg-secondary/50 rounded-xl px-3.5 py-2.5 text-xs leading-relaxed text-foreground">
                    {streamingText ? (
                      <MessageContent content={stripManifestBlock(streamingText)} />
                    ) : (
                      <span className="text-muted-foreground flex items-center gap-2">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        {aiAvailable ? "Generating with AI..." : "Generating package manifest..."}
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Templates — show only if no user messages */}
              {messages.length === 1 && !isGenerating && (
                <div className="pt-2 space-y-2">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                    Quick Start Templates
                  </p>
                  <div className="grid grid-cols-1 gap-1.5">
                    {TEMPLATES.map((t) => {
                      const TIcon = t.icon;
                      return (
                        <button
                          key={t.label}
                          onClick={() => handleSend(t.prompt)}
                          className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg border border-border bg-card/50 hover:bg-card hover:border-primary/30 transition-all text-left group"
                        >
                          <TIcon className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="text-[11px] text-foreground group-hover:text-primary transition-colors">
                              {t.label}
                            </div>
                            <div className="text-[10px] text-muted-foreground line-clamp-1">
                              {t.prompt.slice(0, 90)}...
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Input */}
            <div className="px-4 pb-4 pt-2 border-t border-border shrink-0">
              <div className="flex items-end gap-2">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Describe the package you want to create..."
                  className="flex-1 resize-none rounded-lg bg-secondary/50 border border-border px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/30"
                  style={{ fontFamily: "'Inter', sans-serif", minHeight: 40, maxHeight: 120 }}
                  rows={1}
                  disabled={isGenerating}
                />
                {isGenerating ? (
                  <Button
                    onClick={handleStop}
                    variant="destructive"
                    className="h-[40px] w-[40px] shrink-0"
                    size="icon"
                    title="Stop generation"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                ) : (
                  <Button
                    onClick={() => handleSend()}
                    disabled={!input.trim()}
                    className="h-[40px] w-[40px] shrink-0"
                    size="icon"
                  >
                    <Send className="w-4 h-4" />
                  </Button>
                )}
              </div>
            </div>
          </div>

          {/* Manifest preview column */}
          {showManifest && latestManifest && (
            <div className="w-1/2 flex flex-col">
              {/* Manifest header */}
              <div className="flex items-center justify-between px-4 py-2.5 bg-secondary/30 border-b border-border shrink-0">
                <div className="flex items-center gap-2">
                  <FileCode className="w-3.5 h-3.5 text-primary" />
                  <span className="text-xs text-foreground">manifest.json</span>
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                    {aiAvailable ? "AI Generated" : "Demo"}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={handleCopy}
                    className="p-1.5 rounded text-muted-foreground hover:text-foreground transition-colors"
                    title="Copy manifest"
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                  <button
                    onClick={handleDownload}
                    className="p-1.5 rounded text-muted-foreground hover:text-foreground transition-colors"
                    title="Download manifest.json"
                  >
                    <Download className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setShowManifest(false)}
                    className="p-1.5 rounded text-muted-foreground hover:text-foreground transition-colors"
                    title="Hide preview"
                  >
                    <ChevronDown className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Manifest code */}
              <div
                className="flex-1 overflow-auto bg-code-bg p-4"
                style={{ fontFamily: "'JetBrains Mono', monospace" }}
              >
                <pre className="text-[10px] leading-relaxed text-zinc-300 whitespace-pre">
                  {latestManifest}
                </pre>
              </div>

              {/* Manifest footer with Import button */}
              <div className="px-4 py-3 border-t border-border shrink-0 space-y-2">
                {/* Import status feedback */}
                {importStatus === "success" && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-500/10 text-emerald-400 text-[11px]">
                    <Check className="w-3.5 h-3.5" />
                    Package imported successfully! It now appears in your Package Manager.
                  </div>
                )}
                {importStatus === "error" && importError && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-500/10 text-red-400 text-[11px]">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    {importError}
                  </div>
                )}

                <div className="flex items-center gap-2">
                  <Button
                    onClick={handleImport}
                    disabled={importStatus === "importing" || importStatus === "success"}
                    className="gap-1.5 text-xs h-8 flex-1"
                  >
                    {importStatus === "importing" ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : importStatus === "success" ? (
                      <Check className="w-3.5 h-3.5" />
                    ) : (
                      <PackagePlus className="w-3.5 h-3.5" />
                    )}
                    {importStatus === "success" ? "Imported!" : importStatus === "importing" ? "Importing..." : "Import to Package Manager"}
                  </Button>
                  <Button
                    onClick={handleDownload}
                    variant="secondary"
                    className="gap-1.5 text-xs h-8"
                  >
                    <Download className="w-3.5 h-3.5" />
                    .json
                  </Button>
                  <Button
                    onClick={handleCopy}
                    variant="ghost"
                    className="gap-1.5 text-xs h-8"
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Simple markdown-ish message renderer ─────────────────────

function MessageContent({ content }: { content: string }) {
  const lines = content.split("\n");

  return (
    <div className="space-y-1">
      {lines.map((line, i) => {
        // Bold lines
        if (line.startsWith("**") && line.endsWith("**")) {
          return <div key={i} className="text-foreground">{line.slice(2, -2)}</div>;
        }

        // Bold prefix lines
        const boldMatch = line.match(/^\*\*(.+?)\*\*(.*)$/);
        if (boldMatch) {
          return (
            <div key={i}>
              <span className="text-foreground">{boldMatch[1]}</span>
              <span className="text-muted-foreground">{boldMatch[2]}</span>
            </div>
          );
        }

        // Italic lines (like *[Manifest generated]*)
        if (line.startsWith("*") && line.endsWith("*") && !line.startsWith("**")) {
          return <div key={i} className="text-primary/70 italic">{line.slice(1, -1)}</div>;
        }

        // List items
        if (line.startsWith("- ")) {
          const itemContent = line.slice(2);
          const parts = itemContent.split(/(\*\*[^*]+\*\*)/g);
          return (
            <div key={i} className="flex gap-1.5 pl-1 text-muted-foreground">
              <span className="text-primary shrink-0">&bull;</span>
              <span>
                {parts.map((part, j) => {
                  if (part.startsWith("**") && part.endsWith("**")) {
                    return <span key={j} className="text-foreground">{part.slice(2, -2)}</span>;
                  }
                  return renderInline(part, j);
                })}
              </span>
            </div>
          );
        }

        // Empty lines
        if (!line.trim()) return <div key={i} className="h-1" />;

        // Regular text
        const parts = line.split(/(`[^`]+`|\*\*[^*]+\*\*)/g);
        return (
          <div key={i}>
            {parts.map((part, j) => {
              if (part.startsWith("`") && part.endsWith("`")) {
                return (
                  <code
                    key={j}
                    className="px-1 py-0.5 rounded bg-secondary/80 text-[10px]"
                    style={{ fontFamily: "'JetBrains Mono', monospace" }}
                  >
                    {part.slice(1, -1)}
                  </code>
                );
              }
              if (part.startsWith("**") && part.endsWith("**")) {
                return <span key={j} className="text-foreground">{part.slice(2, -2)}</span>;
              }
              return <span key={j}>{part}</span>;
            })}
          </div>
        );
      })}
    </div>
  );
}

function renderInline(text: string, baseKey: number) {
  const codeParts = text.split(/(`[^`]+`)/g);
  return codeParts.map((cp, k) => {
    if (cp.startsWith("`") && cp.endsWith("`")) {
      return (
        <code
          key={`${baseKey}-${k}`}
          className="px-1 py-0.5 rounded bg-secondary/80 text-[10px]"
          style={{ fontFamily: "'JetBrains Mono', monospace" }}
        >
          {cp.slice(1, -1)}
        </code>
      );
    }
    return <span key={`${baseKey}-${k}`}>{cp}</span>;
  });
}