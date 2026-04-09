import { useState, useEffect, useCallback } from "react";
import {
  Github,
  Star,
  GitFork,
  Clock,
  ExternalLink,
  Search,
  TrendingUp,
  Download,
  RefreshCw,
  Eye,
  AlertCircle,
  CheckCircle2,
  ArrowUpRight,
  Package,
  Code,
  Plug,
  Zap,
  Radio,
  CircleDot,
  Loader2,
  FolderOpen,
  GitCommitHorizontal,
} from "lucide-react";

// --- Service layer ---
import type { GitHubRepo, RepoCategory } from "../services/githubService";
import {
  getDataSource,
  getTrackedRepos,
  checkAllUpdates,
  pullRepoUpdate,
  cloneRepo,
  getRepoUrl,
  getCategories,
} from "../services/githubService";
import { toast } from "sonner";
import { useDebouncedValue } from "../hooks/useDebouncedValue";

const iconMap: Record<string, typeof Code> = {
  Code, Package, Zap, Plug, TrendingUp, Eye,
};

const categories = getCategories();

export function GitHubPage() {
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 250);
  const [category, setCategory] = useState<RepoCategory>("all");
  const [showUpdatesOnly, setShowUpdatesOnly] = useState(false);
  const [repos, setRepos] = useState<GitHubRepo[]>([]);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [pullingId, setPullingId] = useState<string | null>(null);
  const [cloningId, setCloningId] = useState<string | null>(null);

  const dataSource = getDataSource();
  const isLive = dataSource !== "simulated";

  // --- Load repos via service ---
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

  const filtered = repos.filter((r) => {
    if (category !== "all" && r.category !== category) return false;
    if (debouncedSearch && !r.name.toLowerCase().includes(debouncedSearch.toLowerCase()) && !r.description.toLowerCase().includes(debouncedSearch.toLowerCase())) return false;
    if (showUpdatesOnly && !r.hasUpdate) return false;
    return true;
  });

  const trending = repos.filter((r) => r.trending);
  const withUpdates = repos.filter((r) => r.hasUpdate);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-foreground">GitHub Monitor</h1>
          <p className="text-sm text-muted-foreground mt-1">Track latest AI repos, custom nodes & updates</p>
        </div>
        <div className="flex items-center gap-3">
          {withUpdates.length > 0 && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-chart-4/10 border border-chart-4/20">
              <AlertCircle className="w-3.5 h-3.5 text-chart-4" />
              <span className="text-xs text-chart-4">{withUpdates.length} updates available</span>
            </div>
          )}
          <DataSourceBadge isLive={isLive} />
          <button
            onClick={handleCheckAll}
            disabled={checking}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {checking ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Checking...
              </>
            ) : (
              <>
                <RefreshCw className="w-3.5 h-3.5" /> Check Updates
              </>
            )}
          </button>
        </div>
      </div>

      {/* Trending Banner */}
      <div className="bg-gradient-to-r from-primary/10 to-chart-2/10 border border-primary/20 rounded-xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp className="w-4 h-4 text-primary" />
          <h3 className="text-sm text-foreground">Trending in AI</h3>
          <SourceTag source={isLive ? "github-api" : "simulated"} />
        </div>
        <div className="flex gap-3 overflow-x-auto pb-1">
          {trending.map((repo) => (
            <a
              key={repo.id}
              href={getRepoUrl(repo.fullName)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-shrink-0 px-3 py-2 bg-card/50 border border-border rounded-lg flex items-center gap-2 min-w-[200px] hover:border-primary/30 transition-colors"
            >
              <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: repo.languageColor }} />
              <span className="text-xs text-foreground truncate">{repo.fullName}</span>
              <span className="flex items-center gap-0.5 text-xs text-chart-4 ml-auto">
                <Star className="w-3 h-3" /> {repo.stars}
              </span>
            </a>
          ))}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search repositories..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-card border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
          />
        </div>
        <div className="flex gap-1 bg-card border border-border rounded-lg p-1 overflow-x-auto">
          {categories.map((c) => {
            const Icon = iconMap[c.icon] || Code;
            return (
              <button
                key={c.value}
                onClick={() => setCategory(c.value)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs whitespace-nowrap transition-colors ${
                  category === c.value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="w-3 h-3" />
                {c.label}
              </button>
            );
          })}
        </div>
        <button
          onClick={() => setShowUpdatesOnly(!showUpdatesOnly)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border transition-colors ${
            showUpdatesOnly ? "bg-chart-4/15 border-chart-4/30 text-chart-4" : "bg-card border-border text-muted-foreground"
          }`}
        >
          <AlertCircle className="w-3.5 h-3.5" /> Updates Only
        </button>
      </div>

      {/* Repos List */}
      <div className="space-y-3">
        {filtered.map((repo) => (
          <div
            key={repo.id}
            className={`bg-card border rounded-xl p-5 transition-all hover:border-primary/20 ${
              repo.hasUpdate ? "border-chart-4/20" : "border-border"
            }`}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <Github className="w-4 h-4 text-muted-foreground shrink-0" />
                  <a
                    href={getRepoUrl(repo.fullName)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-primary hover:underline"
                    style={{ fontFamily: "'JetBrains Mono', monospace" }}
                  >
                    {repo.fullName}
                  </a>
                  {repo.trending && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] bg-primary/15 text-primary flex items-center gap-1">
                      <TrendingUp className="w-2.5 h-2.5" /> Trending
                    </span>
                  )}
                  {repo.hasUpdate && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] bg-chart-4/15 text-chart-4 flex items-center gap-1">
                      <ArrowUpRight className="w-2.5 h-2.5" /> Update
                      {repo.commitsBehind ? ` (${repo.commitsBehind} commits)` : ""}
                    </span>
                  )}
                  {repo.installed && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] bg-chart-2/15 text-chart-2 flex items-center gap-1">
                      <CheckCircle2 className="w-2.5 h-2.5" /> Installed
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mb-2">{repo.description}</p>
                <div className="flex flex-wrap gap-1">
                  {repo.topics.map((t) => (
                    <span key={t} className="px-1.5 py-0.5 bg-secondary rounded text-[10px] text-muted-foreground">
                      {t}
                    </span>
                  ))}
                </div>
                {/* Local path (shown when available) */}
                {repo.localPath && (
                  <div className="flex items-center gap-1.5 mt-2 text-xs text-muted-foreground">
                    <FolderOpen className="w-3 h-3 shrink-0" />
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "10px" }}>
                      {repo.localPath}
                    </span>
                  </div>
                )}
              </div>

              <div className="flex flex-col items-end gap-2 shrink-0">
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: repo.languageColor }} />
                    {repo.language}
                  </span>
                  <span className="flex items-center gap-1">
                    <Star className="w-3 h-3" /> {repo.stars}
                  </span>
                  <span className="flex items-center gap-1">
                    <GitFork className="w-3 h-3" /> {repo.forks}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground flex items-center gap-1">
                  <Clock className="w-3 h-3" /> {repo.lastUpdate}
                </div>
                <div className="flex gap-1.5 mt-1">
                  {repo.hasUpdate && (
                    <button
                      onClick={() => handlePull(repo.id)}
                      disabled={pullingId === repo.id}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-chart-4/15 text-chart-4 text-[11px] hover:bg-chart-4/25 transition-colors disabled:opacity-50"
                    >
                      {pullingId === repo.id ? (
                        <>
                          <Loader2 className="w-3 h-3 animate-spin" /> Pulling
                        </>
                      ) : (
                        <>
                          <Download className="w-3 h-3" /> Pull Update
                        </>
                      )}
                    </button>
                  )}
                  {!repo.installed && (
                    <button
                      onClick={() => handleClone(repo.id, repo.fullName)}
                      disabled={cloningId === repo.id}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-primary/10 text-primary text-[11px] hover:bg-primary/20 transition-colors disabled:opacity-50"
                    >
                      {cloningId === repo.id ? (
                        <>
                          <Loader2 className="w-3 h-3 animate-spin" /> Cloning
                        </>
                      ) : (
                        <>
                          <Download className="w-3 h-3" /> Clone
                        </>
                      )}
                    </button>
                  )}
                  <a
                    href={getRepoUrl(repo.fullName)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1 rounded-md bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-16">
          <Github className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">No repositories match your search</p>
        </div>
      )}
    </div>
  );
}

// --- Shared sub-components ---

function DataSourceBadge({ isLive }: { isLive: boolean }) {
  return (
    <div
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs ${
        isLive
          ? "bg-chart-2/10 border-chart-2/20 text-chart-2"
          : "bg-chart-4/10 border-chart-4/20 text-chart-4"
      }`}
    >
      {isLive ? (
        <>
          <Radio className="w-3 h-3" />
          <span>Live — GitHub API</span>
        </>
      ) : (
        <>
          <CircleDot className="w-3 h-3" />
          <span>Simulated</span>
        </>
      )}
    </div>
  );
}

function SourceTag({ source }: { source: string }) {
  const config: Record<string, { label: string; cls: string }> = {
    simulated: { label: "Simulated", cls: "bg-chart-4/10 text-chart-4" },
    "github-api": { label: "GitHub API", cls: "bg-chart-2/10 text-chart-2" },
    "git-local": { label: "Local git", cls: "bg-primary/10 text-primary" },
  };
  const c = config[source] || config.simulated;
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded ${c.cls}`}>
      {c.label}
    </span>
  );
}