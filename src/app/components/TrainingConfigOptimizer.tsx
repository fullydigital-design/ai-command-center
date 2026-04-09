// ============================================================
// TrainingConfigOptimizer — AI-powered training config analyzer
// ============================================================
// Upload/paste a .toml training config → AI analyzes it against
// RTX 5090 hardware profile → returns suggestions → chat for Q&A.
// Lives as a tab inside TrainingPage.

import { useState, useCallback } from "react";
import {
  Upload,
  FileCode,
  Cpu,
  MemoryStick,
  Gauge,
  Target,
  Sparkles,
  ChevronDown,
  Layers,
} from "lucide-react";
import { AIAssistant } from "./ai/AIAssistant";
import { buildTrainingSystemPrompt } from "../services/aiService";

// --- Sample TOML config for demo purposes ---
const SAMPLE_KOHYA_CONFIG = `# Kohya SS LoRA Training Config
# Model: SDXL 1.0 | RTX 5090

[model]
pretrained_model_name_or_path = "stabilityai/stable-diffusion-xl-base-1.0"
v2 = false
v_parameterization = false

[output]
output_name = "my_character_lora"
output_dir = "C:\\\\_AI\\\\_test_fresh_all_AI\\\\training_data\\\\outputs"
save_every_n_epochs = 1
save_model_as = "safetensors"

[training]
max_train_epochs = 20
train_batch_size = 4
resolution = "1024,1024"
mixed_precision = "fp16"
gradient_checkpointing = false
gradient_accumulation_steps = 1
learning_rate = 1e-4
lr_scheduler = "constant"
lr_warmup_steps = 0
optimizer_type = "AdamW8bit"
max_token_length = 225
seed = 42
cache_latents = false
cache_latents_to_disk = false

[network]
network_module = "networks.lora"
network_dim = 128
network_alpha = 128
network_train_unet_only = false
network_train_text_encoder_only = false

[dataset]
train_data_dir = "C:\\\\_AI\\\\_test_fresh_all_AI\\\\training_data\\\\my_character"
reg_data_dir = ""
max_data_loader_n_workers = 4
caption_extension = ".txt"
shuffle_caption = true

[logging]
logging_dir = "C:\\\\_AI\\\\_test_fresh_all_AI\\\\training_data\\\\logs"
log_prefix = "my_character_lora"

[advanced]
clip_skip = 2
noise_offset = 0.0357
min_snr_gamma = 5
bucket_reso_steps = 64
bucket_no_upscale = true
`;

const SAMPLE_MUSUBI_CONFIG = `# Musubi Tuner - Wan2.1 Video LoRA Config
# Model: Wan2.1-T2V-14B | RTX 5090

[model]
pretrained_model_name_or_path = "Wan-AI/Wan2.1-T2V-14B"
dit = "Wan-AI/Wan2.1-T2V-14B"

[output]
output_name = "my_video_lora"
output_dir = "C:\\\\_AI\\\\_test_fresh_all_AI\\\\training_data\\\\outputs\\\\video"
save_every_n_epochs = 2
save_model_as = "safetensors"

[training]
max_train_epochs = 10
train_batch_size = 1
resolution = "480,832"
frame_extraction = "head"
max_frames = 49
mixed_precision = "fp16"
gradient_checkpointing = true
gradient_accumulation_steps = 4
learning_rate = 2e-4
lr_scheduler = "cosine"
lr_warmup_steps = 100
optimizer_type = "adamw"
seed = 42
cache_latents = true
cache_latents_to_disk = true

[network]
network_module = "networks.lora_wan"
network_dim = 32
network_alpha = 16

[dataset]
dataset_config = "C:\\\\_AI\\\\_test_fresh_all_AI\\\\training_data\\\\video_dataset\\\\config.toml"
caption_extension = ".txt"

[logging]
logging_dir = "C:\\\\_AI\\\\_test_fresh_all_AI\\\\training_data\\\\logs\\\\video"
log_prefix = "video_lora"
`;

// --- VRAM Estimation ---
interface VRAMEstimate {
  modelBase: number;
  activations: number;
  gradients: number;
  optimizer: number;
  total: number;
  headroom: number;
  safe: boolean;
}

