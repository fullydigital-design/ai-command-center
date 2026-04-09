// ============================================================
// GitHubColumn — GitHub repos column for Community Hub
// ============================================================
// Extracted from CommunityHubPage.tsx (Phase 5)

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Github,
  Star,
  GitFork,
  Clock,
  ExternalLink,
  TrendingUp,
  Download,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  ArrowUpRight,
  Package,
  Code,
  Plug,
  Zap,
  Eye,
  Wrench,
  Loader2,
  Pin,
  PinOff,
  Tag,
  MessageSquare,
  ChevronDown,
  ChevronRight,
} from "lucide-react";

import type { GitHubRepo, RepoCategory } from "../../services/githubService";
import {
  getDataSource,
  getTrackedRepos,
  checkAllUpdates,
  pullRepoUpdate,
  cloneRepo,
  getRepoUrl,
  getCategories,
  getGitHubFetchMeta,
  clearGitHubCache,
} from "../../services/githubService";

import { SourceBadge, formatDateTime } from "./shared";
import { CommunityCardSkeleton } from "../skeletons";

// Icon map for category chips
const iconMap: Record<string, typeof Code> = {
  Code, Package, Zap, Plug, TrendingUp, Eye, Wrench,
};

const categories = getCategories();

// ============================================================
// GITHUB COLUMN
// ============================================================

