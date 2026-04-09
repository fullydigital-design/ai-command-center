// ============================================================
// createService<T>() — Generic 3-tier service factory
// ============================================================
//
// Encapsulates the universal fallback pattern used by every
// service in the app:
//
//   Tier 1: Tauri/Backend  → fetch("http://127.0.0.1:8000/api/...")
//   Tier 2: Live browser   → direct API call (optional)
//   Tier 3: Mock data      → always works, never fails
//
// BEFORE (repeated in every service function):
//
//   export async function getGPUStats(): Promise<GPUStats> {
//     if (isTauriEnv()) {
//       try {
//         const res = await fetchBackend(`${getApiBase()}/system/gpu-stats`);
//         if (res.ok) return await res.json();
//       } catch { /* fall through */ }
//     }
//     return mockGPUStats;
//   }
//
// AFTER (one-liner):
//
//   export const getGPUStats = createService<GPUStats>({
//     backendPath: "/system/gpu-stats",
//     mockData: mockGPUStats,
//   });
//
// ============================================================

import { isTauriEnv, shouldTryBackend, getApiBase } from "./env";
import { fetchBackend, fetchExternalAPI, fetchHealth, fetchStream } from "./fetchWithRetry";

// ── Types ────────────────────────────────────────────────────

/** Which fetch preset to use for the backend call. */
export type FetchPreset = "health" | "backend" | "external" | "stream";

/** Resolve a value that may be static or a function/async function. */
type Resolvable<T> = T | (() => T) | (() => Promise<T>);

/** Configuration for a GET-style service that returns data. */
export interface ServiceConfig<T> {
  /**
   * Backend API path (appended to getApiBase()).
   * Example: "/system/gpu-stats"
   */
  backendPath: string;

  /**
   * Optional Tier 2: live browser API fetcher.
   * Called when backend is unreachable but a browser API is available.
   * Example: fetch CivitAI directly with user's API key.
   * Return `null` to fall through to mock data.
   */
  liveFetcher?: () => Promise<T | null>;

  /**
   * Tier 3: Mock data fallback. Always succeeds.
   * Can be a static value, a sync function, or an async function.
   */
  mockData: Resolvable<T>;

  /**
   * Which fetchWithRetry preset to use (default: "backend").
   * - "health":   3s timeout, no retries (health pings)
   * - "backend":  8s timeout, 1 retry (local FastAPI)
   * - "external": 12s timeout, 2 retries (GitHub/HF/CivitAI)
   * - "stream":   60s timeout, no retries (SSE streams)
   */
  fetchPreset?: FetchPreset;

  /**
   * Optional transform applied to the backend response JSON
   * before returning. Useful for reshaping API responses.
   */
  transform?: (raw: unknown) => T;

  /**
   * If true, skip the isTauriEnv() check and always attempt
   * the backend call first (useful for testing against a
   * running FastAPI in browser mode).
   */
  alwaysTryBackend?: boolean;
}

/** Configuration for a POST/PUT/DELETE action. */
export interface ServiceActionConfig<TInput, TResult> {
  /**
   * Backend API path. Can include a placeholder for dynamic segments:
   * - Static:  "/system/cleanup/run"
   * - Dynamic: "/services/{id}/start" → use `pathParams` to resolve
   */
  backendPath: string | ((input: TInput) => string);

  /** HTTP method (default: "POST"). */
  method?: "POST" | "PUT" | "DELETE" | "PATCH";

  /**
   * Tier 3: Mock result fallback.
   * Can be static, sync function of input, or async function of input.
   */
  mockResult: TResult | ((input: TInput) => TResult) | ((input: TInput) => Promise<TResult>);

  /** Simulated delay in ms for mock mode (default: 1000). */
  mockDelay?: number;

  /** Which fetch preset to use (default: "backend"). */
  fetchPreset?: FetchPreset;

  /** Optional transform for the backend response. */
  transform?: (raw: unknown) => TResult;

  /** If true, always attempt backend regardless of isTauriEnv(). */
  alwaysTryBackend?: boolean;

  /**
   * How to serialize the input into the request body.
   * Default: JSON.stringify(input).
   */
  bodySerializer?: (input: TInput) => string;
}

// ── Helpers ──────────────────────────────────────────────────

/** Pick the right fetch function for the preset. */
function getFetcher(preset: FetchPreset): typeof fetch {
  switch (preset) {
    case "health": return fetchHealth as typeof fetch;
    case "backend": return fetchBackend as typeof fetch;
    case "external": return fetchExternalAPI as typeof fetch;
    case "stream": return fetchStream as typeof fetch;
    default: return fetchBackend as typeof fetch;
  }
}

/** Resolve a Resolvable<T> to a concrete value. */
async function resolve<T>(value: Resolvable<T>): Promise<T> {
  if (typeof value === "function") {
    return await (value as () => T | Promise<T>)();
  }
  return value;
}

// ── Factory: GET-style service ───────────────────────────────

/**
 * Create a typed async function that follows the 3-tier pattern:
 * Backend → Live browser → Mock data.
 *
 * @example
 * ```ts
 * export const getGPUStats = createService<GPUStats>({
 *   backendPath: "/system/gpu-stats",
 *   mockData: { vramUsedGB: 2.4, vramTotalGB: 32, ... },
 * });
 * ```
 *
 * @example With live browser tier:
 * ```ts
 * export const getGitHubRepos = createService<Repo[]>({
 *   backendPath: "/github/repos",
 *   liveFetcher: async () => {
 *     const key = getApiKey("github");
 *     if (!key) return null;
 *     const res = await fetch("https://api.github.com/...", { headers: { Authorization: `Bearer ${key}` } });
 *     return res.ok ? res.json() : null;
 *   },
 *   mockData: mockRepos,
 *   fetchPreset: "external",
 * });
 * ```
 */
