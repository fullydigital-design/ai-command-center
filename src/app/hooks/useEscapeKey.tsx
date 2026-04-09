// ============================================================
// useEscapeKey — Call a handler when Escape is pressed
// ============================================================
// Usage:
//   useEscapeKey(() => setOpen(false));
// ============================================================

import { useEffect } from "react";

export function useEscapeKey(handler: () => void, enabled: boolean = true) {
  useEffect(() => {
    if (!enabled) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        handler();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handler, enabled]);
}