export function GitHubColumn({ search }: { search: string }) {
  const [category, setCategory] = useState<RepoCategory>("all");
  const [showUpdatesOnly, setShowUpdatesOnly] = useState(false);
  const [repos, setRepos] = useState<GitHubRepo[]>([]);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [pullingId, setPullingId] = useState<string | null>(null);
  const [cloningId, setCloningId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const dataSource = getDataSource();
  const isLive = dataSource !== "simulated";

  const loadRepos = useCallback(async () => {
    setLoading(true);
    const data = await getTrackedRepos();
    setRepos(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadRepos();
  }, [loadRepos]);

  // --- Actions ---
  const handleCheckAll = async () => {
    setChecking(true);
    const updated = await checkAllUpdates(repos);
    setRepos(updated);
    setChecking(false);
  };

  const handlePull = async (id: string) => {
    setPullingId(id);
    const success = await pullRepoUpdate(id);
    if (success) {
      setRepos((prev) =>
        prev.map((r) => (r.id === id ? { ...r, hasUpdate: false, commitsBehind: 0 } : r))
      );
    }
    setPullingId(null);
  };

  const handleClone = async (id: string, fullName: string) => {
    setCloningId(id);
    const success = await cloneRepo(id, fullName);
    if (success) {
      setRepos((prev) =>
        prev.map((r) => (r.id === id ? { ...r, installed: true } : r))
      );
    }
    setCloningId(null);
  };

  const togglePin = (id: string) => {
    setRepos((prev) =>
      prev.map((r) => (r.id === id ? { ...r, pinned: !r.pinned } : r))
    );
  };

  // --- Filtering & sorting ---
  const filtered = useMemo(() => {
    let result = repos.filter((r) => {
      if (category !== "all" && r.category !== category) return false;
      if (search && !r.name.toLowerCase().includes(search.toLowerCase()) && !r.description.toLowerCase().includes(search.toLowerCase())) return false;
      if (showUpdatesOnly && !r.hasUpdate) return false;
      return true;
    });
    result.sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      if (a.hasUpdate !== b.hasUpdate) return a.hasUpdate ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    return result;
  }, [repos, category, search, showUpdatesOnly]);

  const withUpdates = repos.filter((r) => r.hasUpdate);
  const pinnedCount = repos.filter((r) => r.pinned).length;
  const installedCount = repos.filter((r) => r.installed).length;

  return (
    <div className="flex flex-col h-full border-r border-border overflow-hidden">
      {/* Column Header */}
      <div className="p-3 border-b border-border bg-card/50 shrink-0">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Github className="w-4 h-4 text-foreground" />
            <span className="text-sm text-foreground">GitHub</span>
            <span className="text-[10px] px-1.5 py-0.5 bg-secondary rounded text-muted-foreground">
              {repos.length}
            </span>
            {withUpdates.length > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 bg-chart-4/15 text-chart-4 rounded flex items-center gap-0.5">
                <ArrowUpRight className="w-2.5 h-2.5" />
                {withUpdates.length}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            <SourceBadge isLive={isLive} meta={getGitHubFetchMeta()} onForceRefresh={() => { clearGitHubCache(); loadRepos(); }} />
            <button
              onClick={handleCheckAll}
              disabled={checking}
              className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors disabled:opacity-50"
              title="Check for updates"
            >
              {checking ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <RefreshCw className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
        </div>

        {/* Stats bar */}
        <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <CheckCircle2 className="w-2.5 h-2.5 text-chart-2" /> {installedCount} installed
          </span>
          <span className="flex items-center gap-1">
            <Pin className="w-2.5 h-2.5 text-primary" /> {pinnedCount} pinned
          </span>
          <button
            onClick={() => setShowUpdatesOnly(!showUpdatesOnly)}
            className={`flex items-center gap-1 px-1.5 py-0.5 rounded transition-colors ml-auto ${
              showUpdatesOnly ? "bg-chart-4/15 text-chart-4" : "hover:text-foreground"
            }`}
          >
            <AlertCircle className="w-2.5 h-2.5" /> Updates only
          </button>
        </div>

        {/* Category filters */}
        <div className="flex gap-1 mt-2 overflow-x-auto pb-0.5">
          {categories.map((c) => {
            const Icon = iconMap[c.icon] || Code;
            return (
              <button
                key={c.value}
                onClick={() => setCategory(c.value)}
                className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] whitespace-nowrap transition-colors ${
                  category === c.value
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary/50 text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="w-2.5 h-2.5" />
                {c.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Trending ticker */}
      {category === "all" && !showUpdatesOnly && (
        <TrendingTicker repos={repos} />
      )}

      {/* Repo list */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {loading ? (
          <CommunityCardSkeleton count={6} />
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 px-4">
            <Github className="w-6 h-6 text-muted-foreground mx-auto mb-2" />
            <p className="text-xs text-muted-foreground">No repos match</p>
          </div>
        ) : (
          <div className="p-2 space-y-1.5">
            {filtered.map((repo) => (
              <RepoCard
                key={repo.id}
                repo={repo}
                expanded={expandedId === repo.id}
                onToggleExpand={() => setExpandedId(expandedId === repo.id ? null : repo.id)}
                onPull={handlePull}
                onClone={handleClone}
                onTogglePin={togglePin}
                pulling={pullingId === repo.id}
                cloning={cloningId === repo.id}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// REPO CARD
// ============================================================

interface RepoCardProps {
  repo: GitHubRepo;
  expanded: boolean;
  onToggleExpand: () => void;
  onPull: (id: string) => void;
  onClone: (id: string, fullName: string) => void;
  onTogglePin: (id: string) => void;
  pulling: boolean;
  cloning: boolean;
}

function RepoCard({ repo, expanded, onToggleExpand, onPull, onClone, onTogglePin, pulling, cloning }: RepoCardProps) {
  return (
    <div
      className={`bg-card border rounded-lg transition-all hover:border-primary/20 ${
        repo.hasUpdate ? "border-chart-4/25" : repo.pinned ? "border-primary/20" : "border-border"
      }`}
    >
      {/* Main row */}
      <div className="p-2.5 cursor-pointer" onClick={onToggleExpand}>
        <div className="flex items-start gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
              {repo.pinned && <Pin className="w-2.5 h-2.5 text-primary shrink-0" />}
              <span className="text-xs text-foreground truncate" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                {repo.name}
              </span>
              {repo.releaseTag && (
                <span className="flex items-center gap-0.5 px-1 py-0 rounded text-[9px] bg-primary/10 text-primary">
                  <Tag className="w-2 h-2" />
                  {repo.releaseTag}
                </span>
              )}
              {repo.hasUpdate && (
                <span className="flex items-center gap-0.5 px-1 py-0 rounded text-[9px] bg-chart-4/15 text-chart-4">
                  <ArrowUpRight className="w-2 h-2" />
                  {repo.commitsBehind ? `${repo.commitsBehind}` : "new"}
                </span>
              )}
              {repo.trending && (
                <TrendingUp className="w-2.5 h-2.5 text-chart-5 shrink-0" />
              )}
            </div>
            <p className="text-[10px] text-muted-foreground line-clamp-1 mb-1">{repo.description}</p>
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground/70">
              <MessageSquare className="w-2.5 h-2.5 shrink-0" />
              <span className="truncate">{repo.lastCommitMsg}</span>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
              <span className="flex items-center gap-0.5">
                <Star className="w-2.5 h-2.5" /> {repo.stars}
              </span>
              <span className="flex items-center gap-0.5">
                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: repo.languageColor }} />
                {repo.language}
              </span>
            </div>
            <div className="flex flex-col items-end gap-0.5">
              <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <Clock className="w-2.5 h-2.5" />
                {repo.lastUpdate}
              </div>
              {(() => {
                const dt = formatDateTime(repo.updatedAtISO);
                return dt ? (
                  <span className="text-[8px] text-muted-foreground/50" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                    {dt.date}{dt.time ? ` ${dt.time}` : ""}
                  </span>
                ) : null;
              })()}
            </div>
            {expanded ? (
              <ChevronDown className="w-3 h-3 text-muted-foreground" />
            ) : (
              <ChevronRight className="w-3 h-3 text-muted-foreground" />
            )}
          </div>
        </div>
      </div>

      {/* Expanded section */}
      {expanded && (
        <div className="border-t border-border px-2.5 py-2 space-y-2 bg-secondary/20">
          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <Github className="w-3 h-3 shrink-0" />
            <span style={{ fontFamily: "'JetBrains Mono', monospace" }}>{repo.fullName}</span>
          </div>
          <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-0.5"><Star className="w-2.5 h-2.5" /> {repo.stars}</span>
            <span className="flex items-center gap-0.5"><GitFork className="w-2.5 h-2.5" /> {repo.forks}</span>
            <span className="flex items-center gap-0.5"><AlertCircle className="w-2.5 h-2.5" /> {repo.openIssues} issues</span>
          </div>
          <div className="flex flex-wrap gap-1">
            {repo.topics.map((t) => (
              <span key={t} className="px-1.5 py-0.5 bg-secondary rounded text-[9px] text-muted-foreground">{t}</span>
            ))}
          </div>
          {repo.installed && (
            <div className="flex items-center gap-1 text-[10px]">
              <CheckCircle2 className="w-2.5 h-2.5 text-chart-2 shrink-0" />
              <span className="text-chart-2">Installed</span>
              {repo.localPath && (
                <span className="text-muted-foreground/60 truncate ml-1" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "9px" }}>
                  {repo.localPath}
                </span>
              )}
            </div>
          )}
          <div className="flex items-center gap-1.5 pt-0.5">
            {repo.hasUpdate && (
              <button
                onClick={(e) => { e.stopPropagation(); onPull(repo.id); }}
                disabled={pulling}
                className="flex items-center gap-1 px-2 py-1 rounded-md bg-chart-4/15 text-chart-4 text-[10px] hover:bg-chart-4/25 transition-colors disabled:opacity-50"
              >
                {pulling ? (<><Loader2 className="w-2.5 h-2.5 animate-spin" /> Pulling</>) : (<><Download className="w-2.5 h-2.5" /> Pull Update</>)}
              </button>
            )}
            {!repo.installed && (
              <button
                onClick={(e) => { e.stopPropagation(); onClone(repo.id, repo.fullName); }}
                disabled={cloning}
                className="flex items-center gap-1 px-2 py-1 rounded-md bg-primary/10 text-primary text-[10px] hover:bg-primary/20 transition-colors disabled:opacity-50"
              >
                {cloning ? (<><Loader2 className="w-2.5 h-2.5 animate-spin" /> Cloning</>) : (<><Download className="w-2.5 h-2.5" /> Clone</>)}
              </button>
            )}
            <button
              onClick={(e) => { e.stopPropagation(); onTogglePin(repo.id); }}
              className={`p-1 rounded-md text-[10px] transition-colors ${
                repo.pinned ? "text-primary bg-primary/10" : "text-muted-foreground hover:text-foreground hover:bg-secondary"
              }`}
              title={repo.pinned ? "Unpin" : "Pin to top"}
            >
              {repo.pinned ? <PinOff className="w-3 h-3" /> : <Pin className="w-3 h-3" />}
            </button>
            <a
              href={getRepoUrl(repo.fullName)}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors ml-auto"
              title="Open on GitHub"
            >
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// TRENDING TICKER
// ============================================================

function TrendingTicker({ repos }: { repos: GitHubRepo[] }) {
  const trending = repos.filter((r) => r.trending);
  if (trending.length === 0) return null;

  return (
    <div className="px-3 py-2 border-b border-border bg-gradient-to-r from-primary/5 to-chart-2/5 shrink-0">
      <div className="flex items-center gap-1.5 mb-1.5">
        <TrendingUp className="w-3 h-3 text-primary" />
        <span className="text-[10px] text-primary">Trending</span>
      </div>
      <div className="flex gap-1.5 overflow-x-auto pb-0.5">
        {trending.map((repo) => (
          <a
            key={repo.id}
            href={getRepoUrl(repo.fullName)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-shrink-0 px-2 py-1 bg-card/60 border border-border rounded flex items-center gap-1.5 hover:border-primary/30 transition-colors"
          >
            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: repo.languageColor }} />
            <span className="text-[10px] text-foreground whitespace-nowrap">{repo.name}</span>
            <span className="flex items-center gap-0.5 text-[9px] text-chart-4">
              <Star className="w-2 h-2" /> {repo.stars}
            </span>
          </a>
        ))}
      </div>
    </div>
  );
}