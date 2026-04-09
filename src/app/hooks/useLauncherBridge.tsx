// ============================================================
// Launcher Bridge — Cross-page communication between
// Package Manager and Quick Launcher
// ============================================================
//
// Provides:
//   - pendingTool: tool ID to pre-select in QuickLauncher
//   - pendingPackage: package ID to pre-select in PackageManager
//   - launchTool(toolId): navigate to launcher with tool pre-selected
//   - openPackage(packageId): navigate to package detail
//   - clearPending(): clear any pending navigation state
//
// ============================================================

import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import { useNavigate } from "react-router";

interface LauncherBridgeState {
  /** Tool ID to pre-select in Quick Launcher (e.g. "comfyui") */
  pendingTool: string | null;
  /** Package ID to pre-select in Package Manager */
  pendingPackage: string | null;
  /** Navigate to Quick Launcher tab in Command Center with tool pre-selected */
  launchTool: (toolId: string) => void;
  /** Navigate to Package Manager with package pre-selected */
  openPackage: (packageId: string) => void;
  /** Navigate to Package Manager and open a specific action for running */
  openPackageAction: (packageId: string, actionId: string) => void;
  /** Clear pending state after consuming it */
  clearPending: () => void;
  /** Pending action ID (used when navigating to run a specific action) */
  pendingAction: string | null;
}

const LauncherBridgeContext = createContext<LauncherBridgeState | null>(null);

export function LauncherBridgeProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const [pendingTool, setPendingTool] = useState<string | null>(null);
  const [pendingPackage, setPendingPackage] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);

  const launchTool = useCallback(
    (toolId: string) => {
      setPendingTool(toolId);
      // Navigate to Command Center (root) — ScriptLab's launcher tab
      navigate("/");
    },
    [navigate]
  );

  const openPackage = useCallback(
    (packageId: string) => {
      setPendingPackage(packageId);
      navigate("/packages");
    },
    [navigate]
  );

  const openPackageAction = useCallback(
    (packageId: string, actionId: string) => {
      setPendingPackage(packageId);
      setPendingAction(actionId);
      navigate("/packages");
    },
    [navigate]
  );

  const clearPending = useCallback(() => {
    setPendingTool(null);
    setPendingPackage(null);
    setPendingAction(null);
  }, []);

  return (
    <LauncherBridgeContext.Provider
      value={{
        pendingTool,
        pendingPackage,
        pendingAction,
        launchTool,
        openPackage,
        openPackageAction,
        clearPending,
      }}
    >
      {children}
    </LauncherBridgeContext.Provider>
  );
}

export function useLauncherBridge(): LauncherBridgeState {
  const ctx = useContext(LauncherBridgeContext);
  if (!ctx) {
    // Fallback for components not wrapped in provider — return no-ops
    return {
      pendingTool: null,
      pendingPackage: null,
      pendingAction: null,
      launchTool: () => {},
      openPackage: () => {},
      openPackageAction: () => {},
      clearPending: () => {},
    };
  }
  return ctx;
}
