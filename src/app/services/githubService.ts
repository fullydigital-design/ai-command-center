// ============================================================
// GitHub Service — Abstraction layer for GitHub Monitor
// ============================================================
//
// RIGHT NOW:  Simulated data for UI prototype.
// MIGRATION:  Swap to FastAPI calls that use the saved GitHub token.
//
// FastAPI endpoints this maps to:
//   GET    /api/github/repos              → getTrackedRepos()
//   POST   /api/github/repos              → addTrackedRepo()
//   DELETE /api/github/repos/:id          → removeTrackedRepo()
//   GET    /api/github/repos/:id/updates  → checkRepoUpdate()
//   POST   /api/github/repos/check-all    → checkAllUpdates()
//   POST   /api/github/repos/:id/pull     → pullRepoUpdate()
//   POST   /api/github/repos/:id/clone    → cloneRepo()
//   GET    /api/github/trending           → getTrendingRepos()
//
// ─────────────────────────────────────────────────────────
// PYTHON BACKEND IMPLEMENTATION GUIDE
// ─────────────────────────────────────────────────────────
//
// Required pip packages:
//   pip install PyGithub gitpython requests
//
// 1. GITHUB API (PyGithub)
//    from github import Github
//    g = Github(settings.api_keys["github"])
//
//    # Get repo info:
//    repo = g.get_repo("comfyanonymous/ComfyUI")
//    repo.stargazers_count, repo.forks_count, repo.updated_at
//
//    # Check for updates (compare local HEAD with remote):
//    import git
//    local_repo = git.Repo("C:/_AI/_test_fresh_all_AI/ComfyUI")
//    local_sha = local_repo.head.commit.hexsha
//    remote_sha = repo.get_branch("master").commit.sha
//    has_update = local_sha != remote_sha
//
//    # Get recent commits:
//    commits = repo.get_commits(since=datetime.utcnow() - timedelta(days=7))
//
// 2. GIT OPERATIONS (gitpython)
//    import git
//    # Clone:
//    git.Repo.clone_from(url, local_path)
//    # Pull:
//    repo = git.Repo(local_path)
//    repo.remotes.origin.pull()
//
// 3. UPDATE DETECTION STRATEGY
//    For each tracked repo:
//    a. Check if local directory exists (from Settings paths)
//    b. If exists, compare local HEAD sha with GitHub latest sha
//    c. If different → hasUpdate = true
//    d. Store last check time in config.json
//
// 4. RATE LIMITING
//    - With token: 5,000 requests/hour
//    - Without token: 60 requests/hour
//    - Cache results, only re-check every 15 minutes
//    - Use conditional requests (If-Modified-Since header)
//
// ============================================================

import type { DataSource } from "./types";
import { getApiKey, hasApiKey } from "./apiKeys";
import type { FetchMeta } from "./apiKeys";

// --- Environment detection (single source of truth: env.ts) ---
import { isTauriEnv, shouldTryBackend, getApiBase } from "./env";
import { fetchExternalAPI, fetchBackend } from "./fetchWithRetry";
import { createService } from "./createService";
import { mockRepos } from "./mocks/github.mock";

// --- Live API cache ---
let liveCache: { data: GitHubRepo[]; ts: number } | null = null;
const CACHE_TTL = 15 * 60 * 1000; // 15 minutes
let lastFetchMeta: FetchMeta | null = null;

/** Get metadata about the last fetch for validation display. */
export function getGitHubFetchMeta(): FetchMeta | null {
  return lastFetchMeta;
}

/** Clear cache to force a fresh API call. */
export function clearGitHubCache(): void {
  liveCache = null;
  lastFetchMeta = null;
}

/**
 * Fetch real repos from GitHub API using stored token.
 * Maps GitHub API response → GitHubRepo interface.
 */
