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
export async function getTrackedRepos(): Promise<GitHubRepo[]> {
  if (shouldTryBackend()) {
    try {
      const res = await fetchBackend(`${getApiBase()}/github/repos`);
      if (res.ok) return await res.json();
    } catch { /* fall through */ }
  }

  // Try live API with stored key
  const live = await fetchLiveGitHubRepos();
  if (live) return live;

  return [...mockRepos];
}

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

// --- Mock data ---

const mockRepos: GitHubRepo[] = [
  // === CORE STACK (installed tools from the BAT) ===
  {
    id: "1", name: "ComfyUI", fullName: "comfyanonymous/ComfyUI",
    description: "The most powerful and modular diffusion model GUI and backend with a graph/nodes interface",
    stars: "68.2k", forks: "8.1k", openIssues: 1842, language: "Python", languageColor: "#3572A5",
    lastUpdate: "2 hours ago", lastCommitMsg: "fix: resolve memory leak in GGUF loader for large models",
    releaseTag: "v0.3.14", category: "core-stack", trending: true, installed: true, hasUpdate: true, pinned: true,
    topics: ["stable-diffusion", "flux", "gui", "nodes"],
    localPath: "C:\\_AI\\_test_fresh_all_AI\\ComfyUI",
    commitsBehind: 3,
  },
  {
    id: "2", name: "SwarmUI", fullName: "mcmonkeyprojects/SwarmUI",
    description: "SwarmUI - a modular web-UI for generation with massive backend support",
    stars: "8.9k", forks: "680", openIssues: 287, language: "C#", languageColor: "#178600",
    lastUpdate: "2 days ago", lastCommitMsg: "feat: add FLUX.1 Kontext support + image reference workflows",
    releaseTag: "v0.9.5-Beta", category: "core-stack", trending: false, installed: true, hasUpdate: false, pinned: true,
    topics: ["swarmui", "generation", "web-ui", "comfyui-backend"],
    localPath: "C:\\_AI\\_test_fresh_all_AI\\SwarmUI",
  },
  {
    id: "3", name: "sd-scripts", fullName: "kohya-ss/sd-scripts",
    description: "Training scripts for Stable Diffusion, FLUX LoRA, DreamBooth and fine-tuning",
    stars: "10.8k", forks: "2.1k", openIssues: 134, language: "Python", languageColor: "#3572A5",
    lastUpdate: "5 days ago", lastCommitMsg: "add support for FLUX.1 Kontext LoRA training",
    releaseTag: "v0.8.9", category: "core-stack", trending: false, installed: true, hasUpdate: false, pinned: true,
    topics: ["training", "lora", "dreambooth", "flux", "sdxl"],
    localPath: "C:\\_AI\\_test_fresh_all_AI\\kohya_ss",
  },
  {
    id: "4", name: "musubi-tuner", fullName: "kohya-ss/musubi-tuner",
    description: "Video model fine-tuning toolkit for Wan, HunyuanVideo, FramePack and other video architectures",
    stars: "5.2k", forks: "420", openIssues: 89, language: "Python", languageColor: "#3572A5",
    lastUpdate: "1 week ago", lastCommitMsg: "add Wan2.1 14B I2V support + fix frame interpolation",
    releaseTag: "v0.3.1", category: "core-stack", trending: true, installed: true, hasUpdate: false, pinned: true,
    topics: ["video", "fine-tuning", "wan", "hunyuan", "framepack"],
    localPath: "C:\\_AI\\_test_fresh_all_AI\\musubi-tuner",
  },

  // === CUSTOM NODES (from the BAT's 22-node list) ===
  {
    id: "10", name: "ComfyUI-Manager", fullName: "ltdrdata/ComfyUI-Manager",
    description: "ComfyUI custom node manager - install, update, and manage custom nodes easily",
    stars: "12.1k", forks: "1.4k", openIssues: 67, language: "Python", languageColor: "#3572A5",
    lastUpdate: "6 hours ago", lastCommitMsg: "fix: node compatibility check for latest ComfyUI",
    releaseTag: "v3.7.2", category: "custom-nodes", trending: false, installed: true, hasUpdate: true, pinned: false,
    topics: ["comfyui", "manager", "custom-nodes"],
    localPath: "C:\\_AI\\_test_fresh_all_AI\\ComfyUI\\custom_nodes\\ComfyUI-Manager",
    commitsBehind: 7,
  },
  {
    id: "11", name: "ComfyUI-Impact-Pack", fullName: "ltdrdata/ComfyUI-Impact-Pack",
    description: "Detailer, SAM, bbox, face detection, and advanced segmentation nodes",
    stars: "4.2k", forks: "510", openIssues: 45, language: "Python", languageColor: "#3572A5",
    lastUpdate: "3 days ago", lastCommitMsg: "update SAM2 model support for video segmentation",
    releaseTag: "v7.2.1", category: "custom-nodes", trending: false, installed: true, hasUpdate: false, pinned: false,
    topics: ["comfyui", "detailer", "sam", "segmentation"],
    localPath: "C:\\_AI\\_test_fresh_all_AI\\ComfyUI\\custom_nodes\\ComfyUI-Impact-Pack",
  },
  {
    id: "12", name: "ComfyUI_IPAdapter_plus", fullName: "cubiq/ComfyUI_IPAdapter_plus",
    description: "IP-Adapter implementation for ComfyUI with advanced features and multi-reference",
    stars: "5.6k", forks: "490", openIssues: 32, language: "Python", languageColor: "#3572A5",
    lastUpdate: "3 days ago", lastCommitMsg: "add FLUX IP-Adapter support + weight type selection",
    releaseTag: "v2.5.0", category: "custom-nodes", trending: false, installed: true, hasUpdate: true, pinned: false,
    topics: ["comfyui", "ip-adapter", "style-transfer"],
    localPath: "C:\\_AI\\_test_fresh_all_AI\\ComfyUI\\custom_nodes\\ComfyUI_IPAdapter_plus",
    commitsBehind: 5,
  },
  {
    id: "13", name: "ComfyUI-VideoHelperSuite", fullName: "Kosinkadink/ComfyUI-VideoHelperSuite",
    description: "Video nodes for ComfyUI including loading, combining, splitting, and exporting video files",
    stars: "3.4k", forks: "340", openIssues: 28, language: "Python", languageColor: "#3572A5",
    lastUpdate: "4 days ago", lastCommitMsg: "fix: audio sync in video combine node",
    releaseTag: "v1.4.0", category: "custom-nodes", trending: false, installed: true, hasUpdate: true, pinned: false,
    topics: ["comfyui", "video", "nodes"],
    localPath: "C:\\_AI\\_test_fresh_all_AI\\ComfyUI\\custom_nodes\\ComfyUI-VideoHelperSuite",
    commitsBehind: 2,
  },
  {
    id: "14", name: "ComfyUI-GGUF", fullName: "city96/ComfyUI-GGUF",
    description: "GGUF quantized model support for ComfyUI - run large models with less VRAM",
    stars: "4.1k", forks: "280", openIssues: 19, language: "Python", languageColor: "#3572A5",
    lastUpdate: "1 week ago", lastCommitMsg: "add Q5_K_M quantization support + flux gguf loader",
    releaseTag: "v0.4.2", category: "custom-nodes", trending: true, installed: true, hasUpdate: false, pinned: false,
    topics: ["comfyui", "gguf", "quantization", "flux"],
  },
  {
    id: "15", name: "ComfyUI-Advanced-ControlNet", fullName: "Kosinkadink/ComfyUI-Advanced-ControlNet",
    description: "Advanced ControlNet tools with multi-ControlNet, batch processing, and weight scheduling",
    stars: "2.8k", forks: "220", openIssues: 15, language: "Python", languageColor: "#3572A5",
    lastUpdate: "5 days ago", lastCommitMsg: "update: support FLUX ControlNet union model",
    releaseTag: "v1.2.3", category: "custom-nodes", trending: false, installed: true, hasUpdate: false, pinned: false,
    topics: ["comfyui", "controlnet", "multi-controlnet"],
  },
  {
    id: "16", name: "comfyui_controlnet_aux", fullName: "Fannovel16/comfyui_controlnet_aux",
    description: "ControlNet preprocessors for ComfyUI - OpenPose, Depth, Canny, LineArt and more",
    stars: "3.1k", forks: "310", openIssues: 41, language: "Python", languageColor: "#3572A5",
    lastUpdate: "1 week ago", lastCommitMsg: "add DWPose v2 + MiDaS depth estimation update",
    releaseTag: "v0.8.4", category: "custom-nodes", trending: false, installed: true, hasUpdate: false, pinned: false,
    topics: ["comfyui", "controlnet", "preprocessors", "openpose"],
  },
  {
    id: "17", name: "rgthree-comfy", fullName: "rgthree/rgthree-comfy",
    description: "Workflow organizer nodes - reroute, bookmark, seed control, and UI utilities",
    stars: "2.4k", forks: "180", openIssues: 12, language: "TypeScript", languageColor: "#3178C6",
    lastUpdate: "6 days ago", lastCommitMsg: "fix: node group resize handles on latest ComfyUI",
    releaseTag: "v1.9.0", category: "custom-nodes", trending: false, installed: true, hasUpdate: false, pinned: false,
    topics: ["comfyui", "workflow", "organizer", "ui"],
  },
  {
    id: "18", name: "comfyui-reactor-node", fullName: "Gourieff/comfyui-reactor-node",
    description: "Fast and accurate face swap node for ComfyUI based on ReActor/InsightFace",
    stars: "3.8k", forks: "350", openIssues: 56, language: "Python", languageColor: "#3572A5",
    lastUpdate: "2 weeks ago", lastCommitMsg: "update insightface models + multi-face support",
    releaseTag: "v0.5.1", category: "custom-nodes", trending: false, installed: true, hasUpdate: false, pinned: false,
    topics: ["comfyui", "face-swap", "reactor", "insightface"],
  },

  // === MODELS & ARCHITECTURES ===
  {
    id: "20", name: "FLUX", fullName: "black-forest-labs/flux",
    description: "Official repository for FLUX.1 text-to-image models by Black Forest Labs",
    stars: "22.4k", forks: "1.9k", openIssues: 210, language: "Python", languageColor: "#3572A5",
    lastUpdate: "1 day ago", lastCommitMsg: "release: FLUX.1 Kontext model weights + inference guide",
    releaseTag: "v0.4.0", category: "models", trending: true, installed: true, hasUpdate: false, pinned: false,
    topics: ["text-to-image", "diffusion", "flux", "kontext"],
  },
  {
    id: "21", name: "Wan2.1", fullName: "Wan-AI/Wan2.1",
    description: "Wan2.1: A comprehensive and open suite of video foundation models (T2V, I2V, 14B)",
    stars: "18.7k", forks: "1.3k", openIssues: 340, language: "Python", languageColor: "#3572A5",
    lastUpdate: "3 days ago", lastCommitMsg: "add 14B I2V model weights + camera control support",
    releaseTag: "v2.1", category: "video", trending: true, installed: true, hasUpdate: false, pinned: false,
    topics: ["video-generation", "foundation-model", "i2v", "t2v"],
  },
  {
    id: "22", name: "HunyuanVideo", fullName: "Tencent/HunyuanVideo",
    description: "A systematic framework for large video generative models with high visual quality",
    stars: "9.3k", forks: "810", openIssues: 178, language: "Python", languageColor: "#3572A5",
    lastUpdate: "1 week ago", lastCommitMsg: "fix: video decoding for long sequence generation",
    releaseTag: "v1.0", category: "video", trending: false, installed: false, hasUpdate: false, pinned: false,
    topics: ["video-generation", "large-model", "hunyuan"],
  },
  {
    id: "23", name: "FramePack", fullName: "lllyasviel/FramePack",
    description: "FramePack - efficient video generation framework with next-frame prediction",
    stars: "11.5k", forks: "870", openIssues: 120, language: "Python", languageColor: "#3572A5",
    lastUpdate: "5 days ago", lastCommitMsg: "release: FramePack v2 with 2x speed improvement",
    releaseTag: "v2.0", category: "video", trending: true, installed: false, hasUpdate: false, pinned: false,
    topics: ["video", "generation", "framepack", "next-frame"],
  },

  // === TOOLS ===
  {
    id: "30", name: "Fooocus", fullName: "lllyasviel/Fooocus",
    description: "Focus on prompting and generating - minimal UI, maximum quality defaults",
    stars: "42.1k", forks: "5.8k", openIssues: 890, language: "Python", languageColor: "#3572A5",
    lastUpdate: "2 weeks ago", lastCommitMsg: "add inpainting improvements + SDXL turbo support",
    releaseTag: "v2.5.5", category: "tools", trending: false, installed: false, hasUpdate: false, pinned: false,
    topics: ["stable-diffusion", "sdxl", "minimal-ui"],
  },
  {
    id: "31", name: "stable-diffusion-webui", fullName: "AUTOMATIC1111/stable-diffusion-webui",
    description: "Stable Diffusion web UI - the original and most feature-rich SD interface",
    stars: "148k", forks: "27.5k", openIssues: 2100, language: "Python", languageColor: "#3572A5",
    lastUpdate: "1 month ago", lastCommitMsg: "fix: compatibility with latest torch 2.6",
    releaseTag: "v1.10.1", category: "tools", trending: false, installed: false, hasUpdate: false, pinned: false,
    topics: ["stable-diffusion", "webui", "gradio"],
  },

  // === TRAINING ===
  {
    id: "40", name: "ai-toolkit", fullName: "ostris/ai-toolkit",
    description: "FLUX/SDXL LoRA training toolkit with automatic caption + simple config",
    stars: "7.2k", forks: "680", openIssues: 95, language: "Python", languageColor: "#3572A5",
    lastUpdate: "4 days ago", lastCommitMsg: "add FLUX Kontext LoRA fine-tuning support",
    releaseTag: "v0.5.0", category: "training", trending: true, installed: false, hasUpdate: false, pinned: false,
    topics: ["training", "flux", "lora", "sdxl", "toolkit"],
  },
  {
    id: "41", name: "SimpleTuner", fullName: "bghira/SimpleTuner",
    description: "General fine-tuning toolkit for SDXL, FLUX, and Stable Diffusion 3 with LoRA + full fine-tune",
    stars: "4.8k", forks: "380", openIssues: 62, language: "Python", languageColor: "#3572A5",
    lastUpdate: "1 week ago", lastCommitMsg: "fix: gradient checkpointing memory optimization for 24GB cards",
    releaseTag: "v1.2.0", category: "training", trending: false, installed: false, hasUpdate: false, pinned: false,
    topics: ["training", "fine-tuning", "flux", "sdxl", "sd3"],
  },
];