function estimateVRAM(config: string): VRAMEstimate | null {
  try {
    const batchSize = parseInt(config.match(/train_batch_size\s*=\s*(\d+)/)?.[1] || "1");
    const resolution = parseInt(config.match(/resolution\s*=\s*"?(\d+)/)?.[1] || "512");
    const gradCheckpoint = /gradient_checkpointing\s*=\s*true/i.test(config);
    const isSDXL = config.includes("sdxl") || config.includes("stable-diffusion-xl") || resolution >= 1024;
    const isWan = config.includes("Wan") || config.includes("wan");
    const networkDim = parseInt(config.match(/network_dim\s*=\s*(\d+)/)?.[1] || "64");
    const cacheLat = /cache_latents\s*=\s*true/i.test(config);

    let modelBase = isWan ? 16.0 : isSDXL ? 6.8 : 4.2;
    let activations = batchSize * (resolution / 512) ** 2 * (isSDXL ? 2.5 : 1.5);
    if (isWan) activations = batchSize * 4.0; // Video is different
    if (gradCheckpoint) activations *= 0.6;

    let gradients = (networkDim / 64) * (isSDXL ? 1.2 : 0.8);
    let optimizer = gradients * 2; // AdamW stores m and v

    if (cacheLat) modelBase -= isWan ? 2.0 : 0.8;

    const total = modelBase + activations + gradients + optimizer;
    const headroom = 32 - total;

    return {
      modelBase: Math.round(modelBase * 10) / 10,
      activations: Math.round(activations * 10) / 10,
      gradients: Math.round(gradients * 10) / 10,
      optimizer: Math.round(optimizer * 10) / 10,
      total: Math.round(total * 10) / 10,
      headroom: Math.round(headroom * 10) / 10,
      safe: headroom > 2,
    };
  } catch {
    return null;
  }
}

// --- Detect training tool and model from config content ---
function detectTrainingTool(config: string): string {
  if (config.includes("Wan") || config.includes("wan") || config.includes("musubi")) {
    return "Musubi Tuner";
  }
  return "Kohya SS";
}

function detectModelArch(config: string): string {
  if (config.includes("sdxl") || config.includes("stable-diffusion-xl")) return "SDXL 1.0";
  if (config.includes("sd3") || config.includes("stable-diffusion-3")) return "SD3.5";
  if (config.includes("Wan2.1")) return "Wan2.1 (Video)";
  if (config.includes("flux")) return "FLUX";
  if (config.includes("hunyuan")) return "HunyuanVideo";
  return "Unknown";
}

function detectDatasetInfo(config: string): string {
  const dir = config.match(/train_data_dir\s*=\s*"([^"]+)"/)?.[1];
  const datasetConfig = config.match(/dataset_config\s*=\s*"([^"]+)"/)?.[1];
  return dir || datasetConfig || "Not detected";
}

// --- Preset templates ---
interface ConfigPreset {
  id: string;
  label: string;
  description: string;
  tool: "kohya" | "musubi";
  icon: typeof Cpu;
}

const presets: ConfigPreset[] = [
  {
    id: "kohya-sdxl",
    label: "Kohya SDXL LoRA",
    description: "Standard SDXL LoRA training config",
    tool: "kohya",
    icon: Target,
  },
  {
    id: "musubi-wan",
    label: "Musubi Wan2.1 Video",
    description: "Wan2.1 video LoRA training config",
    tool: "musubi",
    icon: Layers,
  },
];

// --- Suggested prompts ---
const trainingPrompts = [
  "What's the optimal batch size for my VRAM?",
  "Should I use bf16 or fp16 on RTX 5090?",
  "Compare LoRA rank 64 vs 128 for this config",
  "How to reduce training time without quality loss?",
  "Is my learning rate appropriate for this dataset size?",
  "What scheduler should I use?",
  "Explain gradient_checkpointing tradeoffs",
  "Optimize this config for maximum quality",
];

