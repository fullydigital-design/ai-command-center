import { Outlet, NavLink, useNavigate } from "react-router";
import {
  LayoutDashboard,
  GraduationCap,
  Globe,
  ChevronLeft,
  ChevronRight,
  Zap,
  Settings,
  Keyboard,
  Package,
  Sun,
  Moon,
} from "lucide-react";
import { useState, Suspense, useEffect, useCallback } from "react";
import { StatusBar } from "./StatusBar";
import { ErrorBoundary } from "./ErrorBoundary";
import { RouteSpinner } from "./RouteSpinner";
import { HealthMonitorProvider } from "../hooks/useHealthMonitor";
import { LauncherBridgeProvider } from "../hooks/useLauncherBridge";
import { useOnlineStatus } from "../hooks/useOnlineStatus";
import { useNavBadges } from "../hooks/useNavBadges";
import { useTheme } from "../hooks/useTheme";
import { Toaster } from "./ui/sonner";

const navItems = [
  { to: "/", icon: LayoutDashboard, label: "Command Center", end: true, shortcut: "1" },
  { to: "/training", icon: GraduationCap, label: "Training", shortcut: "2" },
  { to: "/community", icon: Globe, label: "Community", shortcut: "3" },
  { to: "/packages", icon: Package, label: "Packages", shortcut: "4" },
  { to: "/settings", icon: Settings, label: "Settings", shortcut: "5" },
];

export function Layout() {
  const [collapsed, setCollapsed] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const navigate = useNavigate();

  // ── Offline detection (fires toast on status changes) ──
  useOnlineStatus();

  // ── Nav badge counts (updates, active training jobs) ──
  const badges = useNavBadges();

  // ── Theme toggle ──
  const { theme, toggle: toggleTheme } = useTheme();

  // Map route → badge count (only show non-zero)
  const badgeMap: Record<string, number> = {
    "/": badges.updates,
    "/training": badges.activeJobs,
  };

  // ── Global keyboard shortcuts ──
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Ignore when typing in inputs
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if ((e.target as HTMLElement)?.isContentEditable) return;

      const ctrl = e.ctrlKey || e.metaKey;

      // Ctrl+1–4 → navigate pages
      if (ctrl && e.key >= "1" && e.key <= "5") {
        e.preventDefault();
        const item = navItems[parseInt(e.key) - 1];
        if (item) navigate(item.to);
        return;
      }

      // Ctrl+B → toggle sidebar
      if (ctrl && e.key === "b") {
        e.preventDefault();
        setCollapsed((c) => !c);
        return;
      }

      // Shift+? → toggle shortcut cheat-sheet
      if (e.key === "?" && e.shiftKey) {
        e.preventDefault();
        setShowShortcuts((s) => !s);
        return;
      }

      // Escape → close cheat-sheet
      if (e.key === "Escape") {
        setShowShortcuts(false);
      }
    },
    [navigate]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  return (
    <HealthMonitorProvider>
    <LauncherBridgeProvider>
    <div className="flex h-screen bg-background overflow-hidden" style={{ fontFamily: "'Inter', sans-serif" }}>
      {/* Sidebar */}
      <aside
        className={`${
          collapsed ? "w-[68px]" : "w-[240px]"
        } bg-sidebar border-r border-sidebar-border flex flex-col transition-all duration-300 shrink-0`}
      >
        {/* Logo */}
        <div className="p-4 flex items-center gap-3 border-b border-sidebar-border h-[60px]">
          <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center shrink-0">
            <Zap className="w-5 h-5 text-primary" />
          </div>
          {!collapsed && (
            <div className="overflow-hidden">
              <span className="text-sm text-foreground whitespace-nowrap" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                AI Command
              </span>
            </div>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 py-3 px-2 space-y-1 overflow-y-auto">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `relative flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-sm ${
                  isActive
                    ? "bg-primary/15 text-primary"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                }`
              }
            >
              <item.icon className="w-[18px] h-[18px] shrink-0" />
              {!collapsed && (
                <>
                  <span className="truncate flex-1">{item.label}</span>
                  {(badgeMap[item.to] ?? 0) > 0 && (
                    <span className="min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-primary/20 text-primary text-[10px] px-1"
                      style={{ fontFamily: "'JetBrains Mono', monospace" }}
                    >
                      {badgeMap[item.to]}
                    </span>
                  )}
                  <kbd
                    className="text-[10px] px-1.5 py-0.5 rounded opacity-40"
                    style={{
                      background: "var(--secondary)",
                      fontFamily: "'JetBrains Mono', monospace",
                    }}
                  >
                    ⌘{item.shortcut}
                  </kbd>
                </>
              )}
              {collapsed && (badgeMap[item.to] ?? 0) > 0 && (
                <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-primary" />
              )}
            </NavLink>
          ))}
        </nav>

        {/* Shortcuts hint + Theme toggle + Collapse toggle */}
        <div className="border-t border-sidebar-border flex items-center">
          {!collapsed && (
            <button
              onClick={() => setShowShortcuts((s) => !s)}
              className="p-3 text-muted-foreground hover:text-foreground transition-colors"
              title="Keyboard shortcuts (Shift+?)"
            >
              <Keyboard className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={toggleTheme}
            className="p-3 text-muted-foreground hover:text-foreground transition-colors"
            title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
          >
            {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="flex-1 p-3 text-muted-foreground hover:text-foreground transition-colors flex items-center justify-center"
            title="Toggle sidebar (Ctrl+B)"
          >
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 flex flex-col overflow-hidden">
        <div className="flex-1 overflow-auto">
          <ErrorBoundary>
            <Suspense fallback={<RouteSpinner />}>
              <Outlet />
            </Suspense>
          </ErrorBoundary>
        </div>
        <StatusBar />
      </main>

      {/* Toast notifications */}
      <Toaster />

      {/* ── Keyboard shortcuts cheat-sheet overlay ── */}
      {showShortcuts && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          onClick={() => setShowShortcuts(false)}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/60" />
          {/* Card */}
          <div
            className="relative rounded-xl border p-5 w-[340px] space-y-3"
            style={{ background: "var(--card)", borderColor: "var(--border)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-foreground text-sm">Keyboard Shortcuts</h3>
              <kbd
                className="text-[10px] px-1.5 py-0.5 rounded text-muted-foreground"
                style={{ background: "var(--secondary)", fontFamily: "'JetBrains Mono', monospace" }}
              >
                Esc
              </kbd>
            </div>
            <div className="space-y-1.5">
              {[
                { keys: "⌘ 1–5", desc: "Navigate pages" },
                { keys: "⌘ B", desc: "Toggle sidebar" },
                { keys: "Shift ?", desc: "This cheat-sheet" },
              ].map((s) => (
                <div key={s.keys} className="flex items-center justify-between text-[12px]">
                  <span className="text-muted-foreground">{s.desc}</span>
                  <kbd
                    className="px-2 py-0.5 rounded text-foreground"
                    style={{ background: "var(--secondary)", fontFamily: "'JetBrains Mono', monospace" }}
                  >
                    {s.keys}
                  </kbd>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
    </LauncherBridgeProvider>
    </HealthMonitorProvider>
  );
}