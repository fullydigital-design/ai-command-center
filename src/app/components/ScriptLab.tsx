// ============================================================
// ScriptLab — AI Script Engineer (5 modes)
// ============================================================
// 1. Script Generator — visual flag configurator per tool → generates .bat/.sh
// 2. BAT Analyzer — upload/paste .bat → AI analyzes, suggests fixes
// 3. Kohya Config — analyze/refine Kohya SS training configs
// 4. Musubi Config — analyze/refine Musubi Tuner training configs
// 5. AI Chat — free-form script engineering Q&A
// Lives as a tab inside SystemPage.

import { useState, useCallback, useEffect } from "react";
import {
  Wand2,
  FileSearch,
  MessageSquare,
  Terminal,
  Download,
  Cpu,
  Layers,
  Box,
  Monitor as MonitorIcon,
  Server,
  ToggleLeft,
  ToggleRight,
  Sparkles,
  Copy,
  Check,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  Flame,
  Play,
  Puzzle,
  GitBranch,
  Zap,
  GraduationCap,
  Wand,
  Rocket,
} from "lucide-react";
import { Button } from "./ui/button";
import { AIAssistant } from "./ai/AIAssistant";
import { ChatPanel } from "./ai/ChatPanel";
import { DownloadButton } from "./ai/DownloadButton";
import { QuickLauncher } from "./QuickLauncher";
import { useLauncherBridge } from "../hooks/useLauncherBridge";
import { toast } from "sonner";
import {
  buildScriptSystemPrompt,
  buildTrainingSystemPrompt,
  buildGitHubInstallPrompt,
  buildSystemConfigPrompt,
  buildAutoContextPrompt,
  downloadFile,
  isAIAvailable,
  chatCompletion,
  generateMessageId,
} from "../services/aiService";
import { TOOL_REGISTRY } from "../services/toolsRegistry";
import type { ChatMessage, GeneratedFile } from "../services/aiService";

// ============================================================
// Tool flag definitions for the Script Generator
// ============================================================

interface ToolFlag {
  id: string;
  label: string;
  description: string;
  default: boolean;
  category: "core" | "optional" | "advanced";
}

interface ToolDef {
  id: string;
  name: string;
  icon: typeof Cpu;
  color: string;
  description: string;
  port?: number;
  flags: ToolFlag[];
}

// ============================================================
// ComfyUI Custom Nodes — individually selectable
// ============================================================

interface CustomNode {
  id: string;
  name: string;
  repo: string;
  description: string;
  category: "essential" | "image" | "video" | "utility" | "face" | "workflow";
  default: boolean;
}

const COMFYUI_CUSTOM_NODES: CustomNode[] = [
  // Essential
  { id: "ComfyUI-Manager", name: "ComfyUI Manager", repo: "https://github.com/ltdrdata/ComfyUI-Manager.git", description: "ESSENTIAL - node package manager", category: "essential", default: true },
  { id: "ComfyUI-Impact-Pack", name: "Impact Pack", repo: "https://github.com/ltdrdata/ComfyUI-Impact-Pack.git", description: "Detailer, SAM, bbox", category: "essential", default: true },
  { id: "ComfyUI-Inspire-Pack", name: "Inspire Pack", repo: "https://github.com/ltdrdata/ComfyUI-Inspire-Pack.git", description: "Prompt utilities, regional conditioning", category: "essential", default: true },
  { id: "ComfyUI-KJNodes", name: "KJ Nodes", repo: "https://github.com/kijai/ComfyUI-KJNodes.git", description: "Utility nodes (kijai)", category: "essential", default: true },
  { id: "ComfyUI-Custom-Scripts", name: "Custom Scripts", repo: "https://github.com/pythongosssss/ComfyUI-Custom-Scripts.git", description: "Workflow tools (pythongosssss)", category: "essential", default: true },

  // Image / ControlNet
  { id: "ComfyUI-Advanced-ControlNet", name: "Advanced ControlNet", repo: "https://github.com/Kosinkadink/ComfyUI-Advanced-ControlNet.git", description: "ControlNet advanced tools", category: "image", default: true },
  { id: "comfyui_controlnet_aux", name: "ControlNet Aux", repo: "https://github.com/Fannovel16/comfyui_controlnet_aux.git", description: "Preprocessors (OpenPose, Canny, Depth, etc.)", category: "image", default: true },
  { id: "ComfyUI_IPAdapter_plus", name: "IP-Adapter Plus", repo: "https://github.com/cubiq/ComfyUI_IPAdapter_plus.git", description: "IP-Adapter image prompting", category: "image", default: true },
  { id: "ComfyUI-GGUF", name: "GGUF Loader", repo: "https://github.com/city96/ComfyUI-GGUF.git", description: "GGUF quantized model loading", category: "image", default: true },
  { id: "ComfyUI-Florence2", name: "Florence2", repo: "https://github.com/kijai/ComfyUI-Florence2.git", description: "Auto-captioning with Florence2", category: "image", default: false },

  // Video / Animation
  { id: "ComfyUI-VideoHelperSuite", name: "Video Helper Suite", repo: "https://github.com/Kosinkadink/ComfyUI-VideoHelperSuite.git", description: "Video I/O, loading, combining", category: "video", default: true },
  { id: "ComfyUI-AnimateDiff-Evolved", name: "AnimateDiff Evolved", repo: "https://github.com/Kosinkadink/ComfyUI-AnimateDiff-Evolved.git", description: "AnimateDiff video animation", category: "video", default: false },
  { id: "ComfyUI-Frame-Interpolation", name: "Frame Interpolation", repo: "https://github.com/Fannovel16/ComfyUI-Frame-Interpolation.git", description: "RIFE/FILM frame interpolation", category: "video", default: false },
  { id: "ComfyUI_FizzNodes", name: "FizzNodes", repo: "https://github.com/FizzleDorf/ComfyUI_FizzNodes.git", description: "Animation scheduling nodes", category: "video", default: false },

  // Utility
  { id: "was-node-suite-comfyui", name: "WAS Node Suite", repo: "https://github.com/WASasquatch/was-node-suite-comfyui.git", description: "100+ utility nodes", category: "utility", default: true },
  { id: "ComfyUI_essentials", name: "Essentials", repo: "https://github.com/cubiq/ComfyUI_essentials.git", description: "Essential utility tools", category: "utility", default: true },
  { id: "rgthree-comfy", name: "rgthree", repo: "https://github.com/rgthree/rgthree-comfy.git", description: "Workflow organizer, reroute, etc.", category: "utility", default: true },
  { id: "efficiency-nodes-comfyui", name: "Efficiency Nodes", repo: "https://github.com/jags111/efficiency-nodes-comfyui.git", description: "All-in-one efficient samplers", category: "utility", default: false },
  { id: "ComfyUI-Easy-Use", name: "Easy Use", repo: "https://github.com/yolain/ComfyUI-Easy-Use.git", description: "Simplified workflow nodes", category: "utility", default: false },
  { id: "ComfyUI-Crystools", name: "Crystools", repo: "https://github.com/crystian/ComfyUI-Crystools.git", description: "Debug + system monitor nodes", category: "utility", default: false },

  // Face
  { id: "comfyui-reactor-node", name: "ReActor", repo: "https://github.com/Gourieff/comfyui-reactor-node.git", description: "Face swap (ReActor)", category: "face", default: false },
  { id: "ComfyUI-FaceID-Plus", name: "FaceID Plus", repo: "https://github.com/cubiq/ComfyUI-FaceID-Plus.git", description: "FaceID + IP-Adapter face", category: "face", default: false },
];

