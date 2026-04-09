// ============================================================
// useNavBadges — Lightweight badge counts for sidebar nav
// ============================================================
// Phase 7: Polls lightweight counts every 30s for nav badges.
// Each count is independently fetched so a single failure
// doesn't break the others.
// ============================================================

import { useState, useEffect, useCallback, useRef } from "react";
import { getSoftwareVersions } from "../services/systemService";
import { getTrainingJobs } from "../services/trainingService";

const BADGE_POLL_INTERVAL = 30_000; // 30 seconds

export interface NavBadges {
  /** Number of software updates available (Command Center). */
  updates: number;
  /** Number of currently running training jobs. */
  activeJobs: number;
}

export function useNavBadges(): NavBadges {
  const [badges, setBadges] = useState<NavBadges>({
    updates: 0,
    activeJobs: 0,
  });
  const mountedRef = useRef(true);

  const refresh = useCallback(async () => {
    // Fetch counts independently — one failure doesn't block others
    try {
      const sw = await getSoftwareVersions();
      if (mountedRef.current) {
        setBadges((prev) => ({
          ...prev,
          updates: sw.filter((s) => s.hasUpdate).length,
        }));
      }
    } catch { /* ignore */ }

    try {
      const jobs = await getTrainingJobs();
      if (mountedRef.current) {
        setBadges((prev) => ({
          ...prev,
          activeJobs: jobs.filter((j) => j.status === "running").length,
        }));
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    refresh();
    const id = setInterval(refresh, BADGE_POLL_INTERVAL);
    return () => {
      mountedRef.current = false;
      clearInterval(id);
    };
  }, [refresh]);

  return badges;
}
