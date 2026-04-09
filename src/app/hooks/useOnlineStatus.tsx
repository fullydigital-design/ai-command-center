// ============================================================
// useOnlineStatus — Track browser online/offline state
// ============================================================
// Phase 6: Offline detection hook.
//
// Returns { isOnline, wasOffline } where wasOffline is true
// once after recovering from offline, then resets after 5s.
// Also fires toast notifications on status changes.
// ============================================================

import { useState, useEffect, useCallback, useRef } from "react";
import { toast } from "sonner";

interface OnlineStatus {
  /** Current online state (navigator.onLine). */
  isOnline: boolean;
  /** True for 5 seconds after coming back online. */
  wasOffline: boolean;
  /** Timestamp of last online→offline transition (null if never went offline). */
  lastOfflineAt: number | null;
}

export function useOnlineStatus(): OnlineStatus {
  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator !== "undefined" ? navigator.onLine : true
  );
  const [wasOffline, setWasOffline] = useState(false);
  const [lastOfflineAt, setLastOfflineAt] = useState<number | null>(null);
  const wasOfflineTimer = useRef<ReturnType<typeof setTimeout>>();
  const prevOnline = useRef(isOnline);

  const handleOnline = useCallback(() => {
    setIsOnline(true);

    // Only show recovery toast if we were previously offline
    if (!prevOnline.current) {
      setWasOffline(true);
      toast.success("Back online", {
        description: "Network connection restored. Services reconnecting...",
      });

      // Clear wasOffline flag after 5s
      clearTimeout(wasOfflineTimer.current);
      wasOfflineTimer.current = setTimeout(() => setWasOffline(false), 5000);
    }

    prevOnline.current = true;
  }, []);

  const handleOffline = useCallback(() => {
    setIsOnline(false);
    setLastOfflineAt(Date.now());
    prevOnline.current = false;

    toast.warning("You're offline", {
      description: "Network connection lost. Some features may be unavailable.",
      duration: 8000,
    });
  }, []);

  useEffect(() => {
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      clearTimeout(wasOfflineTimer.current);
    };
  }, [handleOnline, handleOffline]);

  return { isOnline, wasOffline, lastOfflineAt };
}