async function fetchLiveGitHubRepos(): Promise<GitHubRepo[] | null> {
  const token = getApiKey("github");

  // Check cache
  if (liveCache && Date.now() - liveCache.ts < CACHE_TTL) {
    lastFetchMeta = {
      source: "cache",
      fetchedAt: new Date(liveCache.ts).toISOString(),
      itemCount: liveCache.data.length,
      endpoint: "api.github.com (cached)",
    };
    return liveCache.data;
  }

  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  try {
    // Build searches — include starred repos only if authenticated
    const searches: Promise<Response>[] = [];

    if (token) {
      // User's own starred repos (requires auth)
      searches.push(
        fetchExternalAPI("https://api.github.com/user/starred?per_page=30&sort=updated", { headers })
      );
    }

    // Public searches — work with or without token
    searches.push(
      // Diffusion / image generation repos
      fetchExternalAPI("https://api.github.com/search/repositories?q=topic:stable-diffusion+stars:>500&sort=updated&per_page=15", { headers }),
      // ComfyUI ecosystem
      fetchExternalAPI("https://api.github.com/search/repositories?q=comfyui+in:name,description+stars:>200&sort=updated&per_page=15", { headers }),
      // Video generation (Wan, HunyuanVideo, FramePack, etc.)
      fetchExternalAPI("https://api.github.com/search/repositories?q=topic:video-generation+OR+topic:text-to-video+stars:>500&sort=stars&per_page=10", { headers }),
      // Training / LoRA / fine-tuning
      fetchExternalAPI("https://api.github.com/search/repositories?q=topic:lora+topic:training+stars:>300&sort=updated&per_page=10", { headers }),
    );

    const results = await Promise.allSettled(searches);

    const repos: GitHubRepo[] = [];
    const seen = new Set<string>();

    // Extract rate limit from first successful response
    let rateLimit = "";
    let rateLimitReset = "";

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      if (result.status !== "fulfilled" || !result.value.ok) {
        if (result.status === "fulfilled") {
          console.warn(`[GitHub] Search ${i} failed: HTTP ${result.value.status}`);
        }
        continue;
      }

      const res = result.value;

      // Grab rate limit from headers
      if (!rateLimit) {
        const remaining = res.headers.get("x-ratelimit-remaining");
        const limit = res.headers.get("x-ratelimit-limit");
        const reset = res.headers.get("x-ratelimit-reset");
        if (remaining && limit) rateLimit = `${remaining}/${limit}`;
        if (reset) rateLimitReset = new Date(parseInt(reset) * 1000).toISOString();
      }

      const data = await res.json();
      // Starred endpoint returns array directly; search endpoint returns { items: [...] }
      const items: any[] = Array.isArray(data) ? data : (data.items || []);
      const isStarred = token ? i === 0 : false;

      for (const r of items) {
        const key = r.full_name;
        if (!key || seen.has(key)) continue;
        seen.add(key);
        repos.push(mapGitHubApiRepo(r, isStarred, !isStarred));
      }
    }

    if (repos.length === 0) {
      lastFetchMeta = {
        source: "live-api",
        fetchedAt: new Date().toISOString(),
        itemCount: 0,
        endpoint: "api.github.com",
        rateLimit,
        rateLimitReset,
        error: token
          ? "No repos returned — check token permissions (needs 'public_repo' or 'repo' scope + read access to starred repos)"
          : "No repos returned — unauthenticated rate limit may be exhausted (60 req/hr). Add a GitHub token in Settings for 5,000 req/hr.",
      };
      return null;
    }

    liveCache = { data: repos, ts: Date.now() };
    lastFetchMeta = {
      source: "live-api",
      fetchedAt: new Date().toISOString(),
      itemCount: repos.length,
      endpoint: "api.github.com",
      rateLimit,
      rateLimitReset,
    };
    return repos;
  } catch (e) {
    console.warn("[GitHubService] Live API failed:", e);
    lastFetchMeta = {
      source: "live-api",
      fetchedAt: new Date().toISOString(),
      itemCount: 0,
      endpoint: "api.github.com",
      error: String(e),
    };
    return null;
  }
}

const LANG_COLORS: Record<string, string> = {
  Python: "#3572A5", TypeScript: "#3178C6", JavaScript: "#F1E05A",
  Rust: "#DEA584", "C++": "#F34B7D", C: "#555555", Go: "#00ADD8",
  Java: "#B07219", Jupyter: "#DA5B0B", Shell: "#89E051", Cuda: "#3A4E3A",
  "Jupyter Notebook": "#DA5B0B", HTML: "#E34C26", CSS: "#563D7C",
};

const AI_CATEGORIES: Record<string, string> = {
  "comfyui": "custom-nodes", "stable-diffusion": "models", "diffusion": "models",
  "lora": "training", "training": "training", "fine-tuning": "training",
  "video-generation": "video", "text-to-video": "video",
  "machine-learning": "tools", "deep-learning": "tools", "ai": "tools",
};

function categorizeRepo(topics: string[], name: string): string {
  for (const t of topics) {
    if (AI_CATEGORIES[t]) return AI_CATEGORIES[t];
  }
  const lower = name.toLowerCase();
  if (lower.includes("comfy")) return "custom-nodes";
  if (lower.includes("train") || lower.includes("lora") || lower.includes("kohya")) return "training";
  if (lower.includes("video") || lower.includes("wan") || lower.includes("hunyuan")) return "video";
  return "tools";
}