const NODE_CATEGORIES: { key: string; label: string; color: string }[] = [
  { key: "essential", label: "Essential", color: "#6d5aff" },
  { key: "image", label: "Image / ControlNet", color: "#00d4aa" },
  { key: "video", label: "Video / Animation", color: "#ffd93d" },
  { key: "utility", label: "Utility", color: "#4ecdc4" },
  { key: "face", label: "Face", color: "#ff6b6b" },
];

const TOOLS: ToolDef[] = [
  {
    id: "comfyui",
    name: TOOL_REGISTRY.comfyui.name,
    icon: Box,
    color: TOOL_REGISTRY.comfyui.color,
    description: "Node-based image generation",
    port: TOOL_REGISTRY.comfyui.port,
    flags: [
      { id: "install", label: "Install / Update", description: "Git clone or pull latest ComfyUI", default: true, category: "core" },
      { id: "venv", label: "Create venv", description: "Setup Python virtual environment", default: true, category: "core" },
      { id: "pytorch", label: "Install PyTorch (CUDA 12.8)", description: "pip install torch with CUDA 12.8 support", default: true, category: "core" },
      { id: "requirements", label: "Install requirements", description: "pip install -r requirements.txt", default: true, category: "core" },
      { id: "models_symlink", label: "Symlink models dir", description: "Link shared models directory", default: true, category: "optional" },
      { id: "launch", label: "Auto-launch after install", description: "Start ComfyUI on port 8188", default: false, category: "advanced" },
      { id: "lowvram", label: "--lowvram flag", description: "For debugging VRAM issues (not needed on 5090)", default: false, category: "advanced" },
      { id: "listen", label: "--listen 0.0.0.0", description: "Allow network access", default: false, category: "advanced" },
    ],
  },
  {
    id: "swarmui",
    name: TOOL_REGISTRY.swarmui.name,
    icon: Layers,
    color: TOOL_REGISTRY.swarmui.color,
    description: "Web UI for image generation",
    port: TOOL_REGISTRY.swarmui.port,
    flags: [
      { id: "install", label: "Install / Update", description: "Git clone or pull latest SwarmUI", default: true, category: "core" },
      { id: "dotnet", label: "Install .NET 8 SDK", description: "Required runtime for SwarmUI", default: true, category: "core" },
      { id: "backends", label: "Configure backends", description: "Setup ComfyUI as backend", default: true, category: "optional" },
      { id: "models_symlink", label: "Symlink models dir", description: "Link shared models directory", default: true, category: "optional" },
      { id: "launch", label: "Auto-launch after install", description: "Start SwarmUI on port 7801", default: false, category: "advanced" },
    ],
  },
  {
    id: "kohya",
    name: TOOL_REGISTRY.kohya.name,
    icon: Sparkles,
    color: TOOL_REGISTRY.kohya.color,
    description: "LoRA / DreamBooth training GUI",
    port: TOOL_REGISTRY.kohya.port,
    flags: [
      { id: "install", label: "Install / Update", description: "Git clone or pull latest kohya_ss", default: true, category: "core" },
      { id: "venv", label: "Create venv", description: "Setup Python virtual environment", default: true, category: "core" },
      { id: "pytorch", label: "Install PyTorch (CUDA 12.8)", description: "pip install torch with CUDA 12.8 support", default: true, category: "core" },
      { id: "requirements", label: "Install requirements", description: "pip install -r requirements.txt", default: true, category: "core" },
      { id: "bitsandbytes", label: "bitsandbytes (Windows)", description: "Install bitsandbytes-windows for 8-bit AdamW", default: true, category: "optional" },
      { id: "xformers", label: "xformers", description: "Memory efficient attention (optional on 5090)", default: false, category: "optional" },
      { id: "tensorboard", label: "TensorBoard", description: "Install tensorboard for loss visualization", default: true, category: "optional" },
      { id: "launch", label: "Auto-launch after install", description: "Start Kohya SS GUI on port 7860", default: false, category: "advanced" },
    ],
  },
  {
    id: "musubi",
    name: "Musubi Tuner",
    icon: MonitorIcon,
    color: "#ffd93d",
    description: "Video LoRA training (Wan2.1, HunyuanVideo)",
    flags: [
      { id: "install", label: "Install / Update", description: "Git clone or pull latest musubi-tuner", default: true, category: "core" },
      { id: "venv", label: "Create venv", description: "Setup Python virtual environment", default: true, category: "core" },
      { id: "pytorch", label: "Install PyTorch (CUDA 12.8)", description: "pip install torch with CUDA 12.8 support", default: true, category: "core" },
      { id: "requirements", label: "Install requirements", description: "pip install -r requirements.txt", default: true, category: "core" },
      { id: "wan21", label: "Wan2.1 model download", description: "Download Wan2.1-T2V-14B from HuggingFace", default: false, category: "optional" },
      { id: "hunyuan", label: "HunyuanVideo download", description: "Download HunyuanVideo model", default: false, category: "optional" },
    ],
  },
  {
    id: "ollama",
    name: "Ollama",
    icon: Server,
    color: "#4ecdc4",
    description: "Local LLM inference",
    flags: [
      { id: "install", label: "Install Ollama", description: "Download and install Ollama", default: true, category: "core" },
      { id: "pull_models", label: "Pull default models", description: "ollama pull llama3.2, codestral, etc.", default: false, category: "optional" },
      { id: "env_vars", label: "Set environment variables", description: "OLLAMA_HOST, OLLAMA_MODELS, etc.", default: true, category: "optional" },
      { id: "start", label: "Start Ollama service", description: "ollama serve", default: false, category: "advanced" },
    ],
  },
];

