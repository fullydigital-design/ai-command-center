// ============================================================
// Package Manager Page — Script Package browser & runner
// ============================================================
// Domain: package lifecycle (list, detail, run, config edit)
// ============================================================

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  Package,
  Rocket,
  Puzzle,
  Image,
  Film,
  HardDrive,
  RefreshCw,
  Play,
  ChevronRight,
  ArrowLeft,
  Download,
  Trash2,
  FileText,
  Settings2,
  Clock,
  CheckCircle2,
  AlertCircle,
  ArrowUpCircle,
  Loader2,
  Search,
  Upload,
  Sparkles,
  FolderOpen,
  Code,
  Shield,
  Tag,
  CalendarDays,
  User,
  ExternalLink,
  Copy,
  Check,
  ChevronDown,
  X,
  Cpu,
  Palette,
  Bug,
  FlaskConical,
  Stethoscope,
  FolderSearch,
  Route,
  RotateCcw,
  FileOutput,
} from "lucide-react";

import type {
  InstalledPackage,
  PackageManifest,
  PackageAction,
  PackageCategory,
  PackageConfig,
  PackageStatus,
  ChangelogEntry,
} from "../services/packageTypes";
import type { TerminalLine } from "../services/setupService";
import {
  listPackages,
  runAction,
  stopAction,
  getPackageReadme,
  getConfigContent,
  saveConfigContent,
  checkForUpdates,
} from "../services/packageService";
import { TerminalOutput } from "./ui/TerminalOutput";
import { classifyLine } from "../services/setupService";
import { useLauncherBridge } from "../hooks/useLauncherBridge";
import { LAUNCHABLE_TOOL_IDS } from "../services/toolsRegistry";
import { AiPackageGenerator } from "./AiPackageGenerator";
import { toast } from "sonner";
import { useDebouncedValue } from "../hooks/useDebouncedValue";
import { useEscapeKey } from "../hooks/useEscapeKey";
import { PackageCardSkeleton } from "./skeletons";

// ── Icon resolver ────────────────────────────────────────────

const ICON_MAP: Record<string, typeof Package> = {
  Rocket, Package, Puzzle, Image, Film, HardDrive, RefreshCw, Play,
  Download, Trash2, FileText, Settings2, Code, Cpu, Palette, Bug,
  FlaskConical, Stethoscope, FolderSearch, Route, RotateCcw, FileOutput,
  Sparkles, Shield, Upload, FolderOpen,
};

function resolveIcon(name?: string) {
  if (!name) return Package;
  return ICON_MAP[name] ?? Package;
}

// ── Category metadata ────────────────────────────────────────

const CATEGORY_META: Record<PackageCategory, { label: string; color: string; icon: typeof Package }> = {
  setup:    { label: "Setup",    color: "#6d5aff", icon: Rocket },
  training: { label: "Training", color: "#ff6b6b", icon: FlaskConical },
  nodes:    { label: "Nodes",    color: "#6d5aff", icon: Puzzle },
  models:   { label: "Models",   color: "#00d4aa", icon: HardDrive },
  utility:  { label: "Utility",  color: "#ff9f43", icon: Settings2 },
  custom:   { label: "Custom",   color: "#4ecdc4", icon: Sparkles },
};

// ── Status badge ─────────────────────────────────────────────

