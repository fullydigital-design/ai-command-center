// ============================================================
// Script Package Types — Manifest schema & related types
// ============================================================
//
// A Script Package is a self-contained zip with:
//   manifest.json  → describes contents, actions, configs
//   scripts/       → .bat, .py files the app executes
//   configs/       → .toml, .yaml templates for training/launch
//   launchers/     → .bat.template files generated at install
//   nodes/         → recommended_nodes.json for ComfyUI
//   README.md      → Human-readable docs
//
// The app is a BULLETPROOF SHELL that never needs rebuilding.
// All intelligence lives in these packages, which are:
//   - Downloadable / replaceable
//   - AI-generated
//   - Version-controlled independently of the app
//
// ============================================================

// ── Manifest Schema ──────────────────────────────────────────

/** Top-level manifest.json — the contract between package and app */
export interface PackageManifest {
  /** Unique package identifier (kebab-case, e.g. "rtx5090-setup") */
  id: string;
  /** Human-readable name */
  name: string;
  /** Semantic version (e.g. "2.4.0") */
  version: string;
  /** Minimum app version required to run this package */
  minAppVersion: string;
  /** Author name */
  author: string;
  /** ISO date of creation/last update */
  created: string;
  /** ISO date of last modification */
  updated: string;
  /** Short description (shown in package list) */
  description: string;
  /** Longer description / changelog (shown in detail view) */
  longDescription?: string;
  /** Package category for organization */
  category: PackageCategory;
  /** Tags for filtering/search */
  tags: string[];
  /** Accent color hex for UI theming */
  color?: string;
  /** Icon name from lucide-react */
  icon?: string;

  /** System requirements */
  requires: PackageRequirements;

  /** Executable actions (shown as buttons in the UI) */
  actions: PackageAction[];

  /** Config file templates (editable in the app) */
  configs?: PackageConfig[];

  /** File listing (relative paths within the package) */
  files: PackageFile[];

  /** Path to README.md within the package (if present) */
  readme?: string;

  /** Path to nodes list JSON (ComfyUI custom nodes) */
  nodesFile?: string;

  /** Changelog entries */
  changelog?: ChangelogEntry[];
}

/** Package categories for the manager UI */
export type PackageCategory =
  | "setup"           // System setup / tool installation
  | "training"        // Training configs & scripts
  | "nodes"           // ComfyUI custom node packs
  | "models"          // Model download lists
  | "utility"         // Cleanup, diagnostics, audit tools
  | "custom";         // User-created packages

/** System requirements that the app checks before running */
export interface PackageRequirements {
  /** Python version range (e.g. ">=3.10,<=3.12") */
  python?: string;
  /** Required GPU vendor */
  gpu?: "nvidia" | "amd" | "any";
  /** Target OS */
  os?: "windows" | "linux" | "macos" | "any";
  /** Minimum VRAM in MB */
  minVramMb?: number;
  /** Minimum system RAM in GB */
  minRamGb?: number;
  /** Other packages that must be installed first */
  dependsOn?: string[];
}

// ── Actions ──────────────────────────────────────────────────

/** A single executable action within a package */
export interface PackageAction {
  /** Unique ID within this package (e.g. "install_comfyui") */
  id: string;
  /** Display label (e.g. "Install ComfyUI") */
  label: string;
  /** Lucide icon name */
  icon?: string;
  /** Short description */
  description: string;
  /** Action group for UI organization */
  group?: string;
  /** Whether this action requires admin privileges */
  admin?: boolean;
  /** Whether to show a confirmation dialog before running */
  confirmRequired?: boolean;
  /** Confirmation message (if confirmRequired) */
  confirmMessage?: string;
  /** Danger level for UI styling */
  danger?: "none" | "low" | "medium" | "critical";
  /** Ordered list of steps to execute */
  steps: ActionStep[];
  /** Estimated duration in seconds (for progress display) */
  estimatedDurationSec?: number;
}

