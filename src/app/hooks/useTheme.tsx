// ============================================================
// useTheme — Light / Dark theme toggle with localStorage
// ============================================================
// Persists preference to localStorage and toggles the `dark`
// class on <html>. Defaults to "dark" on first visit.
// ============================================================

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";

type Theme = "light" | "dark";

interface ThemeCtx {
  theme: Theme;
  toggle: () => void;
  setTheme: (t: Theme) => void;
}

const ThemeContext = createContext<ThemeCtx>({
  theme: "dark",
  toggle: () => {},
  setTheme: () => {},
});

const STORAGE_KEY = "ai-cmd-theme";

function getInitialTheme(): Theme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark") return stored;
  } catch { /* SSR / iframe sandboxing */ }
  return "dark"; // default
}

function applyTheme(t: Theme) {
  const root = document.documentElement;
  if (t === "dark") {
    root.classList.add("dark");
  } else {
    root.classList.remove("dark");
  }
}

// Apply immediately on module load to prevent FOUC
applyTheme(getInitialTheme());

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(getInitialTheme);

  // Apply on mount & when theme changes
  useEffect(() => {
    applyTheme(theme);
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch { /* ignore */ }
  }, [theme]);

  const toggle = useCallback(() => {
    setThemeState((prev) => (prev === "dark" ? "light" : "dark"));
  }, []);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, toggle, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}