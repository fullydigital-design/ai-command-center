// ============================================================
// Shared API Key Helper — reads keys from Settings localStorage
// ============================================================

const STORAGE_KEY = "ai_command_center_settings";

/**
 * Get an API key by provider name (github, huggingface, civitai, openrouter).
 * Returns empty string if not set.
 */
export function getApiKey(provider: string): string {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return "";
    const parsed = JSON.parse(raw);
    return parsed[`api_key_${provider}`] || "";
  } catch {
    return "";
  }
}

/**
 * Check if an API key is set for a provider.
 */
export function hasApiKey(provider: string): boolean {
  return getApiKey(provider).length > 0;
}

/**
 * Metadata about the last API fetch — for validation/debug display.
 */
export interface FetchMeta {
  source: "live-api" | "mock" | "cache" | "tauri";
  fetchedAt: string;       // ISO timestamp
  itemCount: number;
  rateLimit?: string;      // e.g. "4832/5000"
  rateLimitReset?: string; // ISO timestamp
  endpoint?: string;       // Which API was called
  error?: string;          // If there was an error
}