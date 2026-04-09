// ============================================================
// HuggingFaceColumn — HuggingFace models column for Community Hub
// ============================================================
// Extracted from CommunityHubPage.tsx (Phase 5)

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Clock,
  ExternalLink,
  TrendingUp,
  Download,
  RefreshCw,
  Package,
  Zap,
  Loader2,
  FolderOpen,
  Pin,
  PinOff,
  ChevronDown,
  ChevronRight,
  Heart,
  HardDrive,
  Cpu,
  Shield,
  Lock,
} from "lucide-react";

import type { HFModel, HFArchitecture, HFModelType } from "../../services/huggingfaceService";
import {
  getHFDataSource,
  getHFModels,
  downloadHFModel,
  getHFModelUrl,
  getHFArchitectures,
  getHFTypes,
  getHFFetchMeta,
  clearHFCache,
} from "../../services/huggingfaceService";

import { SourceBadge, formatDateTime, typeColors } from "./shared";
import { CommunityCardSkeleton } from "../skeletons";

const hfArchitectures = getHFArchitectures();
const hfTypes = getHFTypes();

// VRAM fit colors
const vramColors: Record<string, { bg: string; text: string; label: string }> = {
  green: { bg: "bg-chart-2/15", text: "text-chart-2", label: "Fits 32GB" },
  yellow: { bg: "bg-chart-4/15", text: "text-chart-4", label: "Tight fit" },
  red: { bg: "bg-chart-3/15", text: "text-chart-3", label: "Too large" },
};

// License badges
const licenseStyles: Record<string, { bg: string; text: string; icon: typeof Shield }> = {
  open: { bg: "bg-chart-2/15", text: "text-chart-2", icon: Shield },
  gated: { bg: "bg-chart-4/15", text: "text-chart-4", icon: Lock },
  commercial: { bg: "bg-chart-3/15", text: "text-chart-3", icon: Lock },
};

