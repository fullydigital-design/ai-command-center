// ============================================================
// Community Hub — Shared components & utilities
// ============================================================
// Extracted from CommunityHubPage.tsx (Phase 5)

import { useState } from "react";
import {
  Radio,
  CircleDot,
  Shield,
  X,
  AlertCircle,
  RefreshCw,
  Info,
} from "lucide-react";
import type { FetchMeta } from "../../services/apiKeys";

// --- formatDateTime ---

export function formatDateTime(iso?: string, fallback?: string): { date: string; time: string } | null {
  if (!iso) {
    if (fallback && !fallback.includes("ago")) {
      return { date: fallback, time: "" };
    }
    return null;
  }
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return null;
    return {
      date: d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }),
      time: d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }),
    };
  } catch {
    return null;
  }
}

// --- Type color map (shared by HuggingFace + CivitAI) ---

export const typeColors: Record<string, { bg: string; text: string }> = {
  checkpoint: { bg: "bg-primary/15", text: "text-primary" },
  lora: { bg: "bg-chart-5/15", text: "text-chart-5" },
  vae: { bg: "bg-chart-4/15", text: "text-chart-4" },
  controlnet: { bg: "bg-chart-2/15", text: "text-chart-2" },
  "text-encoder": { bg: "bg-chart-3/15", text: "text-chart-3" },
  embedding: { bg: "bg-muted", text: "text-muted-foreground" },
  "textual-inversion": { bg: "bg-muted", text: "text-muted-foreground" },
  upscaler: { bg: "bg-chart-2/15", text: "text-chart-2" },
  "ip-adapter": { bg: "bg-chart-5/15", text: "text-chart-5" },
  workflows: { bg: "bg-primary/15", text: "text-primary" },
  poses: { bg: "bg-chart-4/15", text: "text-chart-4" },
  wildcards: { bg: "bg-chart-5/15", text: "text-chart-5" },
};

// --- SourceBadge ---

export function SourceBadge({ isLive, meta, onForceRefresh }: { isLive: boolean; meta?: FetchMeta | null; onForceRefresh?: () => void }) {
  const [showPanel, setShowPanel] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setShowPanel(!showPanel)}
        className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] cursor-pointer transition-colors ${
          isLive
            ? "bg-chart-2/10 text-chart-2 hover:bg-chart-2/20"
            : "bg-secondary text-muted-foreground hover:bg-secondary/80"
        }`}
      >
        {isLive ? (
          <><Radio className="w-2 h-2" /> Live</>
        ) : (
          <><CircleDot className="w-2 h-2" /> Mock</>
        )}
        <Info className="w-2 h-2 opacity-50" />
      </button>

      {showPanel && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setShowPanel(false)} />
          <div className="absolute right-0 top-full mt-1 z-50 w-56 bg-card border border-border rounded-lg shadow-lg p-2.5 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-foreground flex items-center gap-1">
                <Shield className="w-3 h-3" /> Data Provenance
              </span>
              <button onClick={() => setShowPanel(false)} className="text-muted-foreground hover:text-foreground">
                <X className="w-3 h-3" />
              </button>
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[9px]">
                <span className="text-muted-foreground">Source</span>
                <span className={isLive ? "text-chart-2" : "text-chart-4"}>
                  {meta?.source === "live-api" ? "Live API" : meta?.source === "cache" ? "Cached" : isLive ? "Connected" : "Mock Data"}
                </span>
              </div>
              {meta?.endpoint && (
                <div className="flex items-center justify-between text-[9px]">
                  <span className="text-muted-foreground">Endpoint</span>
                  <span className="text-foreground truncate ml-2" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "8px" }}>
                    {meta.endpoint}
                  </span>
                </div>
              )}
              {meta?.fetchedAt && (
                <div className="flex items-center justify-between text-[9px]">
                  <span className="text-muted-foreground">Fetched</span>
                  <span className="text-foreground">{new Date(meta.fetchedAt).toLocaleTimeString()}</span>
                </div>
              )}
              <div className="flex items-center justify-between text-[9px]">
                <span className="text-muted-foreground">Items</span>
                <span className="text-foreground">{meta?.itemCount ?? "\u2014"}</span>
              </div>
              {meta?.rateLimit && (
                <div className="flex items-center justify-between text-[9px]">
                  <span className="text-muted-foreground">Rate Limit</span>
                  <span className="text-foreground">{meta.rateLimit}</span>
                </div>
              )}
              {meta?.error && (
                <div className="text-[9px] text-chart-3 bg-chart-3/10 rounded p-1.5 flex items-start gap-1">
                  <AlertCircle className="w-3 h-3 shrink-0 mt-0.5" />
                  <span>{meta.error}</span>
                </div>
              )}
              {!isLive && !meta && (
                <div className="text-[9px] text-muted-foreground bg-secondary rounded p-1.5">
                  No API key set. Add one in Settings to see live data.
                </div>
              )}
            </div>
            {onForceRefresh && (
              <button
                onClick={() => { onForceRefresh(); setShowPanel(false); }}
                className="w-full flex items-center justify-center gap-1 px-2 py-1.5 rounded bg-primary/10 text-primary text-[10px] hover:bg-primary/20 transition-colors"
              >
                <RefreshCw className="w-3 h-3" /> Force Refresh (Clear Cache)
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
