// ============================================================
// Environment Detection - Single source of truth
// ============================================================
// Shared by all services and components. Never duplicate these.
//
// Usage:
//   import { isTauriEnv, getApiBase } from "../services/env";
// ============================================================

/**
 * Detect if running inside a Tauri desktop shell.
 */
export function isTauriEnv(): boolean {
  return typeof window !== "undefined" && "__TAURI__" in window;
}

/**
 * Runtime override: force all services to try the backend first,
 * even in browser mode. Useful for testing live data without Tauri.
 *
 * Set via browser console:  window.__FORCE_BACKEND__ = true
 * Or toggle in Settings page.
 */
export function shouldTryBackend(): boolean {
  if (isTauriEnv()) return true;
  if (typeof window !== "undefined") {
    // Runtime override (console: window.__FORCE_BACKEND__ = true)
    if ((window as any).__FORCE_BACKEND__ === true) {
      // Persist so it survives page refresh
      try { localStorage.setItem("FORCE_BACKEND", "true"); } catch {}
      return true;
    }
    // Check persisted flag (survives F5 refresh)
    try {
      return localStorage.getItem("FORCE_BACKEND") === "true";
    } catch { return false; }
  }
  return false;
}

/**
 * Base URL for the FastAPI backend.
 */
export function getApiBase(): string {
  return "http://127.0.0.1:8000/api";
}

/**
 * Detect current data source tier.
 */
export type DataSourceTier = "tauri" | "live-browser" | "simulated";

export function getDataSourceTier(): DataSourceTier {
  if (isTauriEnv()) return "tauri";
  return "live-browser";
}