export function createService<T>(config: ServiceConfig<T>): () => Promise<T> {
  const {
    backendPath,
    liveFetcher,
    mockData,
    fetchPreset = "backend",
    transform,
    alwaysTryBackend = false,
  } = config;

  return async (): Promise<T> => {
    // ── Tier 1: Backend ──────────────────────────────────────
    if (alwaysTryBackend || shouldTryBackend()) {
      try {
        const fetcher = getFetcher(fetchPreset);
        const url = `${getApiBase()}${backendPath}`;
        const res = await fetcher(url);
        if (res.ok) {
          const json = await res.json();
          return transform ? transform(json) : (json as T);
        }
      } catch {
        // Fall through to next tier
      }
    }

    // ── Tier 2: Live browser API ─────────────────────────────
    if (liveFetcher) {
      try {
        const result = await liveFetcher();
        if (result !== null) return result;
      } catch {
        // Fall through to mock
      }
    }

    // ── Tier 3: Mock data ────────────────────────────────────
    return resolve(mockData);
  };
}

// ── Factory: POST/PUT/DELETE action ──────────────────────────

/**
 * Create a typed async action function (POST/PUT/DELETE).
 *
 * @example Simple POST:
 * ```ts
 * export const runCleanup = createServiceAction<string[], { success: boolean; freedMb: number }>({
 *   backendPath: "/system/cleanup/run",
 *   mockResult: { success: true, freedMb: 0 },
 *   mockDelay: 3000,
 * });
 * ```
 *
 * @example Dynamic path:
 * ```ts
 * export const startService = createServiceAction<string, { message: string }>({
 *   backendPath: (id) => `/services/${id}/start`,
 *   method: "POST",
 *   mockResult: (id) => ({ message: `MOCK: Started ${id}` }),
 * });
 * ```
 */
export function createServiceAction<TInput, TResult>(
  config: ServiceActionConfig<TInput, TResult>
): (input: TInput) => Promise<TResult> {
  const {
    backendPath,
    method = "POST",
    mockResult,
    mockDelay = 1000,
    fetchPreset = "backend",
    transform,
    alwaysTryBackend = false,
    bodySerializer,
  } = config;

  return async (input: TInput): Promise<TResult> => {
    // ── Tier 1: Backend ──────────────────────────────────────
    if (alwaysTryBackend || shouldTryBackend()) {
      try {
        const path = typeof backendPath === "function" ? backendPath(input) : backendPath;
        const url = `${getApiBase()}${path}`;
        const fetcher = getFetcher(fetchPreset);
        const body = bodySerializer ? bodySerializer(input) : JSON.stringify(input);

        const res = await fetcher(url, {
          method,
          headers: { "Content-Type": "application/json" },
          body,
        });

        if (res.ok) {
          const json = await res.json();
          return transform ? transform(json) : (json as TResult);
        }
      } catch {
        // Fall through to mock
      }
    }

    // ── Tier 3: Mock result ──────────────────────────────────
    if (mockDelay > 0) {
      await new Promise((r) => setTimeout(r, mockDelay));
    }

    if (typeof mockResult === "function") {
      return await (mockResult as (i: TInput) => TResult | Promise<TResult>)(input);
    }
    return mockResult;
  };
}

// ── Factory: Parameterized GET ───────────────────────────────

/**
 * Create a typed async function with a parameter that follows the 3-tier pattern.
 * Useful for endpoints like GET /api/training/jobs/:id/loss.
 *
 * @example
 * ```ts
 * export const getJobLoss = createServiceWithParam<string, LossDataPoint[]>({
 *   backendPath: (jobId) => `/training/jobs/${jobId}/loss`,
 *   mockData: [],
 * });
 * ```
 */
export function createServiceWithParam<TParam, TResult>(
  config: Omit<ServiceConfig<TResult>, "backendPath" | "liveFetcher"> & {
    backendPath: (param: TParam) => string;
    liveFetcher?: (param: TParam) => Promise<TResult | null>;
  }
): (param: TParam) => Promise<TResult> {
  const {
    backendPath,
    liveFetcher,
    mockData,
    fetchPreset = "backend",
    transform,
    alwaysTryBackend = false,
  } = config;

  return async (param: TParam): Promise<TResult> => {
    // ── Tier 1: Backend ──────────��───────────────────────────
    if (alwaysTryBackend || shouldTryBackend()) {
      try {
        const path = backendPath(param);
        const url = `${getApiBase()}${path}`;
        const fetcher = getFetcher(fetchPreset);
        const res = await fetcher(url);
        if (res.ok) {
          const json = await res.json();
          return transform ? transform(json) : (json as TResult);
        }
      } catch {
        // Fall through
      }
    }

    // ── Tier 2: Live browser API ─────────────────────────────
    if (liveFetcher) {
      try {
        const result = await liveFetcher(param);
        if (result !== null) return result;
      } catch {
        // Fall through
      }
    }

    // ── Tier 3: Mock data ────────────────────────────────────
    return resolve(mockData);
  };
}