function StatusBadge({ status, updateVersion }: { status: PackageStatus; updateVersion?: string }) {
  const map: Record<PackageStatus, { label: string; color: string; bg: string; icon?: typeof CheckCircle2 }> = {
    "installed":        { label: "Installed",        color: "text-emerald-400", bg: "bg-emerald-500/10", icon: CheckCircle2 },
    "not-installed":    { label: "Not Installed",    color: "text-zinc-500",    bg: "bg-zinc-500/10" },
    "update-available": { label: `Update ${updateVersion ?? ""}`, color: "text-amber-400", bg: "bg-amber-500/10", icon: ArrowUpCircle },
    "installing":       { label: "Installing...",    color: "text-blue-400",    bg: "bg-blue-500/10",   icon: Loader2 },
    "error":            { label: "Error",            color: "text-red-400",     bg: "bg-red-500/10",    icon: AlertCircle },
  };
  const s = updateVersion ? map["update-available"] : map[status];
  const Icon = s.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] ${s.color} ${s.bg}`}>
      {Icon && <Icon className={`w-3 h-3 ${status === "installing" ? "animate-spin" : ""}`} />}
      {s.label}
    </span>
  );
}

// ── Main Page ────────────────────────────────────────────────

export function PackageManagerPage() {
  const [packages, setPackages] = useState<InstalledPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearch = useDebouncedValue(searchQuery, 250);
  const [categoryFilter, setCategoryFilter] = useState<PackageCategory | "all">("all");
  const [selectedPkg, setSelectedPkg] = useState<InstalledPackage | null>(null);
  const [detailTab, setDetailTab] = useState<"actions" | "configs" | "readme" | "changelog" | "files">("actions");
  const [showAiGenerator, setShowAiGenerator] = useState(false);
  const bridge = useLauncherBridge();

  // Terminal state
  const [terminalLines, setTerminalLines] = useState<TerminalLine[]>([]);
  const [terminalRunning, setTerminalRunning] = useState(false);
  const [terminalTitle, setTerminalTitle] = useState("Terminal");
  const [terminalVisible, setTerminalVisible] = useState(false);
  const [currentStreamId, setCurrentStreamId] = useState<string | null>(null);

  // Config editor state
  const [editingConfig, setEditingConfig] = useState<PackageConfig | null>(null);
  const [configContent, setConfigContent] = useState("");
  const [configSaving, setConfigSaving] = useState(false);
  const [configSaved, setConfigSaved] = useState(false);

  // README state
  const [readmeContent, setReadmeContent] = useState<string | null>(null);
  const [readmeLoading, setReadmeLoading] = useState(false);

  // Confirm dialog
  const [confirmAction, setConfirmAction] = useState<PackageAction | null>(null);
  const [confirmInput, setConfirmInput] = useState("");

  // Updates
  const [updates, setUpdates] = useState<Array<{ packageId: string; newVersion: string }>>([]);

  // ── Load packages ──
  const loadPkgs = useCallback(async () => {
    setLoading(true);
    try {
      const pkgs = await listPackages();
      const upds = await checkForUpdates();
      setPackages(pkgs);
      setUpdates(upds);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadPkgs(); }, [loadPkgs]);

  // ── Consume pending package from bridge (cross-page navigation) ──
  useEffect(() => {
    if (bridge.pendingPackage && packages.length > 0) {
      const pkg = packages.find((p) => p.manifest.id === bridge.pendingPackage);
      if (pkg) {
        selectPackage(pkg);
      }
      bridge.clearPending();
    }
  }, [bridge.pendingPackage, packages]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─ Filtered packages ──
  const filtered = useMemo(() => {
    let result = packages;
    if (categoryFilter !== "all") {
      result = result.filter((p) => p.manifest.category === categoryFilter);
    }
    if (debouncedSearch.trim()) {
      const q = debouncedSearch.toLowerCase();
      result = result.filter(
        (p) =>
          p.manifest.name.toLowerCase().includes(q) ||
          p.manifest.description.toLowerCase().includes(q) ||
          p.manifest.tags.some((t) => t.includes(q))
      );
    }
    return result;
  }, [packages, categoryFilter, debouncedSearch]);

  // ── Run action ──
  const handleRunAction = useCallback(
    async (pkg: InstalledPackage, action: PackageAction) => {
      if (action.confirmRequired) {
        setConfirmAction(action);
        setConfirmInput("");
        return;
      }
      executeAction(pkg, action);
    },
    []
  );

  const executeAction = useCallback(
    async (pkg: InstalledPackage, action: PackageAction) => {
      setTerminalLines([]);
      setTerminalRunning(true);
      setTerminalTitle(`${pkg.manifest.name} — ${action.label}`);
      setTerminalVisible(true);
      setConfirmAction(null);

      const { streamId } = await runAction(
        pkg.manifest.id,
        action.id,
        (line) => setTerminalLines((prev) => [...prev, line]),
        (exitCode) => {
          setTerminalRunning(false);
          // Add completion line
          const type = exitCode === 0 ? "ok" : "error";
          setTerminalLines((prev) => [
            ...prev,
            {
              id: prev.length,
              text: exitCode === 0
                ? `\n  Action completed successfully (exit code: ${exitCode})`
                : `\n  Action failed (exit code: ${exitCode})`,
              type: classifyLine(exitCode === 0 ? "[OK]" : "[ERROR]"),
              timestamp: Date.now(),
            },
          ]);
        }
      );
      setCurrentStreamId(streamId);
    },
    []
  );

  const handleStopAction = useCallback(() => {
    if (currentStreamId) {
      stopAction(currentStreamId);
      setTerminalRunning(false);
    }
  }, [currentStreamId]);

  // ── Load README ──
  const loadReadme = useCallback(async (pkgId: string) => {
    setReadmeLoading(true);
    try {
      const content = await getPackageReadme(pkgId);
      setReadmeContent(content);
    } finally {
      setReadmeLoading(false);
    }
  }, []);

  // ── Open config editor ──
  const openConfigEditor = useCallback(async (pkg: InstalledPackage, config: PackageConfig) => {
    setEditingConfig(config);
    setConfigSaved(false);
    const content = await getConfigContent(pkg.manifest.id, config.id);
    setConfigContent(content ?? "");
  }, []);

  const handleSaveConfig = useCallback(async () => {
    if (!selectedPkg || !editingConfig) return;
    setConfigSaving(true);
    await saveConfigContent(selectedPkg.manifest.id, editingConfig.id, configContent);
    setConfigSaving(false);
    setConfigSaved(true);
    toast.success(`Config "${editingConfig.label}" saved`);
    setTimeout(() => setConfigSaved(false), 2000);
  }, [selectedPkg, editingConfig, configContent]);

  // ── Select package ──
  const selectPackage = useCallback(
    (pkg: InstalledPackage) => {
      setSelectedPkg(pkg);
      setDetailTab("actions");
      setEditingConfig(null);
      loadReadme(pkg.manifest.id);
    },
    [loadReadme]
  );

  // ── Package card ──
  const getUpdate = (pkgId: string) => updates.find((u) => u.packageId === pkgId);

  // ════════════════════════════════════════════════════════════
  //  RENDER
  // ════════════════════���═══════════════════════════════════════

  // Detail view (single package)
  if (selectedPkg) {
    return (
      <div className="flex flex-col h-full">
        <PackageDetailView
          pkg={selectedPkg}
          detailTab={detailTab}
          setDetailTab={setDetailTab}
          onBack={() => { setSelectedPkg(null); setEditingConfig(null); }}
          onRunAction={(action) => handleRunAction(selectedPkg, action)}
          onOpenConfig={(config) => openConfigEditor(selectedPkg, config)}
          editingConfig={editingConfig}
          configContent={configContent}
          setConfigContent={setConfigContent}
          onSaveConfig={handleSaveConfig}
          configSaving={configSaving}
          configSaved={configSaved}
          onCloseConfig={() => setEditingConfig(null)}
          readmeContent={readmeContent}
          readmeLoading={readmeLoading}
          updateVersion={getUpdate(selectedPkg.manifest.id)?.newVersion}
          onLaunchTool={(toolId) => bridge.launchTool(toolId)}
        />
        {/* Terminal overlay */}
        {terminalVisible && (
          <div className="border-t border-border">
            <TerminalOutput
              lines={terminalLines}
              title={terminalTitle}
              running={terminalRunning}
              onClose={() => setTerminalVisible(false)}
              onStop={terminalRunning ? handleStopAction : undefined}
              maxHeight={300}
              animated
            />
          </div>
        )}
        {/* Confirm dialog */}
        {confirmAction && (
          <ConfirmDialog
            action={confirmAction}
            input={confirmInput}
            setInput={setConfirmInput}
            onConfirm={() => executeAction(selectedPkg, confirmAction)}
            onCancel={() => { setConfirmAction(null); setConfirmInput(""); }}
          />
        )}
      </div>
    );
  }

  // List view (all packages)
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 pt-5 pb-4 border-b border-border shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-foreground flex items-center gap-2">
              Script Packages
              <Package className="w-4 h-4 text-muted-foreground" />
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Manage setup scripts, training configs, and tool packages
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={loadPkgs}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-foreground bg-secondary/50 hover:bg-secondary transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </button>
            <button
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-foreground bg-secondary/50 hover:bg-secondary transition-colors opacity-50 cursor-not-allowed"
              title="Import .zip package (requires Tauri)"
            >
              <Upload className="w-3.5 h-3.5" />
              Import
            </button>
            <button
              onClick={() => setShowAiGenerator(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
            >
              <Sparkles className="w-3.5 h-3.5" />
              Generate with AI
            </button>
          </div>
        </div>

        {/* Search + filters */}
        <div className="flex items-center gap-3 mt-3">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search packages..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 rounded-lg bg-secondary/50 border border-border text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/30"
            />
          </div>
          <div className="flex items-center gap-1">
            <FilterChip
              label="All"
              active={categoryFilter === "all"}
              onClick={() => setCategoryFilter("all")}
            />
            {(Object.keys(CATEGORY_META) as PackageCategory[]).map((cat) => (
              <FilterChip
                key={cat}
                label={CATEGORY_META[cat].label}
                active={categoryFilter === cat}
                onClick={() => setCategoryFilter(cat)}
                color={CATEGORY_META[cat].color}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Package grid */}
      <div className="flex-1 overflow-auto p-6">
        {loading ? (
          <PackageCardSkeleton count={6} />
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground text-sm">
            No packages found matching your search.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filtered.map((pkg) => (
              <PackageCard
                key={pkg.manifest.id}
                pkg={pkg}
                updateVersion={getUpdate(pkg.manifest.id)?.newVersion}
                onClick={() => selectPackage(pkg)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Terminal overlay (list view) */}
      {terminalVisible && (
        <div className="border-t border-border">
          <TerminalOutput
            lines={terminalLines}
            title={terminalTitle}
            running={terminalRunning}
            onClose={() => setTerminalVisible(false)}
            onStop={terminalRunning ? handleStopAction : undefined}
            maxHeight={280}
            animated
          />
        </div>
      )}

      {/* AI Package Generator overlay */}
      {showAiGenerator && (
        <AiPackageGenerator
          onClose={() => setShowAiGenerator(false)}
          onImported={() => loadPkgs()}
        />
      )}
    </div>
  );
}

// ── Package Card ─────────────────────────────────────────────

function PackageCard({
  pkg,
  updateVersion,
  onClick,
}: {
  pkg: InstalledPackage;
  updateVersion?: string;
  onClick: () => void;
}) {
  const m = pkg.manifest;
  const cat = CATEGORY_META[m.category];
  const Icon = resolveIcon(m.icon);

  return (
    <button
      onClick={onClick}
      className="text-left rounded-xl border border-border bg-card hover:bg-card/80 transition-all hover:border-primary/30 group overflow-hidden"
    >
      {/* Color accent bar */}
      <div className="h-1" style={{ background: m.color ?? cat.color }} />

      <div className="p-4 space-y-3">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2.5">
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
              style={{ background: `${m.color ?? cat.color}15` }}
            >
              <Icon className="w-4.5 h-4.5" style={{ color: m.color ?? cat.color }} />
            </div>
            <div className="min-w-0">
              <div className="text-sm text-foreground truncate group-hover:text-primary transition-colors">
                {m.name}
              </div>
              <div className="text-[10px] text-muted-foreground flex items-center gap-1.5">
                <span style={{ color: cat.color }}>{cat.label}</span>
                <span>·</span>
                <span>v{m.version}</span>
              </div>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity mt-1" />
        </div>

        {/* Description */}
        <p className="text-[11px] text-muted-foreground line-clamp-2 leading-relaxed">
          {m.description}
        </p>

        {/* Footer */}
        <div className="flex items-center justify-between">
          <StatusBadge status={pkg.status} updateVersion={updateVersion} />
          <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-0.5">
              <Play className="w-3 h-3" />
              {m.actions.length}
            </span>
            {m.configs && m.configs.length > 0 && (
              <span className="flex items-center gap-0.5">
                <FileText className="w-3 h-3" />
                {m.configs.length}
              </span>
            )}
            <span className="flex items-center gap-0.5">
              <Code className="w-3 h-3" />
              {m.files.filter((f) => f.type === "script").length}
            </span>
          </div>
        </div>

        {/* Tags */}
        {m.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {m.tags.slice(0, 5).map((tag) => (
              <span
                key={tag}
                className="px-1.5 py-0.5 rounded text-[9px] bg-secondary/50 text-muted-foreground"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>
    </button>
  );
}

// ── Filter Chip ──────────────────────────────────────────────

function FilterChip({
  label,
  active,
  onClick,
  color,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  color?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-2.5 py-1 rounded-lg text-[11px] transition-all ${
        active
          ? "bg-primary/15 text-primary"
          : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
      }`}
      style={active && color ? { color, background: `${color}15` } : undefined}
    >
      {label}
    </button>
  );
}