function formatStars(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

function mapGitHubApiRepo(r: any, installed: boolean, trending: boolean): GitHubRepo {
  const topics: string[] = r.topics || [];
  return {
    id: String(r.id),
    name: r.name,
    fullName: r.full_name,
    description: r.description || "No description",
    stars: formatStars(r.stargazers_count),
    forks: formatStars(r.forks_count),
    openIssues: r.open_issues_count,
    language: r.language || "Unknown",
    languageColor: LANG_COLORS[r.language] || "#888888",
    lastUpdate: timeAgo(r.updated_at || r.pushed_at),
    lastCommitMsg: `Latest push: ${timeAgo(r.pushed_at || r.updated_at)}`,
    releaseTag: "",
    category: categorizeRepo(topics, r.name),
    trending,
    installed,
    hasUpdate: false,
    pinned: false,
    topics: topics.slice(0, 6),
    commitsBehind: 0,
    updatedAtISO: r.updated_at || r.pushed_at,
  };
}

// --- Types ---

export type RepoCategory = "all" | "core-stack" | "custom-nodes" | "training" | "video" | "models" | "tools";

export interface GitHubRepo {
  id: string;
  name: string;
  fullName: string;
  description: string;
  stars: string;
  forks: string;
  openIssues: number;
  language: string;
  languageColor: string;
  lastUpdate: string;
  lastCommitMsg: string;
  releaseTag: string;
  category: string;
  trending: boolean;
  installed: boolean;
  hasUpdate: boolean;
  pinned: boolean;
  topics: string[];
  updatedAtISO?: string;     // ISO timestamp for exact date/time display
  // Backend-only fields (populated when connected to FastAPI)
  localPath?: string;        // Where it's cloned on disk
  localSha?: string;         // Local HEAD commit sha
  remoteSha?: string;        // Latest remote commit sha
  lastCheckedAt?: string;    // ISO timestamp of last update check
  commitsBehind?: number;    // How many commits behind remote
}

export interface CategoryDef {
  value: RepoCategory;
  label: string;
  icon: string; // lucide icon name
}

// ============================================================
// PUBLIC API
// ============================================================

export function getDataSource(): DataSource {
  if (isTauriEnv()) return "process";
  // Always attempt live API (works without token at 60 req/hr)
  // The actual source is determined after fetch — check getGitHubFetchMeta()
  return lastFetchMeta?.source === "live-api" || lastFetchMeta?.source === "cache"
    ? "nvidia"
    : hasApiKey("github")
      ? "nvidia"
      : "simulated";
}

/**
 * Get all tracked repos.
 * Priority: Tauri backend → Live GitHub API (browser + key) → Mock data
 */
export const getTrackedRepos = createService<GitHubRepo[]>({
  backendPath: "/github/repos",
  liveFetcher: () => fetchLiveGitHubRepos(),
  mockData: () => [...mockRepos],
  label: "githubService.getTrackedRepos",
});

/**
 * Check all repos for updates.
 * Browser: simulated delay, returns unchanged.
 * Tauri: POST /api/github/repos/check-all (compares local HEAD vs remote)
 */
export async function checkAllUpdates(
  currentRepos: GitHubRepo[]
): Promise<GitHubRepo[]> {
  if (shouldTryBackend()) {
    try {
      const res = await fetchBackend(`${getApiBase()}/github/repos/check-all`, {
        method: "POST",
      });
      if (res.ok) return await res.json();
    } catch { /* fall through */ }
  }

  await new Promise((r) => setTimeout(r, 2000));
  return currentRepos;
}

/**
 * Pull update for a specific repo.
 * Browser: simulated. Tauri: POST /api/github/repos/:id/pull (git pull)
 */
export async function pullRepoUpdate(repoId: string): Promise<boolean> {
  if (shouldTryBackend()) {
    try {
      const res = await fetchBackend(`${getApiBase()}/github/repos/${repoId}/pull`, {
        method: "POST",
      });
      return res.ok;
    } catch { return false; }
  }

  await new Promise((r) => setTimeout(r, 2000));
  return true;
}

/**
 * Clone a repo locally.
 * Browser: simulated. Tauri: POST /api/github/repos/:id/clone (git clone)
 */
export async function cloneRepo(
  repoId: string,
  fullName: string
): Promise<boolean> {
  if (shouldTryBackend()) {
    try {
      const res = await fetchBackend(`${getApiBase()}/github/repos/${repoId}/clone`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ full_name: fullName }),
      });
      return res.ok;
    } catch { return false; }
  }

  await new Promise((r) => setTimeout(r, 3000));
  return true;
}

/**
 * Open a repo on GitHub in the browser.
 */
export function getRepoUrl(fullName: string): string {
  return `https://github.com/${fullName}`;
}

// --- Categories ---

export function getCategories(): CategoryDef[] {
  return [
    { value: "all", label: "All", icon: "Code" },
    { value: "core-stack", label: "My Stack", icon: "Zap" },
    { value: "custom-nodes", label: "Nodes", icon: "Plug" },
    { value: "training", label: "Training", icon: "TrendingUp" },
    { value: "video", label: "Video", icon: "Eye" },
    { value: "models", label: "Models", icon: "Package" },
    { value: "tools", label: "Tools", icon: "Wrench" },
  ];
}

// --- Mock data extracted to mocks/github.mock.ts ---