export function HuggingFaceColumn({ search }: { search: string }) {
  const [arch, setArch] = useState<HFArchitecture>("all");
  const [type, setType] = useState<HFModelType | "all">("all");
  const [models, setModels] = useState<HFModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const isLive = getHFDataSource() !== "simulated";

  const loadModels = useCallback(async () => {
    setLoading(true);
    const data = await getHFModels();
    setModels(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadModels();
  }, [loadModels]);

  const handleDownload = async (model: HFModel) => {
    setDownloadingId(model.id);
    await downloadHFModel(model.id);
    setDownloadingId(null);
  };

  const togglePin = (id: string) => {
    setModels((prev) =>
      prev.map((m) => (m.id === id ? { ...m, pinned: !m.pinned } : m))
    );
  };

  const filtered = useMemo(() => {
    let result = models.filter((m) => {
      if (arch !== "all" && m.architecture !== arch) return false;
      if (type !== "all" && m.type !== type) return false;
      if (search && !m.name.toLowerCase().includes(search.toLowerCase()) && !m.description.toLowerCase().includes(search.toLowerCase()) && !m.repoId.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
    result.sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      if (a.trending !== b.trending) return a.trending ? -1 : 1;
      return b.likes - a.likes;
    });
    return result;
  }, [models, arch, type, search]);

  const trendingModels = models.filter((m) => m.trending);

  return (
    <div className="flex flex-col h-full border-r border-border overflow-hidden">
      {/* Column Header */}
      <div className="p-3 border-b border-border bg-card/50 shrink-0">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="text-base">{"\uD83E\uDD17"}</span>
            <span className="text-sm text-foreground">HuggingFace</span>
            <span className="text-[10px] px-1.5 py-0.5 bg-secondary rounded text-muted-foreground">
              {models.length}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <SourceBadge isLive={isLive} meta={getHFFetchMeta()} onForceRefresh={() => { clearHFCache(); loadModels(); }} />
            <button
              onClick={loadModels}
              className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
              title="Refresh"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="flex items-center gap-3 text-[10px] text-muted-foreground mb-2">
          <span className="flex items-center gap-1">
            <Package className="w-2.5 h-2.5 text-primary" /> {models.filter(m => m.type === "checkpoint").length} checkpoints
          </span>
          <span className="flex items-center gap-1">
            <Zap className="w-2.5 h-2.5 text-chart-5" /> {models.filter(m => m.type === "lora").length} LoRAs
          </span>
          <span className="flex items-center gap-1 ml-auto">
            <HardDrive className="w-2.5 h-2.5" /> 32GB VRAM
          </span>
        </div>

        {/* Architecture filter */}
        <div className="flex gap-1 overflow-x-auto pb-0.5">
          {hfArchitectures.map((a) => (
            <button
              key={a.value}
              onClick={() => setArch(a.value)}
              className={`px-2 py-1 rounded text-[10px] whitespace-nowrap transition-colors ${
                arch === a.value
                  ? "bg-[hsl(45,100%,55%)] text-black"
                  : "bg-secondary/50 text-muted-foreground hover:text-foreground"
              }`}
            >
              {a.label}
            </button>
          ))}
        </div>

        {/* Type filter */}
        <div className="flex gap-1 mt-1 overflow-x-auto pb-0.5">
          {hfTypes.slice(0, 6).map((t) => (
            <button
              key={t.value}
              onClick={() => setType(t.value)}
              className={`px-2 py-0.5 rounded text-[9px] whitespace-nowrap transition-colors ${
                type === t.value
                  ? "bg-foreground/10 text-foreground"
                  : "text-muted-foreground/60 hover:text-muted-foreground"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Trending */}
      {arch === "all" && type === "all" && trendingModels.length > 0 && (
        <div className="px-3 py-2 border-b border-border bg-gradient-to-r from-[hsl(45,100%,55%)]/5 to-chart-5/5 shrink-0">
          <div className="flex items-center gap-1.5 mb-1.5">
            <TrendingUp className="w-3 h-3 text-[hsl(45,100%,55%)]" />
            <span className="text-[10px] text-[hsl(45,100%,55%)]">Hot Models</span>
          </div>
          <div className="flex gap-1.5 overflow-x-auto pb-0.5">
            {trendingModels.map((m) => (
              <a
                key={m.id}
                href={getHFModelUrl(m.repoId)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-shrink-0 px-2 py-1 bg-card/60 border border-border rounded flex items-center gap-1.5 hover:border-[hsl(45,100%,55%)]/30 transition-colors"
              >
                <span className={`text-[9px] px-1 rounded ${typeColors[m.type]?.bg || ""} ${typeColors[m.type]?.text || ""}`}>
                  {m.type === "checkpoint" ? "CKP" : m.type.toUpperCase().slice(0, 3)}
                </span>
                <span className="text-[10px] text-foreground whitespace-nowrap">{m.name}</span>
                <span className="flex items-center gap-0.5 text-[9px] text-chart-3">
                  <Heart className="w-2 h-2" /> {m.likes}
                </span>
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Model list */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {loading ? (
          <CommunityCardSkeleton count={5} />
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 px-4">
            <Package className="w-6 h-6 text-muted-foreground mx-auto mb-2" />
            <p className="text-xs text-muted-foreground">No models match</p>
          </div>
        ) : (
          <div className="p-2 space-y-1.5">
            {filtered.map((model) => (
              <HFModelCard
                key={model.id}
                model={model}
                expanded={expandedId === model.id}
                onToggleExpand={() => setExpandedId(expandedId === model.id ? null : model.id)}
                onDownload={handleDownload}
                onTogglePin={togglePin}
                downloading={downloadingId === model.id}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// HF MODEL CARD
// ============================================================

interface HFModelCardProps {
  model: HFModel;
  expanded: boolean;
  onToggleExpand: () => void;
  onDownload: (model: HFModel) => void;
  onTogglePin: (id: string) => void;
  downloading: boolean;
}

function HFModelCard({ model, expanded, onToggleExpand, onDownload, onTogglePin, downloading }: HFModelCardProps) {
  const tc = typeColors[model.type] || { bg: "bg-secondary", text: "text-muted-foreground" };
  const vc = vramColors[model.vramFit];
  const lc = licenseStyles[model.licenseType] || licenseStyles.open;

  return (
    <div
      className={`bg-card border rounded-lg transition-all hover:border-[hsl(45,100%,55%)]/20 ${
        model.pinned ? "border-[hsl(45,100%,55%)]/20" : "border-border"
      }`}
    >
      {/* Collapsed view */}
      <div className="p-2.5 cursor-pointer" onClick={onToggleExpand}>
        <div className="flex items-start gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
              {model.pinned && <Pin className="w-2.5 h-2.5 text-[hsl(45,100%,55%)] shrink-0" />}
              <span className={`text-[9px] px-1 py-0 rounded ${tc.bg} ${tc.text}`}>
                {model.type === "text-encoder" ? "TXT-ENC" : model.type === "ip-adapter" ? "IP-A" : model.type.toUpperCase()}
              </span>
              <span className="text-xs text-foreground truncate" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                {model.name}
              </span>
              {model.trending && <TrendingUp className="w-2.5 h-2.5 text-chart-5 shrink-0" />}
            </div>
            <p className="text-[10px] text-muted-foreground line-clamp-1 mb-1">{model.description}</p>
            <div className="flex items-center gap-2 text-[10px]">
              <span className="flex items-center gap-0.5 text-muted-foreground">
                <HardDrive className="w-2.5 h-2.5" /> {model.fileSize}
              </span>
              <span className={`flex items-center gap-0.5 px-1 py-0 rounded ${vc.bg} ${vc.text}`}>
                <Cpu className="w-2 h-2" /> {vc.label}
              </span>
              <span className="px-1 py-0 rounded bg-secondary text-muted-foreground text-[9px]">
                {model.precision}
              </span>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
              <span className="flex items-center gap-0.5"><Heart className="w-2.5 h-2.5" /> {model.likes.toLocaleString()}</span>
              <span className="flex items-center gap-0.5"><Download className="w-2.5 h-2.5" /> {model.downloads}</span>
            </div>
            <span className="text-[9px] px-1 py-0 rounded bg-secondary text-muted-foreground uppercase">{model.architecture}</span>
            {(() => {
              const dt = formatDateTime(model.updatedAtISO, model.lastUpdated);
              return dt ? (
                <span className="flex items-center gap-0.5 text-[8px] text-muted-foreground/50" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                  <Clock className="w-2 h-2" /> {dt.date}{dt.time ? ` ${dt.time}` : ""}
                </span>
              ) : (
                <span className="flex items-center gap-0.5 text-[8px] text-muted-foreground/50">
                  <Clock className="w-2 h-2" /> {model.lastUpdated}
                </span>
              );
            })()}
            {expanded ? <ChevronDown className="w-3 h-3 text-muted-foreground" /> : <ChevronRight className="w-3 h-3 text-muted-foreground" />}
          </div>
        </div>
      </div>

      {/* Expanded section */}
      {expanded && (
        <div className="border-t border-border px-2.5 py-2 space-y-2 bg-secondary/20">
          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <span className="text-base">{"\uD83E\uDD17"}</span>
            <span style={{ fontFamily: "'JetBrains Mono', monospace" }}>{model.repoId}</span>
          </div>
          <div className="text-[10px] text-muted-foreground">
            by <span className="text-foreground">{model.author}</span>
            <span className="mx-2">&middot;</span>
            <Clock className="w-2.5 h-2.5 inline" /> {model.lastUpdated}
          </div>
          <div className="flex items-center gap-1 text-[10px]">
            <lc.icon className={`w-2.5 h-2.5 ${lc.text}`} />
            <span className={lc.text}>
              {model.licenseType === "open" ? "Open source" : model.licenseType === "gated" ? "Gated access" : "Commercial"}
            </span>
          </div>
          <div className="flex flex-wrap gap-1">
            {model.tags.map((t) => (
              <span key={t} className="px-1.5 py-0.5 bg-secondary rounded text-[9px] text-muted-foreground">{t}</span>
            ))}
          </div>
          <div className="space-y-1">
            <span className="text-[9px] text-muted-foreground/60 uppercase">Compatible with</span>
            <div className="flex flex-wrap gap-1">
              {model.compatibleWith.map((tool) => (
                <span key={tool} className="px-1.5 py-0.5 bg-primary/10 text-primary rounded text-[9px]">{tool}</span>
              ))}
            </div>
          </div>
          {model.downloadTarget && (
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <FolderOpen className="w-2.5 h-2.5 shrink-0" />
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "9px" }}>
                models/{model.downloadTarget}/
              </span>
            </div>
          )}
          <div className="flex items-center gap-1.5 pt-0.5">
            <button
              onClick={(e) => { e.stopPropagation(); onDownload(model); }}
              disabled={downloading}
              className="flex items-center gap-1 px-2 py-1 rounded-md bg-[hsl(45,100%,55%)]/15 text-[hsl(45,100%,55%)] text-[10px] hover:bg-[hsl(45,100%,55%)]/25 transition-colors disabled:opacity-50"
            >
              {downloading ? (<><Loader2 className="w-2.5 h-2.5 animate-spin" /> Downloading</>) : (<><Download className="w-2.5 h-2.5" /> Download</>)}
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onTogglePin(model.id); }}
              className={`p-1 rounded-md text-[10px] transition-colors ${
                model.pinned ? "text-[hsl(45,100%,55%)] bg-[hsl(45,100%,55%)]/10" : "text-muted-foreground hover:text-foreground hover:bg-secondary"
              }`}
              title={model.pinned ? "Unpin" : "Pin to top"}
            >
              {model.pinned ? <PinOff className="w-3 h-3" /> : <Pin className="w-3 h-3" />}
            </button>
            <a
              href={getHFModelUrl(model.repoId)}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors ml-auto"
              title="Open on HuggingFace"
            >
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
      )}
    </div>
  );
}