// ── Package Detail View ──────────────────────────────────────

function PackageDetailView({
  pkg,
  detailTab,
  setDetailTab,
  onBack,
  onRunAction,
  onOpenConfig,
  editingConfig,
  configContent,
  setConfigContent,
  onSaveConfig,
  configSaving,
  configSaved,
  onCloseConfig,
  readmeContent,
  readmeLoading,
  updateVersion,
  onLaunchTool,
}: {
  pkg: InstalledPackage;
  detailTab: string;
  setDetailTab: (tab: "actions" | "configs" | "readme" | "changelog" | "files") => void;
  onBack: () => void;
  onRunAction: (action: PackageAction) => void;
  onOpenConfig: (config: PackageConfig) => void;
  editingConfig: PackageConfig | null;
  configContent: string;
  setConfigContent: (s: string) => void;
  onSaveConfig: () => void;
  configSaving: boolean;
  configSaved: boolean;
  onCloseConfig: () => void;
  readmeContent: string | null;
  readmeLoading: boolean;
  updateVersion?: string;
  onLaunchTool?: (toolId: string) => void;
}) {
  const m = pkg.manifest;
  const cat = CATEGORY_META[m.category];
  const Icon = resolveIcon(m.icon);

  // Group actions by group property
  const actionGroups = useMemo(() => {
    const groups: Record<string, PackageAction[]> = {};
    for (const action of m.actions) {
      const group = action.group ?? "Other";
      if (!groups[group]) groups[group] = [];
      groups[group].push(action);
    }
    return groups;
  }, [m.actions]);

  const tabs = [
    { id: "actions" as const, label: "Actions", count: m.actions.length },
    ...(m.configs && m.configs.length > 0
      ? [{ id: "configs" as const, label: "Configs", count: m.configs.length }]
      : []),
    ...(m.readme ? [{ id: "readme" as const, label: "README", count: 0 }] : []),
    ...(m.changelog && m.changelog.length > 0
      ? [{ id: "changelog" as const, label: "Changelog", count: m.changelog.length }]
      : []),
    { id: "files" as const, label: "Files", count: m.files.length },
  ];

  return (
    <div className="flex-1 overflow-auto">
      {/* Header */}
      <div className="px-6 pt-4 pb-4 border-b border-border">
        <button
          onClick={onBack}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-3 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to packages
        </button>

        <div className="flex items-start gap-4">
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: `${m.color ?? cat.color}15` }}
          >
            <Icon className="w-6 h-6" style={{ color: m.color ?? cat.color }} />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3">
              <h2 className="text-foreground truncate">{m.name}</h2>
              <StatusBadge status={pkg.status} updateVersion={updateVersion} />
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">{m.description}</p>

            {/* Meta row */}
            <div className="flex items-center gap-4 mt-2 text-[10px] text-muted-foreground">
              <span className="flex items-center gap-1">
                <Tag className="w-3 h-3" />
                v{m.version}
              </span>
              <span className="flex items-center gap-1">
                <User className="w-3 h-3" />
                {m.author}
              </span>
              <span className="flex items-center gap-1">
                <CalendarDays className="w-3 h-3" />
                {new Date(m.updated).toLocaleDateString()}
              </span>
              {pkg.lastRunAt && (
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  Last run: {new Date(pkg.lastRunAt).toLocaleDateString()}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 mt-4">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setDetailTab(tab.id)}
              className={`px-3 py-1.5 rounded-lg text-[11px] transition-all ${
                detailTab === tab.id
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
              }`}
            >
              {tab.label}
              {tab.count > 0 && (
                <span className="ml-1 opacity-50">({tab.count})</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="p-6">
        {/* ACTIONS TAB */}
        {detailTab === "actions" && (
          <div className="space-y-6">
            {Object.entries(actionGroups).map(([group, actions]) => (
              <div key={group}>
                <h3 className="text-xs text-muted-foreground mb-2 flex items-center gap-1.5">
                  <span className="uppercase tracking-wider">{group}</span>
                  <span className="flex-1 h-px bg-border" />
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {actions.map((action) => (
                    <ActionCard
                      key={action.id}
                      action={action}
                      color={m.color ?? cat.color}
                      onRun={() => onRunAction(action)}
                      onLaunchTool={onLaunchTool}
                    />
                  ))}
                </div>
              </div>
            ))}

            {/* Quick Launch section — for packages that relate to launchable tools */}
            {onLaunchTool && m.category === "setup" && (
              <div>
                <h3 className="text-xs text-muted-foreground mb-2 flex items-center gap-1.5">
                  <span className="uppercase tracking-wider">Quick Launch</span>
                  <span className="flex-1 h-px bg-border" />
                </h3>
                <p className="text-[10px] text-muted-foreground mb-2">
                  Open a tool in Quick Launcher with full flag configuration
                </p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {(LAUNCHABLE_TOOL_IDS as readonly string[]).map((toolId) => {
                    const toolNames: Record<string, { name: string; color: string; emoji: string }> = {
                      comfyui: { name: "ComfyUI", color: "#6d5aff", emoji: "\uD83C\uDFA8" },
                      swarmui: { name: "SwarmUI", color: "#00d4aa", emoji: "\uD83D\uDC1D" },
                      kohya: { name: "Kohya SS", color: "#ff6b6b", emoji: "\uD83D\uDD2C" },
                      musubi: { name: "Musubi", color: "#ffd93d", emoji: "\uD83C\uDFAC" },
                    };
                    const info = toolNames[toolId] ?? { name: toolId, color: "#888", emoji: "\uD83D\uDCE6" };
                    return (
                      <button
                        key={toolId}
                        onClick={() => onLaunchTool(toolId)}
                        className="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-border bg-card/50 hover:bg-card hover:border-primary/30 transition-all text-left group"
                      >
                        <span className="text-sm">{info.emoji}</span>
                        <div className="flex-1 min-w-0">
                          <div className="text-[11px] text-foreground group-hover:text-primary transition-colors">
                            {info.name}
                          </div>
                          <div className="text-[9px] text-muted-foreground">
                            Open Launcher
                          </div>
                        </div>
                        <ExternalLink className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* CONFIGS TAB */}
        {detailTab === "configs" && m.configs && (
          <div className="space-y-3">
            {editingConfig ? (
              <ConfigEditor
                config={editingConfig}
                content={configContent}
                setContent={setConfigContent}
                onSave={onSaveConfig}
                saving={configSaving}
                saved={configSaved}
                onClose={onCloseConfig}
              />
            ) : (
              m.configs.map((config) => (
                <ConfigCard
                  key={config.id}
                  config={config}
                  onEdit={() => onOpenConfig(config)}
                />
              ))
            )}
          </div>
        )}

        {/* README TAB */}
        {detailTab === "readme" && (
          <div className="rounded-xl border border-border bg-card p-5">
            {readmeLoading ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            ) : readmeContent ? (
              <ReadmeRenderer content={readmeContent} />
            ) : (
              <p className="text-muted-foreground text-sm text-center py-10">
                No README available for this package.
              </p>
            )}
          </div>
        )}

        {/* CHANGELOG TAB */}
        {detailTab === "changelog" && m.changelog && (
          <div className="space-y-4">
            {m.changelog.map((entry) => (
              <ChangelogCard key={entry.version} entry={entry} />
            ))}
          </div>
        )}

        {/* FILES TAB */}
        {detailTab === "files" && (
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="px-4 py-2.5 bg-secondary/30 border-b border-border">
              <span className="text-xs text-muted-foreground">
                {m.files.length} files in package
              </span>
            </div>
            <div className="divide-y divide-border">
              {m.files.map((file) => (
                <div
                  key={file.path}
                  className="px-4 py-2 flex items-center gap-3 text-xs hover:bg-secondary/20 transition-colors"
                >
                  <FileTypeIcon type={file.type} />
                  <span className="text-foreground flex-1" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                    {file.path}
                  </span>
                  <span className="text-muted-foreground text-[10px]">
                    {file.type}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Action Card ──────────────────────────────────────────────

function ActionCard({
  action,
  color,
  onRun,
  onLaunchTool,
}: {
  action: PackageAction;
  color: string;
  onRun: () => void;
  onLaunchTool?: (toolId: string) => void;
}) {
  const Icon = resolveIcon(action.icon);
  const dangerColors: Record<string, string> = {
    none: "",
    low: "",
    medium: "border-amber-500/20 hover:border-amber-500/40",
    critical: "border-red-500/20 hover:border-red-500/40",
  };

  // Detect if this action maps to a launchable tool (e.g. "launch_comfyui", "start_comfyui")
  const matchedToolId = (LAUNCHABLE_TOOL_IDS as readonly string[]).find(
    (id) => action.id.includes(id) && (action.id.startsWith("launch") || action.id.startsWith("start"))
  );

  return (
    <div
      className={`rounded-lg border border-border bg-card/50 p-3 flex items-start gap-3 hover:bg-card transition-colors ${
        dangerColors[action.danger ?? "none"]
      }`}
    >
      <div
        className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
        style={{ background: `${color}12` }}
      >
        <Icon className="w-4 h-4" style={{ color }} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs text-foreground">{action.label}</div>
        <div className="text-[10px] text-muted-foreground mt-0.5 line-clamp-1">
          {action.description}
        </div>
        {action.estimatedDurationSec && (
          <div className="text-[9px] text-muted-foreground mt-1 flex items-center gap-1">
            <Clock className="w-2.5 h-2.5" />
            ~{Math.ceil(action.estimatedDurationSec / 60)}m
          </div>
        )}
      </div>
      <div className="flex flex-col gap-1 shrink-0">
        <button
          onClick={onRun}
          className="px-2.5 py-1.5 rounded-md text-[10px] bg-primary/10 text-primary hover:bg-primary/20 transition-colors flex items-center gap-1"
        >
          <Play className="w-3 h-3" />
          Run
        </button>
        {matchedToolId && onLaunchTool && (
          <button
            onClick={() => onLaunchTool(matchedToolId)}
            className="px-2.5 py-1.5 rounded-md text-[10px] bg-secondary text-muted-foreground hover:text-foreground hover:bg-secondary/80 transition-colors flex items-center gap-1"
            title="Configure flags & launch in Quick Launcher"
          >
            <Rocket className="w-3 h-3" />
            Launcher
          </button>
        )}
      </div>
    </div>
  );
}

// ── Config Card ──────────────────────────────────────────────

function ConfigCard({
  config,
  onEdit,
}: {
  config: PackageConfig;
  onEdit: () => void;
}) {
  return (
    <div className="rounded-lg border border-border bg-card/50 p-3 flex items-start gap-3">
      <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-amber-500/10">
        <FileText className="w-4 h-4 text-amber-400" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs text-foreground">{config.label}</div>
        <div className="text-[10px] text-muted-foreground mt-0.5">
          {config.description}
        </div>
        <div
          className="text-[9px] text-muted-foreground mt-1"
          style={{ fontFamily: "'JetBrains Mono', monospace" }}
        >
          {config.file} → {config.target}
        </div>
        {config.variables && config.variables.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1.5">
            {config.variables.map((v) => (
              <span
                key={v.name}
                className="px-1.5 py-0.5 rounded text-[9px] bg-blue-500/10 text-blue-400"
              >
                {v.label}
              </span>
            ))}
          </div>
        )}
      </div>
      <button
        onClick={onEdit}
        className="shrink-0 px-2.5 py-1.5 rounded-md text-[10px] bg-secondary text-foreground hover:bg-secondary/80 transition-colors flex items-center gap-1"
      >
        <Settings2 className="w-3 h-3" />
        Edit
      </button>
    </div>
  );
}

// ── Config Editor ────────────────────────────────────────────

function ConfigEditor({
  config,
  content,
  setContent,
  onSave,
  saving,
  saved,
  onClose,
}: {
  config: PackageConfig;
  content: string;
  setContent: (s: string) => void;
  onSave: () => void;
  saving: boolean;
  saved: boolean;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    toast.success("Config copied to clipboard");
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {/* Editor header */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-secondary/30 border-b border-border">
        <div className="flex items-center gap-2">
          <FileText className="w-3.5 h-3.5 text-amber-400" />
          <span className="text-xs text-foreground">{config.label}</span>
          <span
            className="text-[10px] text-muted-foreground px-1.5 py-0.5 rounded bg-secondary"
            style={{ fontFamily: "'JetBrains Mono', monospace" }}
          >
            {config.format}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleCopy}
            className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors"
            title="Copy"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={onSave}
            disabled={saving}
            className="px-2.5 py-1 rounded-md text-[10px] bg-primary/10 text-primary hover:bg-primary/20 transition-colors flex items-center gap-1 disabled:opacity-50"
          >
            {saving ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : saved ? (
              <Check className="w-3 h-3" />
            ) : (
              <Download className="w-3 h-3" />
            )}
            {saved ? "Saved" : "Save"}
          </button>
          <button
            onClick={onClose}
            className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Variables (if any) */}
      {config.variables && config.variables.length > 0 && (
        <div className="px-4 py-3 bg-blue-500/5 border-b border-border space-y-2">
          <span className="text-[10px] text-blue-400 uppercase tracking-wider">
            Variables — edit these before deploying
          </span>
          {config.variables.map((v) => (
            <div key={v.name} className="flex items-center gap-2">
              <label className="text-[10px] text-muted-foreground w-40 shrink-0">
                {v.label}
              </label>
              <input
                type="text"
                defaultValue={v.defaultValue}
                className="flex-1 px-2 py-1 rounded bg-secondary/50 border border-border text-[11px] text-foreground focus:outline-none focus:ring-1 focus:ring-primary/30"
                style={{ fontFamily: "'JetBrains Mono', monospace" }}
              />
            </div>
          ))}
        </div>
      )}

      {/* Code editor */}
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        className="w-full bg-code-bg text-code-foreground p-4 text-[11px] leading-relaxed resize-none focus:outline-none"
        style={{ fontFamily: "'JetBrains Mono', monospace", minHeight: 400 }}
        spellCheck={false}
      />
    </div>
  );
}

// ── README Renderer (simple markdown-ish) ───────────────────

function ReadmeRenderer({ content }: { content: string }) {
  // Simple markdown rendering
  const lines = content.split("\n");

  return (
    <div className="space-y-2" style={{ fontFamily: "'Inter', sans-serif" }}>
      {lines.map((line, i) => {
        // Headers
        if (line.startsWith("### "))
          return <h4 key={i} className="text-foreground text-xs mt-4 mb-1">{line.slice(4)}</h4>;
        if (line.startsWith("## "))
          return <h3 key={i} className="text-foreground text-sm mt-5 mb-1.5 pb-1 border-b border-border">{line.slice(3)}</h3>;
        if (line.startsWith("# "))
          return <h2 key={i} className="text-foreground mt-2 mb-2">{line.slice(2)}</h2>;

        // Code blocks
        if (line.startsWith("```"))
          return <div key={i} className="h-0" />;

        // List items
        if (line.startsWith("- "))
          return (
            <div key={i} className="flex gap-2 text-xs text-muted-foreground pl-2">
              <span className="text-primary shrink-0">•</span>
              <span>{renderInlineCode(line.slice(2))}</span>
            </div>
          );

        // Numbered lists
        if (/^\d+\.\s/.test(line)) {
          const [num, ...rest] = line.split(/\.\s/);
          return (
            <div key={i} className="flex gap-2 text-xs text-muted-foreground pl-2">
              <span className="text-primary shrink-0">{num}.</span>
              <span>{renderInlineCode(rest.join(". "))}</span>
            </div>
          );
        }

        // Empty lines
        if (!line.trim()) return <div key={i} className="h-2" />;

        // Regular text
        return (
          <p key={i} className="text-xs text-muted-foreground leading-relaxed">
            {renderInlineCode(line)}
          </p>
        );
      })}
    </div>
  );
}

function renderInlineCode(text: string) {
  const parts = text.split(/(`[^`]+`)/g);
  return parts.map((part, i) => {
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code
          key={i}
          className="px-1 py-0.5 rounded bg-secondary/80 text-[10px] text-foreground"
          style={{ fontFamily: "'JetBrains Mono', monospace" }}
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    // Bold
    const boldParts = part.split(/(\*\*[^*]+\*\*)/g);
    return boldParts.map((bp, j) => {
      if (bp.startsWith("**") && bp.endsWith("**")) {
        return <strong key={`${i}-${j}`} className="text-foreground">{bp.slice(2, -2)}</strong>;
      }
      return <span key={`${i}-${j}`}>{bp}</span>;
    });
  });
}

// ─ Changelog Card ───────────────────────────────────────────

function ChangelogCard({ entry }: { entry: ChangelogEntry }) {
  return (
    <div className="rounded-lg border border-border bg-card/50 p-4">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs text-primary px-1.5 py-0.5 rounded bg-primary/10">
          v{entry.version}
        </span>
        <span className="text-[10px] text-muted-foreground">{entry.date}</span>
      </div>
      <div className="space-y-1">
        {entry.changes.map((change, i) => (
          <div key={i} className="flex gap-2 text-[11px] text-muted-foreground">
            <span className="text-emerald-400 shrink-0">+</span>
            <span>{change}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── File Type Icon ───────────────────────────────────────────

function FileTypeIcon({ type }: { type: string }) {
  const map: Record<string, { icon: typeof FileText; color: string }> = {
    script: { icon: Code, color: "text-emerald-400" },
    config: { icon: Settings2, color: "text-amber-400" },
    readme: { icon: FileText, color: "text-blue-400" },
    data: { icon: Package, color: "text-purple-400" },
    template: { icon: FileText, color: "text-cyan-400" },
    other: { icon: FileText, color: "text-zinc-500" },
  };
  const m = map[type] ?? map.other;
  return <m.icon className={`w-3.5 h-3.5 ${m.color}`} />;
}

// ── Confirm Dialog ───────────────────────────────────────────

function ConfirmDialog({
  action,
  input,
  setInput,
  onConfirm,
  onCancel,
}: {
  action: PackageAction;
  input: string;
  setInput: (s: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useEscapeKey(onCancel);

  // Extract confirmation word from message
  const confirmWord = action.confirmMessage?.match(/Type (\w+) to confirm/)?.[1] ?? "CONFIRM";
  const canConfirm = input.toUpperCase() === confirmWord.toUpperCase();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onCancel}>
      <div className="absolute inset-0 bg-black/60" />
      <div
        className="relative rounded-xl border p-5 w-[420px] space-y-4"
        style={{ background: "var(--card)", borderColor: "var(--border)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2">
          <Shield className={`w-5 h-5 ${action.danger === "critical" ? "text-red-400" : "text-amber-400"}`} />
          <h3 className="text-foreground text-sm">{action.label}</h3>
        </div>

        <p className="text-xs text-muted-foreground leading-relaxed">
          {action.confirmMessage}
        </p>

        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={`Type ${confirmWord} to confirm`}
          className="w-full px-3 py-2 rounded-lg bg-secondary/50 border border-border text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/30"
          style={{ fontFamily: "'JetBrains Mono', monospace" }}
          autoFocus
        />

        <div className="flex items-center justify-end gap-2">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-foreground bg-secondary/50 hover:bg-secondary transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={!canConfirm}
            className={`px-3 py-1.5 rounded-lg text-xs transition-colors flex items-center gap-1 ${
              canConfirm
                ? action.danger === "critical"
                  ? "bg-red-500/15 text-red-400 hover:bg-red-500/25"
                  : "bg-amber-500/15 text-amber-400 hover:bg-amber-500/25"
                : "bg-secondary/50 text-muted-foreground opacity-50 cursor-not-allowed"
            }`}
          >
            <Play className="w-3 h-3" />
            Confirm & Run
          </button>
        </div>
      </div>
    </div>
  );
}