// ============================================================
// Sub-mode tabs
// ============================================================

type ScriptLabMode = "generator" | "analyzer" | "kohya_config" | "musubi_config" | "chat" | "launcher";

const modeConfig: { key: ScriptLabMode; label: string; icon: typeof Wand2 }[] = [
  { key: "generator", label: "Script Generator", icon: Wand2 },
  { key: "analyzer", label: "BAT Analyzer", icon: FileSearch },
  { key: "kohya_config", label: "Kohya Config", icon: Flame },
  { key: "musubi_config", label: "Musubi Config", icon: Play },
  { key: "chat", label: "AI Chat", icon: MessageSquare },
  { key: "launcher", label: "Launcher", icon: Rocket },
];

// ============================================================
// Main ScriptLab Component
// ============================================================

export function ScriptLab() {
  const [mode, setMode] = useState<ScriptLabMode>("generator");
  const bridge = useLauncherBridge();

  // ── Bridge: auto-switch to launcher mode when pendingTool arrives ──
  useEffect(() => {
    if (bridge.pendingTool) {
      setMode("launcher");
    }
  }, [bridge.pendingTool]);

  return (
    <div className="space-y-4">
      {/* Sub-mode tabs */}
      <div className="flex gap-1 bg-card border border-border rounded-lg p-1 w-fit">
        {modeConfig.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setMode(key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs transition-colors ${
              mode === key
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* Mode content */}
      {mode === "generator" && <ScriptGenerator />}
      {mode === "analyzer" && <BATAnalyzer />}
      {mode === "kohya_config" && <KohyaConfig />}
      {mode === "musubi_config" && <MusubiConfig />}
      {mode === "chat" && <ScriptChat />}
      {mode === "launcher" && <QuickLauncher />}
    </div>
  );
}

// ============================================================
// Script Generator — Flag configurator + generate
// ============================================================

function ScriptGenerator() {
  const [enabledTools, setEnabledTools] = useState<Set<string>>(
    new Set(TOOLS.map((t) => t.id))
  );
  const [flagStates, setFlagStates] = useState<Record<string, Record<string, boolean>>>(() => {
    const initial: Record<string, Record<string, boolean>> = {};
    for (const tool of TOOLS) {
      initial[tool.id] = {};
      for (const flag of tool.flags) {
        initial[tool.id][flag.id] = flag.default;
      }
    }
    return initial;
  });
  const [expandedTools, setExpandedTools] = useState<Set<string>>(new Set(["comfyui"]));
  const [generatedFiles, setGeneratedFiles] = useState<GeneratedFile[]>([]);
  const [generating, setGenerating] = useState(false);
  const [generatedScript, setGeneratedScript] = useState("");
  const [copied, setCopied] = useState(false);

  // Custom nodes state
  const [enabledNodes, setEnabledNodes] = useState<Set<string>>(() => {
    return new Set(COMFYUI_CUSTOM_NODES.filter(n => n.default).map(n => n.id));
  });
  const [showNodes, setShowNodes] = useState(false);

  const available = isAIAvailable();

  const toggleTool = (toolId: string) => {
    setEnabledTools((prev) => {
      const next = new Set(prev);
      if (next.has(toolId)) next.delete(toolId);
      else next.add(toolId);
      return next;
    });
  };

  const toggleFlag = (toolId: string, flagId: string) => {
    setFlagStates((prev) => ({
      ...prev,
      [toolId]: {
        ...prev[toolId],
        [flagId]: !prev[toolId][flagId],
      },
    }));
  };

  const toggleToolExpand = (toolId: string) => {
    setExpandedTools((prev) => {
      const next = new Set(prev);
      if (next.has(toolId)) next.delete(toolId);
      else next.add(toolId);
      return next;
    });
  };

  const enabledFlagCount = (toolId: string) => {
    const states = flagStates[toolId];
    return Object.values(states).filter(Boolean).length;
  };

  const totalFlagCount = (toolId: string) => {
    return TOOLS.find((t) => t.id === toolId)?.flags.length || 0;
  };

  // Build a description of what user wants for AI prompt
  const buildToolDescription = useCallback(() => {
    const enabled = TOOLS.filter((t) => enabledTools.has(t.id));
    return enabled.map((tool) => {
      const enabledFlags = tool.flags
        .filter((f) => flagStates[tool.id][f.id])
        .map((f) => f.label);
      return `${tool.name}: ${enabledFlags.join(", ")}`;
    }).join("\n");
  }, [enabledTools, flagStates]);

  // Generate script using AI
  const handleGenerate = async () => {
    setGenerating(true);
    setGeneratedScript("");
    setGeneratedFiles([]);

    const toolDesc = buildToolDescription();
    const prompt = `Generate a complete Windows .bat installer/setup script for the following AI tools and options. The script should be well-structured with menu options, error handling, colored output, and clear section headers.

Target directory: C:\\_AI\\_test_fresh_all_AI\\
Hardware: RTX 5090 (32GB VRAM), Ryzen 9 9950X, 86GB RAM

Tools and enabled flags:
${toolDesc}

Requirements:
- @echo off and setlocal at the top
- Descriptive echo statements with [OK], [INFO], [ERROR] prefixes
- Error handling with if errorlevel checks
- Use --depth 1 for git clone to save space
- Use CUDA 12.8 compatible PyTorch
- Variables for all paths (portable)
- Comments explaining non-obvious commands
- A main menu to select which tool to install
- Individual functions/labels for each tool

Generate the complete .bat file content.`;

    try {
      const msg: ChatMessage = {
        id: generateMessageId(),
        role: "user",
        content: prompt,
        timestamp: Date.now(),
      };

      const response = await chatCompletion(
        [msg],
        buildScriptSystemPrompt("Script Generator")
      );

      // Extract code block if present
      const codeMatch = response.match(/```(?:bat|batch|cmd)?\s*\n([\s\S]*?)```/);
      const scriptContent = codeMatch ? codeMatch[1].trim() : response;

      setGeneratedScript(scriptContent);

      const file: GeneratedFile = {
        filename: "AI_Setup_Custom.bat",
        content: scriptContent,
        tool: "multi",
        type: "installer",
        platform: "windows",
        generatedAt: new Date().toISOString(),
        aiModified: true,
      };
      setGeneratedFiles([file]);
    } catch (err) {
      console.error("Generation failed:", err);
      setGeneratedScript(":: Error generating script. Check your OpenRouter API key in Settings.");
    } finally {
      setGenerating(false);
    }
  };

  // Quick generate (template-based, no AI)
  const handleQuickGenerate = () => {
    const script = generateTemplateScript(enabledTools, flagStates);
    setGeneratedScript(script);
    setGeneratedFiles([{
      filename: "AI_Setup_Quick.bat",
      content: script,
      tool: "multi",
      type: "installer",
      platform: "windows",
      generatedAt: new Date().toISOString(),
      aiModified: false,
    }]);
  };

  const handleCopy = () => {
    if (generatedScript) {
      navigator.clipboard.writeText(generatedScript);
      setCopied(true);
      toast.success("Script copied to clipboard");
      setTimeout(() => setCopied(false), 1500);
    }
  };

  return (
    <div className="space-y-4">
      {/* Tool cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {TOOLS.map((tool) => {
          const Icon = tool.icon;
          const enabled = enabledTools.has(tool.id);
          const expanded = expandedTools.has(tool.id);

          return (
            <div
              key={tool.id}
              className={`rounded-xl border transition-all ${
                enabled
                  ? "bg-card border-border"
                  : "bg-card/50 border-border/50 opacity-60"
              }`}
            >
              {/* Tool header */}
              <div className="flex items-center gap-3 p-4">
                <button
                  onClick={() => toggleTool(tool.id)}
                  className="shrink-0"
                  title={enabled ? "Disable tool" : "Enable tool"}
                >
                  {enabled ? (
                    <ToggleRight className="w-5 h-5" style={{ color: tool.color }} />
                  ) : (
                    <ToggleLeft className="w-5 h-5 text-muted-foreground" />
                  )}
                </button>
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                  style={{ backgroundColor: `${tool.color}15` }}
                >
                  <Icon className="w-4 h-4" style={{ color: tool.color }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h4 className="text-xs text-foreground">{tool.name}</h4>
                    {tool.port && (
                      <span className="text-[9px] px-1 py-0.5 rounded bg-secondary text-muted-foreground">
                        :{tool.port}
                      </span>
                    )}
                    {enabled && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ backgroundColor: `${tool.color}15`, color: tool.color }}>
                        {enabledFlagCount(tool.id)}/{totalFlagCount(tool.id)} flags
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-muted-foreground truncate">
                    {tool.description}
                  </p>
                </div>
                {enabled && (
                  <button
                    onClick={() => toggleToolExpand(tool.id)}
                    className="p-1 rounded hover:bg-secondary transition-colors"
                  >
                    {expanded ? (
                      <ChevronDown className="w-4 h-4 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-muted-foreground" />
                    )}
                  </button>
                )}
              </div>

              {/* Flag toggles */}
              {enabled && expanded && (
                <div className="px-4 pb-4 space-y-1 border-t border-border pt-3">
                  {(["core", "optional", "advanced"] as const).map((cat) => {
                    const catFlags = tool.flags.filter((f) => f.category === cat);
                    if (catFlags.length === 0) return null;

                    return (
                      <div key={cat} className="space-y-1">
                        <span className="text-[9px] text-muted-foreground/60 uppercase tracking-wider">
                          {cat}
                        </span>
                        {catFlags.map((flag) => (
                          <label
                            key={flag.id}
                            className="flex items-center gap-2.5 py-1 px-2 rounded-lg hover:bg-secondary/50 cursor-pointer transition-colors group"
                          >
                            <input
                              type="checkbox"
                              checked={flagStates[tool.id][flag.id]}
                              onChange={() => toggleFlag(tool.id, flag.id)}
                              className="accent-[var(--primary)] w-3.5 h-3.5 rounded"
                            />
                            <div className="flex-1 min-w-0">
                              <span className="text-[11px] text-foreground">
                                {flag.label}
                              </span>
                              <span className="text-[10px] text-muted-foreground/60 ml-2 hidden group-hover:inline">
                                {flag.description}
                              </span>
                            </div>
                          </label>
                        ))}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Custom nodes panel */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <button
          onClick={() => setShowNodes(!showNodes)}
          className="flex items-center justify-between w-full px-4 py-3 hover:bg-secondary/30 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Puzzle className="w-4 h-4 text-primary" />
            <span className="text-xs text-foreground">ComfyUI Custom Nodes</span>
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-primary/10 text-primary">
              {enabledNodes.size}/{COMFYUI_CUSTOM_NODES.length} selected
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span
              role="button"
              onClick={(e) => {
                e.stopPropagation();
                setEnabledNodes(new Set(COMFYUI_CUSTOM_NODES.map(n => n.id)));
              }}
              className="text-[10px] px-2 py-0.5 rounded bg-secondary text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            >
              All
            </span>
            <span
              role="button"
              onClick={(e) => {
                e.stopPropagation();
                setEnabledNodes(new Set());
              }}
              className="text-[10px] px-2 py-0.5 rounded bg-secondary text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            >
              None
            </span>
            <span
              role="button"
              onClick={(e) => {
                e.stopPropagation();
                setEnabledNodes(new Set(COMFYUI_CUSTOM_NODES.filter(n => n.default).map(n => n.id)));
              }}
              className="text-[10px] px-2 py-0.5 rounded bg-secondary text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            >
              Defaults
            </span>
            {showNodes ? (
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            )}
          </div>
        </button>

        {showNodes && (
          <div className="px-4 pb-4 space-y-4 border-t border-border pt-3">
            {NODE_CATEGORIES.map((cat) => {
              const catNodes = COMFYUI_CUSTOM_NODES.filter(n => n.category === cat.key);
              if (catNodes.length === 0) return null;
              const catEnabled = catNodes.filter(n => enabledNodes.has(n.id)).length;

              return (
                <div key={cat.key}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: cat.color }}
                      />
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
                        {cat.label}
                      </span>
                      <span className="text-[9px] text-muted-foreground/50">
                        {catEnabled}/{catNodes.length}
                      </span>
                    </div>
                    <span
                      role="button"
                      onClick={() => {
                        const allEnabled = catNodes.every(n => enabledNodes.has(n.id));
                        setEnabledNodes(prev => {
                          const next = new Set(prev);
                          catNodes.forEach(n => {
                            if (allEnabled) next.delete(n.id);
                            else next.add(n.id);
                          });
                          return next;
                        });
                      }}
                      className="text-[9px] px-1.5 py-0.5 rounded hover:text-foreground transition-colors cursor-pointer"
                      style={{ color: cat.color }}
                    >
                      {catNodes.every(n => enabledNodes.has(n.id)) ? "deselect all" : "select all"}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-1">
                    {catNodes.map((node) => {
                      const nodeEnabled = enabledNodes.has(node.id);
                      return (
                        <label
                          key={node.id}
                          className={`flex items-center gap-2.5 py-1.5 px-2.5 rounded-lg cursor-pointer transition-all ${
                            nodeEnabled
                              ? "bg-secondary/70 hover:bg-secondary"
                              : "hover:bg-secondary/30 opacity-60"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={nodeEnabled}
                            onChange={() => {
                              setEnabledNodes(prev => {
                                const next = new Set(prev);
                                if (nodeEnabled) next.delete(node.id);
                                else next.add(node.id);
                                return next;
                              });
                            }}
                            className="accent-[var(--primary)] w-3.5 h-3.5 rounded shrink-0"
                          />
                          <div className="flex-1 min-w-0">
                            <span className="text-[11px] text-foreground">{node.name}</span>
                            <span className="text-[10px] text-muted-foreground/50 ml-1.5">
                              — {node.description}
                            </span>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Generate buttons */}
      <div className="flex items-center gap-3">
        <Button
          onClick={handleGenerate}
          disabled={!available || generating || enabledTools.size === 0}
          className="gap-1.5"
        >
          {generating ? (
            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Sparkles className="w-3.5 h-3.5" />
          )}
          {generating ? "Generating with AI..." : "Generate with AI"}
        </Button>
        <Button
          variant="secondary"
          onClick={handleQuickGenerate}
          disabled={enabledTools.size === 0}
          className="gap-1.5"
        >
          <Terminal className="w-3.5 h-3.5" />
          Quick Generate (Template)
        </Button>
        <span className="text-[10px] text-muted-foreground">
          {enabledTools.size} tools selected
        </span>
      </div>

      {/* Generated script output */}
      {generatedScript && (
        <div className="rounded-xl border border-border bg-code-bg overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2 bg-code-header border-b border-border">
            <div className="flex items-center gap-2">
              <Terminal className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-xs text-zinc-400" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                {generatedFiles[0]?.filename || "generated_script.bat"}
              </span>
              {generatedFiles[0]?.aiModified && (
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                  AI Generated
                </span>
              )}
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">
                {generatedScript.split("\n").length} lines
              </span>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={handleCopy}
              >
                {copied ? (
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <Copy className="w-3.5 h-3.5 text-zinc-500" />
                )}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => downloadFile(generatedFiles[0]?.filename || "script.bat", generatedScript)}
              >
                <Download className="w-3.5 h-3.5 text-zinc-500" />
              </Button>
            </div>
          </div>
          <div
            className="overflow-auto max-h-[400px] p-4"
            style={{ fontFamily: "'JetBrains Mono', monospace" }}
          >
            {generatedScript.split("\n").map((line, i) => (
              <div key={i} className="flex">
                <span className="text-zinc-700 select-none w-8 shrink-0 text-right mr-3 text-[10px] leading-[1.5rem]">
                  {i + 1}
                </span>
                <pre className="text-[11px] leading-[1.5rem] text-zinc-400 whitespace-pre-wrap">
                  {line || " "}
                </pre>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Download panel */}
      {generatedFiles.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {generatedFiles.map((f) => (
            <DownloadButton key={f.filename} file={f} variant="full" />
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================
// BAT Analyzer — Upload/paste .bat → AI analyzes
// ============================================================

function BATAnalyzer() {
  const [content, setContent] = useState("");
  const [originalContent, setOriginalContent] = useState("");
  const [filename, setFilename] = useState<string | undefined>();

  const systemPrompt = buildScriptSystemPrompt("BAT Analyzer");

  const analyzePrompt = content
    ? `Analyze this Windows batch script and provide:
1. Critical bugs or issues
2. Missing error handling
3. Performance improvements (git --depth 1, pip --no-deps where safe)
4. Version-specific issues (CUDA compatibility, deprecated commands)
5. Maintainability suggestions
6. RTX 5090 / CUDA 12.8 specific recommendations

Here's the script:

\`\`\`bat
${content}
\`\`\``
    : undefined;

  const handleFileUpload = useCallback(
    (fileContent: string, fileName: string) => {
      setContent(fileContent);
      setOriginalContent(fileContent);
      setFilename(fileName);
    },
    []
  );

  return (
    <AIAssistant
      systemPrompt={systemPrompt}
      content={content}
      onContentChange={setContent}
      language="bat"
      filename={filename}
      originalContent={originalContent}
      allowUpload
      onFileUpload={handleFileUpload}
      suggestedPrompts={[
        "Find all bugs in this script",
        "Add error handling to every section",
        "Optimize for faster execution",
        "Make this script portable",
        "Add a main menu with numbered options",
        "Convert to use delayed expansion properly",
        "Add logging to a file",
        "Fix CUDA/PyTorch version issues",
      ]}
      chatPlaceholder="Ask about this batch script..."
      title="BAT Analyzer"
      description="Upload a .bat/.cmd script for AI-powered analysis"
      showAnalyze={!!content.trim()}
      analyzePrompt={analyzePrompt}
      editorMaxHeight={400}
    />
  );
}

// ============================================================
// Kohya Config — Analyze/refine Kohya SS training configs
// ============================================================

function KohyaConfig() {
  const [content, setContent] = useState("");
  const [originalContent, setOriginalContent] = useState("");
  const [filename, setFilename] = useState<string | undefined>();

  const systemPrompt = buildTrainingSystemPrompt("Kohya SS");

  const analyzePrompt = content
    ? `Analyze this Kohya SS training configuration file and provide optimization suggestions for my RTX 5090 (32GB VRAM, Ryzen 9 9950X, 86GB RAM). Focus on:

1. **VRAM Safety** — Will this config OOM on 32GB VRAM? Estimate VRAM usage based on batch size, resolution, network rank, and model type.
2. **RTX 5090 / Blackwell Optimizations** — Should I use bf16 instead of fp16? CUDA 12.8 specific settings? torch.compile benefits?
3. **Training Quality** — Is the learning rate appropriate? Network dim/alpha ratio? Noise offset? Caption handling?
4. **Performance / Speed** — Gradient checkpointing tradeoffs, cache_latents, optimal batch size, data loader workers?
5. **Common Mistakes** — Missing required fields, incorrect paths, deprecated options?
6. **Scheduler & Optimizer** — Is the chosen scheduler/optimizer optimal for this training type?

Here's the config:

\`\`\`toml
${content}
\`\`\``
    : undefined;

  const handleFileUpload = useCallback(
    (fileContent: string, fileName: string) => {
      setContent(fileContent);
      setOriginalContent(fileContent);
      setFilename(fileName);
    },
    []
  );

  return (
    <AIAssistant
      systemPrompt={systemPrompt}
      content={content}
      onContentChange={setContent}
      language="toml"
      filename={filename}
      originalContent={originalContent}
      allowUpload
      onFileUpload={handleFileUpload}
      suggestedPrompts={[
        "What's the optimal batch size for my 32GB VRAM?",
        "Should I use bf16 or fp16 on RTX 5090?",
        "Compare LoRA rank 64 vs 128 for quality",
        "Is my learning rate appropriate?",
        "What scheduler should I use?",
        "Optimize this for maximum quality",
        "How to reduce training time without quality loss?",
        "Explain gradient_checkpointing tradeoffs",
        "What noise_offset value should I use?",
        "Generate the accelerate launch command for this config",
      ]}
      chatPlaceholder="Ask about this Kohya SS config..."
      title="Kohya Config"
      description="Upload a .toml/.yaml config for Kohya SS training analysis"
      showAnalyze={!!content.trim()}
      analyzePrompt={analyzePrompt}
      editorMaxHeight={400}
    />
  );
}

// ============================================================
// Musubi Config — Analyze/refine Musubi Tuner training configs
// ============================================================

function MusubiConfig() {
  const [content, setContent] = useState("");
  const [originalContent, setOriginalContent] = useState("");
  const [filename, setFilename] = useState<string | undefined>();

  const systemPrompt = buildTrainingSystemPrompt("Musubi Tuner", "Wan2.1 (Video)");

  const analyzePrompt = content
    ? `Analyze this Musubi Tuner video training configuration file and provide optimization suggestions for my RTX 5090 (32GB VRAM, Ryzen 9 9950X, 86GB RAM). Focus on:

1. **VRAM Safety** — Will this config OOM on 32GB VRAM? Video training uses significantly more VRAM. Estimate based on frame count, resolution, batch size.
2. **RTX 5090 / Blackwell Optimizations** — bf16 vs fp16, CUDA 12.8 settings, torch.compile for video models?
3. **Video-Specific Quality** — Frame count vs quality tradeoff, resolution for Wan2.1/HunyuanVideo, temporal consistency settings?
4. **Performance / Speed** — cache_latents_to_disk importance for video, gradient accumulation steps, optimal workers?
5. **Common Mistakes** — Missing required fields for video training, incorrect dataset config, frame extraction issues?
6. **Model-Specific** — Wan2.1 vs HunyuanVideo specific recommendations, network dim for video LoRA?

Here's the config:

\`\`\`toml
${content}
\`\`\``
    : undefined;

  const handleFileUpload = useCallback(
    (fileContent: string, fileName: string) => {
      setContent(fileContent);
      setOriginalContent(fileContent);
      setFilename(fileName);
    },
    []
  );

  return (
    <AIAssistant
      systemPrompt={systemPrompt}
      content={content}
      onContentChange={setContent}
      language="toml"
      filename={filename}
      originalContent={originalContent}
      allowUpload
      onFileUpload={handleFileUpload}
      suggestedPrompts={[
        "Will this config OOM on my 32GB VRAM?",
        "Optimal frame count vs quality tradeoff?",
        "Should I cache latents to disk for video?",
        "Wan2.1 vs HunyuanVideo — which settings differ?",
        "What LoRA rank works best for video?",
        "How many gradient accumulation steps?",
        "Optimal resolution for Wan2.1 training?",
        "Generate the training launch command",
        "How to handle variable-length video clips?",
        "Explain frame_extraction options",
      ]}
      chatPlaceholder="Ask about this Musubi Tuner config..."
      title="Musubi Config"
      description="Upload a .toml/.yaml config for video LoRA training analysis"
      showAnalyze={!!content.trim()}
      analyzePrompt={analyzePrompt}
      editorMaxHeight={400}
    />
  );
}

// ============================================================
// AI Chat — Context-aware multi-domain AI assistant
// ============================================================

type ChatContext = "auto" | "training" | "scripts" | "github" | "system";

const CHAT_CONTEXTS: {
  key: ChatContext;
  label: string;
  icon: typeof Sparkles;
  color: string;
  description: string;
}[] = [
  { key: "auto", label: "Auto", icon: Wand, color: "#6d5aff", description: "Auto-detect intent" },
  { key: "training", label: "Training", icon: GraduationCap, color: "#ff6b6b", description: "Kohya/Musubi configs" },
  { key: "scripts", label: "Scripts", icon: Terminal, color: "#4ec9b0", description: "BAT/PowerShell/Python" },
  { key: "github", label: "GitHub", icon: GitBranch, color: "#f0883e", description: "Clone & install repos" },
  { key: "system", label: "System", icon: Zap, color: "#ffd93d", description: "ENV vars, CUDA, drivers" },
];

const CONTEXT_PROMPTS: Record<ChatContext, string[]> = {
  auto: [
    "Generate a Kohya SDXL LoRA config for 20 training images",
    "Create a BAT to install ComfyUI-Manager custom node",
    "Set up CUDA 12.8 environment variables for RTX 5090",
    "Clone and install a GitHub repo with venv + dependencies",
    "Optimize my system for AI workloads",
    "Write a script to backup all my models",
  ],
  training: [
    "Generate a Kohya SDXL LoRA config for character training",
    "Create a Musubi Wan2.1 video LoRA config",
    "What batch size fits in 32GB VRAM for SDXL LoRA?",
    "bf16 vs fp16 — which for RTX 5090 Blackwell?",
    "Optimal learning rate for 20 images, rank 64?",
    "Generate accelerate launch command for my config",
    "Compare AdamW8bit vs Prodigy optimizer",
    "How to set up caption files for character LoRA?",
  ],
  scripts: [
    "Write a one-click installer BAT for ComfyUI with all nodes",
    "Create a service watcher that auto-restarts ComfyUI if it crashes",
    "Script to batch-download models from CivitAI URLs",
    "Convert my BAT to PowerShell with proper error handling",
    "Write a cleanup script for pip cache + __pycache__",
    "Create a launcher BAT with GPU monitoring",
    "Script to update all git repos in AI_ROOT",
    "Add colored output and logging to my BAT",
  ],
  github: [
    "Install https://github.com/ltdrdata/ComfyUI-Manager as a custom node",
    "Clone and set up a Python repo with venv + requirements",
    "Generate an installer for a ComfyUI custom node pack",
    "Script to update all custom nodes in ComfyUI/custom_nodes/",
    "How to install a repo that needs CUDA compilation?",
    "Create a multi-repo installer with dependency checks",
    "Generate BAT to clone, install deps, and test a repo",
    "Install a HuggingFace Space locally",
  ],
  system: [
    "Set up CUDA_HOME and CUDA 12.8 environment variables",
    "Fix PYTORCH_CUDA_ALLOC_CONF for RTX 5090",
    "Enable HF_HUB_ENABLE_HF_TRANSFER for fast downloads",
    "Configure Windows page file for 32GB VRAM GPU",
    "Set NVIDIA TF32 override for Blackwell",
    "Fix PATH conflicts between multiple Python installations",
    "Optimize NVMe settings for model loading speed",
    "Script to verify all AI environment variables are set",
  ],
};

function getSystemPromptForContext(context: ChatContext): string {
  switch (context) {
    case "training":
      return buildTrainingSystemPrompt();
    case "scripts":
      return buildScriptSystemPrompt("AI Chat — Script Engineering");
    case "github":
      return buildGitHubInstallPrompt();
    case "system":
      return buildSystemConfigPrompt();
    case "auto":
    default:
      return buildAutoContextPrompt();
  }
}

function ScriptChat() {
  const [context, setContext] = useState<ChatContext>("auto");
  const [chatKey, setChatKey] = useState(0);

  const systemPrompt = getSystemPromptForContext(context);
  const suggestedPrompts = CONTEXT_PROMPTS[context];

  const handleContextChange = (newContext: ChatContext) => {
    setContext(newContext);
    // Reset chat when context changes to use new system prompt
    setChatKey((k) => k + 1);
  };

  return (
    <div className="space-y-3">
      {/* Context selector + hardware tags */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-primary" />
            <h3 className="text-sm text-foreground">AI Chat</h3>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary">
              Context-Aware
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {["RTX 5090 32GB", "Ryzen 9 9950X", "86GB DDR5", "CUDA 12.8", "Win"].map((tag) => (
              <span
                key={tag}
                className="text-[9px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>

        {/* Context chips */}
        <div className="flex flex-wrap gap-1.5">
          {CHAT_CONTEXTS.map(({ key, label, icon: Icon, color, description }) => (
            <button
              key={key}
              onClick={() => handleContextChange(key)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border transition-all text-left ${
                context === key
                  ? "border-primary/40 bg-primary/5"
                  : "border-border/50 bg-secondary/30 hover:bg-secondary/60 hover:border-border"
              }`}
            >
              <Icon
                className="w-3.5 h-3.5 shrink-0"
                style={{ color: context === key ? color : undefined }}
              />
              <div>
                <div
                  className="text-[11px]"
                  style={{ color: context === key ? color : undefined }}
                >
                  {label}
                </div>
                <div className="text-[9px] text-muted-foreground/60">{description}</div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Full-width chat panel */}
      <div style={{ height: "calc(100vh - 380px)", minHeight: "400px" }}>
        <ChatPanel
          key={chatKey}
          systemPrompt={systemPrompt}
          suggestedPrompts={suggestedPrompts}
          placeholder={
            context === "auto"
              ? "Ask about training, scripts, GitHub repos, or system config..."
              : context === "training"
              ? "Ask about Kohya/Musubi configs, VRAM, learning rates..."
              : context === "scripts"
              ? "Ask to generate BAT, PowerShell, or Python scripts..."
              : context === "github"
              ? "Paste a GitHub URL or ask about repo installation..."
              : "Ask about ENV vars, CUDA, drivers, system optimization..."
          }
        />
      </div>
    </div>
  );
}

// ============================================================
// Template-based script generator (no AI needed)
// ============================================================

function generateTemplateScript(
  enabledTools: Set<string>,
  flagStates: Record<string, Record<string, boolean>>
): string {
  const lines: string[] = [];
  const add = (s: string) => lines.push(s);

  add("@echo off");
  add("setlocal enabledelayedexpansion");
  add("");
  add(":: ============================================================");
  add(":: AI Pipeline Setup Script");
  add(`:: Generated: ${new Date().toISOString().split("T")[0]}`);
  add(":: Target: RTX 5090 (32GB VRAM), CUDA 12.8");
  add(":: ============================================================");
  add("");
  add('set "AI_ROOT=C:\\_AI\\_test_fresh_all_AI"');
  add('set "MODELS_DIR=%AI_ROOT%\\models"');
  add('set "PYTORCH_CUDA=cu128"');
  add('set "PYTHON_VER=3.10"');
  add("");
  add(":: Create root if needed");
  add('if not exist "%AI_ROOT%" mkdir "%AI_ROOT%"');
  add('cd /d "%AI_ROOT%"');
  add("");
  add("echo ============================================================");
  add("echo   AI Pipeline Setup - RTX 5090 Edition");
  add("echo ============================================================");
  add("echo.");
  add("");

  // Menu
  add(":MAIN_MENU");
  add("echo.");
  add("echo   Select an option:");
  let menuNum = 1;
  const menuMap: { num: number; toolId: string }[] = [];

  for (const tool of TOOLS) {
    if (enabledTools.has(tool.id)) {
      add(`echo   [${menuNum}] Install/Setup ${tool.name}`);
      menuMap.push({ num: menuNum, toolId: tool.id });
      menuNum++;
    }
  }
  add(`echo   [${menuNum}] Install ALL selected tools`);
  add(`echo   [0] Exit`);
  add("echo.");
  add('set /p "CHOICE=Enter choice: "');
  add("");

  for (const { num, toolId } of menuMap) {
    add(`if "%CHOICE%"=="${num}" goto SETUP_${toolId.toUpperCase()}`);
  }
  add(`if "%CHOICE%"=="${menuNum}" goto SETUP_ALL`);
  add('if "%CHOICE%"=="0" goto END');
  add("echo [ERROR] Invalid choice.");
  add("goto MAIN_MENU");
  add("");

  // Install ALL
  add(":SETUP_ALL");
  for (const { toolId } of menuMap) {
    add(`call :SETUP_${toolId.toUpperCase()}`);
  }
  add("echo.");
  add("echo [OK] All tools installed successfully!");
  add("goto MAIN_MENU");
  add("");

  // Individual tool sections
  for (const tool of TOOLS) {
    if (!enabledTools.has(tool.id)) continue;
    const flags = flagStates[tool.id];

    add(`:: ============================================================`);
    add(`:SETUP_${tool.id.toUpperCase()}`);
    add(`echo.`);
    add(`echo ============================================================`);
    add(`echo   Setting up ${tool.name}...`);
    add(`echo ============================================================`);
    add(`echo.`);

    const toolDir = tool.id === "kohya" ? "kohya_ss" : tool.id === "musubi" ? "musubi-tuner" : tool.id === "swarmui" ? "SwarmUI" : tool.id === "ollama" ? "" : tool.name;

    if (flags.install && tool.id !== "ollama") {
      add(`set "TOOL_DIR=%AI_ROOT%\\${toolDir}"`);
      add(`if exist "%TOOL_DIR%" (`);
      add(`    echo [INFO] ${tool.name} found, pulling latest...`);
      add(`    cd /d "%TOOL_DIR%"`);
      add(`    git pull`);
      add(`) else (`);
      add(`    echo [INFO] Cloning ${tool.name}...`);
      const repoUrl = getRepoUrl(tool.id);
      add(`    git clone --depth 1 ${repoUrl} "%TOOL_DIR%"`);
      add(`    cd /d "%TOOL_DIR%"`);
      add(`)`);
      add(`if errorlevel 1 (`);
      add(`    echo [ERROR] Git operation failed for ${tool.name}`);
      add(`    goto MAIN_MENU`);
      add(`)`);
      add(`echo [OK] ${tool.name} source ready.`);
      add("");
    }

    if (flags.install && tool.id === "ollama") {
      add(`echo [INFO] Installing Ollama...`);
      add(`winget install Ollama.Ollama`);
      add(`echo [OK] Ollama installed.`);
      add("");
    }

    if (flags.venv) {
      add(`echo [INFO] Setting up Python virtual environment...`);
      add(`if not exist "venv" (`);
      add(`    python -m venv venv`);
      add(`)`);
      add(`call venv\\Scripts\\activate.bat`);
      add(`echo [OK] Virtual environment activated.`);
      add("");
    }

    if (flags.pytorch) {
      add(`echo [INFO] Installing PyTorch with CUDA 12.8...`);
      add(`pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/%PYTORCH_CUDA%`);
      add(`if errorlevel 1 (`);
      add(`    echo [ERROR] PyTorch installation failed!`);
      add(`    goto MAIN_MENU`);
      add(`)`);
      add(`echo [OK] PyTorch installed with CUDA 12.8 support.`);
      add("");
    }

    if (flags.requirements) {
      add(`echo [INFO] Installing requirements...`);
      add(`pip install -r requirements.txt`);
      add(`echo [OK] Requirements installed.`);
      add("");
    }

    if (flags.dotnet) {
      add(`echo [INFO] Installing .NET 8 SDK...`);
      add(`winget install Microsoft.DotNet.SDK.8`);
      add(`echo [OK] .NET 8 SDK installed.`);
      add("");
    }

    if (flags.manager) {
      add(`echo [INFO] Installing ComfyUI Manager...`);
      add(`if not exist "custom_nodes\\ComfyUI-Manager" (`);
      add(`    git clone --depth 1 https://github.com/ltdrdata/ComfyUI-Manager.git custom_nodes\\ComfyUI-Manager`);
      add(`)`);
      add(`echo [OK] ComfyUI Manager installed.`);
      add("");
    }

    if (flags.custom_nodes) {
      add(`echo [INFO] Installing essential custom nodes...`);
      add(`cd custom_nodes`);
      for (const [name, url] of [
        ["ComfyUI-WAS-Node-Suite", "https://github.com/WASasquatch/was-node-suite-comfyui.git"],
        ["ComfyUI-Impact-Pack", "https://github.com/ltdrdata/ComfyUI-Impact-Pack.git"],
        ["ComfyUI-ControlNet", "https://github.com/Fannovel16/comfyui_controlnet_aux.git"],
      ]) {
        add(`if not exist "${name}" git clone --depth 1 ${url}`);
      }
      add(`cd ..`);
      add(`echo [OK] Custom nodes installed.`);
      add("");
    }

    if (flags.models_symlink) {
      add(`echo [INFO] Creating models symlink...`);
      add(`if not exist "models" (`);
      add(`    mklink /J models "%MODELS_DIR%"`);
      add(`)`);
      add(`echo [OK] Models directory linked.`);
      add("");
    }

    if (flags.bitsandbytes) {
      add(`echo [INFO] Installing bitsandbytes...`);
      add(`pip install bitsandbytes`);
      add(`echo [OK] bitsandbytes installed.`);
      add("");
    }

    if (flags.xformers) {
      add(`echo [INFO] Installing xformers...`);
      add(`pip install xformers`);
      add(`echo [OK] xformers installed.`);
      add("");
    }

    if (flags.tensorboard) {
      add(`echo [INFO] Installing TensorBoard...`);
      add(`pip install tensorboard`);
      add(`echo [OK] TensorBoard installed.`);
      add("");
    }

    if (flags.pull_models) {
      add(`echo [INFO] Pulling default Ollama models...`);
      add(`ollama pull llama3.2`);
      add(`ollama pull codestral`);
      add(`echo [OK] Models pulled.`);
      add("");
    }

    if (flags.env_vars) {
      add(`echo [INFO] Setting Ollama environment variables...`);
      add(`setx OLLAMA_HOST "0.0.0.0:11434"`);
      add(`setx OLLAMA_MODELS "%AI_ROOT%\\ollama_models"`);
      add(`echo [OK] Environment variables set.`);
      add("");
    }

    if (flags.launch || flags.start) {
      if (tool.id === "comfyui") {
        add(`echo [INFO] Launching ComfyUI...`);
        add(`start "ComfyUI" python main.py${flags.listen ? " --listen 0.0.0.0" : ""}${flags.lowvram ? " --lowvram" : ""} --port 8188`);
      } else if (tool.id === "swarmui") {
        add(`echo [INFO] Launching SwarmUI...`);
        add(`start "SwarmUI" dotnet run --project .`);
      } else if (tool.id === "kohya") {
        add(`echo [INFO] Launching Kohya SS GUI...`);
        add(`start "Kohya" python kohya_gui.py --listen 127.0.0.1 --server_port 7860`);
      } else if (tool.id === "ollama") {
        add(`echo [INFO] Starting Ollama service...`);
        add(`start "Ollama" ollama serve`);
      }
      add("");
    }

    add(`echo [OK] ${tool.name} setup complete!`);
    add(`echo.`);
    add(`goto MAIN_MENU`);
    add("");
  }

  add(":END");
  add("echo.");
  add("echo Goodbye!");
  add("endlocal");
  add("pause");

  return lines.join("\n");
}

function getRepoUrl(toolId: string): string {
  const repos: Record<string, string> = {
    comfyui: "https://github.com/comfyanonymous/ComfyUI.git",
    swarmui: "https://github.com/mcmonkeyprojects/SwarmUI.git",
    kohya: "https://github.com/bmaltais/kohya_ss.git",
    musubi: "https://github.com/kohya-ss/musubi-tuner.git",
  };
  return repos[toolId] || "";
}