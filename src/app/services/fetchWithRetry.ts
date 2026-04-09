// ============================================================
// fetchWithRetry — Resilient fetch with retry, timeout & backoff
// ============================================================
// Phase 6: Network resilience layer for all service calls.
//
// Features:
//   - Configurable retry count with exponential backoff
//   - AbortController-based timeout (default 10s)
//   - Only retries network errors and 5xx responses
//   - Respects existing AbortSignal if passed in options
//   - Jitter to avoid thundering herd
// ============================================================

export interface FetchRetryOptions extends RequestInit {
  /** Max number of retry attempts (default: 2 → up to 3 total tries). */
  retries?: number;
  /** Timeout in ms for each attempt (default: 10_000). Set 0 to disable. */
  timeout?: number;
  /** Base delay in ms between retries (default: 1000). Doubled each retry. */
  backoff?: number;
  /** If true, never retry (useful for streaming / SSE calls). */
  noRetry?: boolean;
}

/** Errors that indicate a transient network issue worth retrying. */
function isRetryable(error: unknown): boolean {
  if (error instanceof DOMException && error.name === "AbortError") return false;
  if (error instanceof TypeError) return true; // fetch network failure
  return true;
}

/** Should we retry this HTTP status? Only 5xx (server errors). */
function isRetryableStatus(status: number): boolean {
  return status >= 500 && status < 600;
}

/** Add jitter (±25%) to avoid synchronized retries across tabs. */
function jitter(ms: number): number {
  return ms * (0.75 + Math.random() * 0.5);
}

/**
 * Enhanced fetch with automatic retry, timeout, and exponential backoff.
 *
 * Usage (drop-in replacement for fetch):
 * ```ts
 * import { fetchWithRetry } from "./fetchWithRetry";
 * const res = await fetchWithRetry(url, { retries: 2, timeout: 8000 });
 * ```
 */
export async function fetchWithRetry(
  input: RequestInfo | URL,
  options: FetchRetryOptions = {}
): Promise<Response> {
  const {
    retries = 2,
    timeout = 10_000,
    backoff = 1000,
    noRetry = false,
    signal: externalSignal,
    ...fetchInit
  } = options;

  const maxAttempts = noRetry ? 1 : retries + 1;
  let lastError: unknown;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    // --- Build composite abort signal ---
    const controller = new AbortController();
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    if (timeout > 0) {
      timeoutId = setTimeout(() => controller.abort(), timeout);
    }

    // If caller passed an external signal, propagate its abort
    if (externalSignal) {
      if (externalSignal.aborted) {
        clearTimeout(timeoutId);
        throw new DOMException("Aborted", "AbortError");
      }
      externalSignal.addEventListener("abort", () => controller.abort(), { once: true });
    }

    try {
      const res = await fetch(input, {
        ...fetchInit,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // If it's a server error AND we have retries left, retry
      if (isRetryableStatus(res.status) && attempt < maxAttempts - 1) {
        const delay = jitter(backoff * Math.pow(2, attempt));
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }

      return res;
    } catch (error) {
      clearTimeout(timeoutId);
      lastError = error;

      // Don't retry if caller explicitly aborted
      if (externalSignal?.aborted) {
        throw error;
      }

      // Don't retry non-retryable errors
      if (!isRetryable(error) || attempt >= maxAttempts - 1) {
        throw error;
      }

      // Exponential backoff with jitter before next attempt
      const delay = jitter(backoff * Math.pow(2, attempt));
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  // Should never reach here, but just in case
  throw lastError;
}

// ============================================================
// Convenience presets for common use cases
// ============================================================

/** Quick health-check fetch: 3s timeout, no retries. */
export function fetchHealth(url: string, init?: RequestInit): Promise<Response> {
  return fetchWithRetry(url, { ...init, timeout: 3000, noRetry: true });
}

/** Local backend fetch: 8s timeout, 1 retry. */
export function fetchBackend(url: string, init?: RequestInit): Promise<Response> {
  return fetchWithRetry(url, { ...init, timeout: 8000, retries: 1 });
}

/** External API fetch: 12s timeout, 2 retries. */
export function fetchExternalAPI(url: string, init?: RequestInit): Promise<Response> {
  return fetchWithRetry(url, { ...init, timeout: 12_000, retries: 2 });
}

/** Streaming / SSE fetch: 60s timeout, no retries. */
export function fetchStream(url: string, init?: RequestInit): Promise<Response> {
  return fetchWithRetry(url, { ...init, timeout: 60_000, noRetry: true });
}