export function TrainingConfigOptimizer() {
  const [content, setContent] = useState("");
  const [originalContent, setOriginalContent] = useState("");
  const [filename, setFilename] = useState<string | undefined>();
  const [showPresets, setShowPresets] = useState(true);

  const tool = content ? detectTrainingTool(content) : "";
  const modelArch = content ? detectModelArch(content) : "";
  const datasetInfo = content ? detectDatasetInfo(content) : "";
  const vram = content ? estimateVRAM(content) : null;

  const systemPrompt = buildTrainingSystemPrompt(
    tool || undefined,
    modelArch || undefined,
    datasetInfo || undefined
  );

  const handleFileUpload = useCallback(
    (fileContent: string, fileName: string) => {
      setContent(fileContent);
      setOriginalContent(fileContent);
      setFilename(fileName);
      setShowPresets(false);
    },
    []
  );

  const handleLoadPreset = useCallback((preset: ConfigPreset) => {
    const config = preset.tool === "musubi" ? SAMPLE_MUSUBI_CONFIG : SAMPLE_KOHYA_CONFIG;
    setContent(config);
    setOriginalContent(config);
    setFilename(
      preset.tool === "musubi"
        ? "musubi_wan21_config.toml"
        : "kohya_sdxl_lora.toml"
    );
    setShowPresets(false);
  }, []);

  const handleContentChange = useCallback((newContent: string) => {
    setContent(newContent);
  }, []);

  const analyzePrompt = content
    ? `Analyze this ${tool} training configuration for ${modelArch} and provide optimization suggestions for my RTX 5090 (32GB VRAM). Focus on:
1. VRAM safety (will this OOM?)
2. RTX 5090/Blackwell-specific optimizations (bf16, CUDA 12.8)
3. Training quality improvements
4. Performance/speed optimizations

Here's the config:

\`\`\`toml
${content}
\`\`\``
    : undefined;

  // VRAM estimation header
  const headerContent = content ? (
    <div className="space-y-3">
      {/* Detected info bar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-secondary text-xs text-muted-foreground">
          <FileCode className="w-3 h-3" />
          {tool || "Unknown tool"}
        </div>
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-secondary text-xs text-muted-foreground">
          <Cpu className="w-3 h-3" />
          {modelArch || "Unknown model"}
        </div>
        {datasetInfo !== "Not detected" && (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-secondary text-xs text-muted-foreground">
            <Upload className="w-3 h-3" />
            {datasetInfo.split("\\").pop() || datasetInfo}
          </div>
        )}
      </div>

      {/* VRAM estimation */}
      {vram && (
        <div
          className={`rounded-xl border p-4 ${
            vram.safe
              ? "bg-emerald-500/5 border-emerald-500/20"
              : "bg-red-500/5 border-red-500/20"
          }`}
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <MemoryStick
                className={`w-4 h-4 ${
                  vram.safe ? "text-emerald-400" : "text-red-400"
                }`}
              />
              <span className="text-xs text-foreground">
                VRAM Estimate
              </span>
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded ${
                  vram.safe
                    ? "bg-emerald-500/10 text-emerald-400"
                    : "bg-red-500/10 text-red-400"
                }`}
              >
                {vram.safe ? "Safe" : "Risk of OOM"}
              </span>
            </div>
            <span
              className={`text-sm ${
                vram.safe ? "text-emerald-400" : "text-red-400"
              }`}
              style={{ fontFamily: "'JetBrains Mono', monospace" }}
            >
              {vram.total} / 32.0 GB
            </span>
          </div>

          {/* VRAM breakdown bar */}
          <div className="h-4 rounded-full bg-secondary overflow-hidden flex">
            <div
              className="h-full bg-blue-500/60"
              style={{ width: `${(vram.modelBase / 32) * 100}%` }}
              title={`Model: ${vram.modelBase} GB`}
            />
            <div
              className="h-full bg-amber-500/60"
              style={{ width: `${(vram.activations / 32) * 100}%` }}
              title={`Activations: ${vram.activations} GB`}
            />
            <div
              className="h-full bg-purple-500/60"
              style={{ width: `${(vram.gradients / 32) * 100}%` }}
              title={`Gradients: ${vram.gradients} GB`}
            />
            <div
              className="h-full bg-cyan-500/60"
              style={{ width: `${(vram.optimizer / 32) * 100}%` }}
              title={`Optimizer: ${vram.optimizer} GB`}
            />
          </div>

          {/* Legend */}
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-sm bg-blue-500/60" />
              Model {vram.modelBase}GB
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-sm bg-amber-500/60" />
              Activations {vram.activations}GB
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-sm bg-purple-500/60" />
              Gradients {vram.gradients}GB
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-sm bg-cyan-500/60" />
              Optimizer {vram.optimizer}GB
            </span>
            <span className="flex items-center gap-1">
              <Gauge className="w-2.5 h-2.5" />
              Headroom: {vram.headroom}GB
            </span>
          </div>
        </div>
      )}
    </div>
  ) : (
    // Show presets when no content loaded
    showPresets ? (
      <div className="space-y-4">
        <div className="text-center py-6">
          <Sparkles className="w-10 h-10 text-primary/20 mx-auto mb-3" />
          <h3 className="text-sm text-foreground mb-1">
            Training Config Optimizer
          </h3>
          <p className="text-[11px] text-muted-foreground max-w-md mx-auto">
            Upload your training .toml config or load a sample to get AI-powered
            optimization suggestions tailored for your RTX 5090.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {presets.map((preset) => {
            const Icon = preset.icon;
            return (
              <button
                key={preset.id}
                onClick={() => handleLoadPreset(preset)}
                className="flex items-start gap-3 p-4 rounded-xl border border-border bg-card hover:border-primary/30 transition-all text-left group"
              >
                <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 group-hover:bg-primary/20 transition-colors">
                  <Icon className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <h4 className="text-xs text-foreground mb-0.5">
                    {preset.label}
                  </h4>
                  <p className="text-[11px] text-muted-foreground">
                    {preset.description}
                  </p>
                </div>
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2 text-[11px] text-muted-foreground justify-center">
          <ChevronDown className="w-3 h-3" />
          Or upload your own .toml file using the editor below
        </div>
      </div>
    ) : null
  );

  return (
    <AIAssistant
      systemPrompt={systemPrompt}
      content={content}
      onContentChange={handleContentChange}
      language="toml"
      filename={filename}
      originalContent={originalContent}
      allowUpload
      onFileUpload={handleFileUpload}
      suggestedPrompts={trainingPrompts}
      chatPlaceholder="Ask about training config..."
      title="Config Optimizer"
      description="AI-powered training config analysis for RTX 5090"
      showAnalyze={!!content.trim()}
      analyzePrompt={analyzePrompt}
      headerContent={headerContent}
      editorMaxHeight={350}
    />
  );
}