/** A single step within an action */
export interface ActionStep {
  /** Script file to run (relative to package root) */
  run: string;
  /** Script type (determines how the app executes it) */
  type: "bat" | "python" | "powershell" | "shell";
  /** Arguments to pass to the script */
  args?: string[];
  /** Environment variables to set for this step */
  env?: Record<string, string>;
  /** Whether this step needs admin */
  admin?: boolean;
  /** Working directory (relative to AI workspace root) */
  workdir?: string;
  /** Display label for this step in progress UI */
  label?: string;
  /** Whether failure of this step should stop the action */
  critical?: boolean;
  /** Timeout in seconds (0 = no timeout) */
  timeoutSec?: number;
}

// ── Configs ──────────────────────────────────────────────────

/** A config file template that can be edited in the app */
export interface PackageConfig {
  /** Unique ID within this package */
  id: string;
  /** Display label */
  label: string;
  /** Short description */
  description?: string;
  /** Source file within the package */
  file: string;
  /** Target path (with {PLACEHOLDER} variables) */
  target: string;
  /** Config format (determines editor mode) */
  format: "toml" | "yaml" | "json" | "ini" | "text";
  /** Whether users should edit this before running */
  editable: boolean;
  /** Variables that need user input before deploying */
  variables?: ConfigVariable[];
}

/** A variable placeholder within a config template */
export interface ConfigVariable {
  /** Placeholder name (e.g. "TRAINING_DATA_DIR") */
  name: string;
  /** Display label */
  label: string;
  /** Default value */
  defaultValue: string;
  /** Input type for the editor */
  inputType: "text" | "path" | "number" | "select";
  /** Options for select type */
  options?: string[];
  /** Help text */
  description?: string;
}

// ── Files ────────────────────────────────────────────────────

/** A file within the package */
export interface PackageFile {
  /** Relative path within the package */
  path: string;
  /** File type */
  type: "script" | "config" | "readme" | "data" | "template" | "other";
  /** File size in bytes */
  size?: number;
  /** SHA-256 hash for integrity verification */
  sha256?: string;
}

// ── Changelog ────────────────────────────────────────────────

/** A changelog entry for version tracking */
export interface ChangelogEntry {
  /** Version this entry is for */
  version: string;
  /** ISO date */
  date: string;
  /** List of changes */
  changes: string[];
}

// ── Nodes (ComfyUI) ─────────────────────────────────────────

/** ComfyUI custom node entry */
export interface CustomNodeEntry {
  /** Node name (repo folder name) */
  name: string;
  /** Git clone URL */
  url: string;
  /** Short description */
  description: string;
  /** Whether it's essential / recommended */
  essential?: boolean;
  /** Category tag */
  category?: string;
}

// ── Runtime State ────────────────────────────────────────────
// These types track package state in the app (not in the manifest)

/** Installation status of a package */
export type PackageStatus =
  | "not-installed"
  | "installed"
  | "update-available"
  | "installing"
  | "error";

/** A package as tracked by the app (manifest + runtime state) */
export interface InstalledPackage {
  /** The manifest from the package */
  manifest: PackageManifest;
  /** Current status */
  status: PackageStatus;
  /** When this package was installed */
  installedAt: string;
  /** When it was last run */
  lastRunAt?: string;
  /** Path where the package is extracted */
  extractedPath: string;
  /** Whether a newer version is available */
  updateAvailable?: string;
  /** Error message if status is "error" */
  error?: string;
}

/** Action execution state */
export interface ActionExecution {
  /** Package ID */
  packageId: string;
  /** Action ID */
  actionId: string;
  /** Current step index (0-based) */
  currentStep: number;
  /** Total steps */
  totalSteps: number;
  /** Whether running */
  running: boolean;
  /** Exit code of last step (null if still running) */
  exitCode: number | null;
  /** Start time */
  startTime: number;
  /** Terminal output lines */
  lines: import("./setupService").TerminalLine[];
}

// ── Package Source ───────────────────────────────────────────

/** Where a package came from (for update checks) */
export interface PackageSource {
  type: "local" | "url" | "ai-generated";
  /** URL to check for updates (if type is "url") */
  updateUrl?: string;
  /** Original zip filename */
  filename?: string;
}
