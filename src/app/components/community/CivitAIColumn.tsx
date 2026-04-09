// ============================================================
// CivitAIColumn — CivitAI models column for Community Hub
// ============================================================
// Extracted from CommunityHubPage.tsx (Phase 5)

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Clock,
  ExternalLink,
  Download,
  RefreshCw,
  Package,
  Zap,
  Loader2,
  FolderOpen,
  Pin,
  PinOff,
  Tag,
  ChevronDown,
  ChevronRight,
  Heart,
  HardDrive,
  Flame,
  Hash,
} from "lucide-react";

import type { CivitModel, CivitBaseModel, CivitModelType } from "../../services/civitaiService";
import {
  getCivitDataSource,
  getCivitModels,
  downloadCivitModel,
  getCivitModelUrl,
  getCivitBaseModels,
  getCivitTypes,
  getCivitFetchMeta,
  clearCivitCache,
} from "../../services/civitaiService";

import { SourceBadge, formatDateTime, typeColors } from "./shared";
import { CommunityCardSkeleton } from "../skeletons";

const civitBaseModels = getCivitBaseModels();
const civitTypes = getCivitTypes();

export function CivitAIColumn({ search }: { search: string }) {
  const [baseModel, setBaseModel] = useState<CivitBaseModel>("all");
  const [type, setType] = useState<CivitModelType | "all">("all");
  const [models, setModels] = useState<CivitModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const isLive = getCivitDataSource() !== "simulated";

  const loadModels = useCallback(async () => {
    setLoading(true);
    const data = await getCivitModels();
    setModels(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadModels();
  }, [loadModels]);

  const handleDownload = async (model: CivitModel) => {
    setDownloadingId(model.id);
    await downloadCivitModel(model.id);
    setDownloadingId(null);
  };

  const togglePin = (id: string) => {
    setModels((prev) =>
      prev.map((m) => (m.id === id ? { ...m, pinned: !m.pinned } : m))
    );
  };

  const filtered = useMemo(() => {
    let result = models.filter((m) => {
      if (baseModel !== "all" && m.baseModel !== baseModel) return false;
      if (type !== "all" && m.type !== type) return false;
      if (search && !m.name.toLowerCase().includes(search.toLowerCase()) && !m.description.toLowerCase().includes(search.toLowerCase()) && !m.creator.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
    result.sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      if (a.trending !== b.trending) return a.trending ? -1 : 1;
      return b.buzzScore - a.buzzScore;
    });
    return result;
  }, [models, baseModel, type, search]);

  const trendingModels = models.filter((m) => m.trending);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Column Header */}
      <div className="p-3 border-b border-border bg-card/50 shrink-0">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="text-base">{"\uD83C\uDFA8"}</span>
            <span className="text-sm text-foreground">CivitAI</span>
            <span className="text-[10px] px-1.5 py-0.5 bg-secondary rounded text-muted-foreground">
              {models.length}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <SourceBadge isLive={isLive} meta={getCivitFetchMeta()} onForceRefresh={() => { clearCivitCache(); loadModels(); }} />
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
            <Flame className="w-2.5 h-2.5 text-chart-3" /> Buzz
          </span>
        </div>

        {/* Base Model filter */}
        <div className="flex gap-1 overflow-x-auto pb-0.5">
          {civitBaseModels.map((a) => (
            <button
              key={a.value}
              onClick={() => setBaseModel(a.value)}
              className={`px-2 py-1 rounded text-[10px] whitespace-nowrap transition-colors ${
                baseModel === a.value
                  ? "bg-[hsl(210,100%,60%)] text-white"
                  : "bg-secondary/50 text-muted-foreground hover:text-foreground"
              }`}
            >
              {a.label}
            </button>
          ))}
        </div>

        {/* Type filter */}
        <div className="flex gap-1 mt-1 overflow-x-auto pb-0.5">
          {civitTypes.slice(0, 6).map((t) => (
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
      {baseModel === "all" && type === "all" && trendingModels.length > 0 && (
        <div className="px-3 py-2 border-b border-border bg-gradient-to-r from-[hsl(210,100%,60%)]/5 to-chart-5/5 shrink-0">
          <div className="flex items-center gap-1.5 mb-1.5">
            <Flame className="w-3 h-3 text-[hsl(210,100%,60%)]" />
            <span className="text-[10px] text-[hsl(210,100%,60%)]">Trending</span>
          </div>
          <div className="flex gap-1.5 overflow-x-auto pb-0.5">
            {trendingModels.map((m) => (
              <a
                key={m.id}
                href={getCivitModelUrl(m.id)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-shrink-0 px-2 py-1 bg-card/60 border border-border rounded flex items-center gap-1.5 hover:border-[hsl(210,100%,60%)]/30 transition-colors"
              >
                <span
                  className="w-4 h-4 rounded shrink-0"
                  style={{ backgroundColor: m.previewColor }}
                />
                <span className="text-[10px] text-foreground whitespace-nowrap">{m.name}</span>
                <span className="text-[9px] text-chart-4">{"\u2605"}{m.rating}</span>
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
              <CivitModelCard
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
// CIVIT MODEL CARD
// ============================================================

interface CivitModelCardProps {
  model: CivitModel;
  expanded: boolean;
  onToggleExpand: () => void;
  onDownload: (model: CivitModel) => void;
  onTogglePin: (id: string) => void;
  downloading: boolean;
}

function CivitModelCard({ model, expanded, onToggleExpand, onDownload, onTogglePin, downloading }: CivitModelCardProps) {
  const tc = typeColors[model.type] || { bg: "bg-secondary", text: "text-muted-foreground" };

  return (
    <div
      className={`bg-card border rounded-lg transition-all hover:border-[hsl(210,100%,60%)]/20 ${
        model.pinned ? "border-[hsl(210,100%,60%)]/20" : "border-border"
      }`}
    >
      {/* Collapsed view */}
      <div className="p-2.5 cursor-pointer" onClick={onToggleExpand}>
        <div className="flex items-start gap-2">
          <div
            className="w-8 h-8 rounded shrink-0 mt-0.5"
            style={{ backgroundColor: model.previewColor }}
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
              {model.pinned && <Pin className="w-2.5 h-2.5 text-[hsl(210,100%,60%)] shrink-0" />}
              <span className={`text-[9px] px-1 py-0 rounded ${tc.bg} ${tc.text}`}>
                {model.type === "textual-inversion" ? "EMBED" : model.type === "workflows" ? "WKFL" : model.type.toUpperCase()}
              </span>
              <span className="text-xs text-foreground truncate" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                {model.name}
              </span>
              {model.trending && <Flame className="w-2.5 h-2.5 text-chart-3 shrink-0" />}
            </div>
            <p className="text-[10px] text-muted-foreground line-clamp-1 mb-1">{model.description}</p>
            <div className="flex items-center gap-2 text-[10px]">
              <span className="text-chart-4">
                {"\u2605".repeat(Math.floor(model.rating))}
                <span className="text-muted-foreground/40">{"\u2606".repeat(5 - Math.floor(model.rating))}</span>
              </span>
              <span className="text-[9px] text-muted-foreground">({model.ratingCount})</span>
              <span className="flex items-center gap-0.5 text-muted-foreground">
                <HardDrive className="w-2.5 h-2.5" /> {model.fileSize}
              </span>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
              <span className="flex items-center gap-0.5"><Heart className="w-2.5 h-2.5" /> {model.favoriteCount.toLocaleString()}</span>
              <span className="flex items-center gap-0.5"><Download className="w-2.5 h-2.5" /> {model.downloadCount}</span>
            </div>
            <span className="text-[9px] px-1 py-0 rounded bg-secondary text-muted-foreground uppercase">{model.baseModel}</span>
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
          <div className="flex items-center justify-between text-[10px] text-muted-foreground">
            <div>
              by <span className="text-foreground">{model.creator}</span>
              <span className="mx-2">&middot;</span>
              <Tag className="w-2.5 h-2.5 inline" /> {model.version}
            </div>
            <div className="flex items-center gap-1">
              <Clock className="w-2.5 h-2.5" /> {model.lastUpdated}
            </div>
          </div>
          <div className="flex items-center gap-1.5 text-[10px]">
            <Flame className="w-3 h-3 text-chart-3" />
            <span className="text-chart-3">{model.buzzScore.toLocaleString()} buzz</span>
            <span className="mx-1 text-muted-foreground/30">|</span>
            <span className="text-chart-4">{"\u2605"} {model.rating.toFixed(1)}</span>
            <span className="text-muted-foreground/60">({model.ratingCount.toLocaleString()} ratings)</span>
          </div>
          {model.triggerWords.length > 0 && (
            <div className="space-y-1">
              <span className="text-[9px] text-muted-foreground/60 uppercase flex items-center gap-1">
                <Hash className="w-2.5 h-2.5" /> Trigger Words
              </span>
              <div className="flex flex-wrap gap-1">
                {model.triggerWords.map((tw) => (
                  <span key={tw} className="px-1.5 py-0.5 bg-chart-5/10 text-chart-5 rounded text-[9px] border border-chart-5/20" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                    {tw}
                  </span>
                ))}
              </div>
            </div>
          )}
          <div className="flex flex-wrap gap-1">
            {model.tags.map((t) => (
              <span key={t} className="px-1.5 py-0.5 bg-secondary rounded text-[9px] text-muted-foreground">{t}</span>
            ))}
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
              className="flex items-center gap-1 px-2 py-1 rounded-md bg-[hsl(210,100%,60%)]/15 text-[hsl(210,100%,60%)] text-[10px] hover:bg-[hsl(210,100%,60%)]/25 transition-colors disabled:opacity-50"
            >
              {downloading ? (<><Loader2 className="w-2.5 h-2.5 animate-spin" /> Downloading</>) : (<><Download className="w-2.5 h-2.5" /> Download</>)}
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onTogglePin(model.id); }}
              className={`p-1 rounded-md text-[10px] transition-colors ${
                model.pinned ? "text-[hsl(210,100%,60%)] bg-[hsl(210,100%,60%)]/10" : "text-muted-foreground hover:text-foreground hover:bg-secondary"
              }`}
              title={model.pinned ? "Unpin" : "Pin to top"}
            >
              {model.pinned ? <PinOff className="w-3 h-3" /> : <Pin className="w-3 h-3" />}
            </button>
            <a
              href={getCivitModelUrl(model.id)}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors ml-auto"
              title="Open on CivitAI"
            >
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
      )}
    </div>
  );
}