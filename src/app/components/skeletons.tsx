// ============================================================
// Loading Skeletons — Phase 7 shimmer placeholders
// ============================================================
// Replaces bare <Loader2 /> spinners with content-shaped
// skeletons so users see the layout before data arrives.
// ============================================================

import { Skeleton } from "./ui/skeleton";

// ── Dashboard / Command Center ──────────────────────────────

export function DashboardStatsSkeleton() {
  return (
    <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="bg-card border border-border rounded-xl p-3 space-y-2"
        >
          <div className="flex items-center justify-between">
            <Skeleton className="h-3 w-10" />
            <Skeleton className="h-3.5 w-3.5 rounded" />
          </div>
          <Skeleton className="h-5 w-16" />
          <Skeleton className="h-1.5 w-full rounded-full" />
        </div>
      ))}
    </div>
  );
}

export function DashboardChartSkeleton() {
  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
      {/* Chart area */}
      <div className="xl:col-span-2 bg-card border border-border rounded-xl p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Skeleton className="h-4 w-4 rounded" />
          <Skeleton className="h-4 w-32" />
        </div>
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-[200px] w-full rounded-lg" />
      </div>
      {/* Sidebar */}
      <div className="bg-card border border-border rounded-xl p-5 space-y-3">
        <Skeleton className="h-4 w-28" />
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-2">
            <Skeleton className="h-2 w-2 rounded-full" />
            <Skeleton className="h-3 w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function DashboardOverviewSkeleton() {
  return (
    <div className="space-y-6">
      <DashboardStatsSkeleton />
      <DashboardChartSkeleton />
      {/* Alerts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {Array.from({ length: 2 }).map((_, i) => (
          <div
            key={i}
            className="bg-card border border-border rounded-xl p-4 space-y-2"
          >
            <Skeleton className="h-4 w-24" />
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, j) => (
                <div key={j} className="flex items-center gap-3">
                  <Skeleton className="h-4 w-4 rounded" />
                  <div className="flex-1 space-y-1">
                    <Skeleton className="h-3 w-3/4" />
                    <Skeleton className="h-2.5 w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Community Hub Columns ───────────────────────────────────

export function CommunityCardSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="p-2 space-y-1.5">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="bg-card border border-border rounded-lg p-3 space-y-2"
        >
          <div className="flex items-center gap-2">
            <Skeleton className="h-4 w-4 rounded" />
            <Skeleton className="h-3.5 w-2/3" />
          </div>
          <Skeleton className="h-2.5 w-full" />
          <Skeleton className="h-2.5 w-4/5" />
          <div className="flex items-center gap-3 pt-1">
            <Skeleton className="h-2.5 w-12" />
            <Skeleton className="h-2.5 w-16" />
            <Skeleton className="h-2.5 w-10" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Training Page ───────────────────────────────────────────

export function TrainingJobsSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <div
          key={i}
          className="bg-card border border-border rounded-xl p-4 space-y-3"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Skeleton className="h-5 w-5 rounded" />
              <Skeleton className="h-4 w-40" />
            </div>
            <Skeleton className="h-5 w-16 rounded-full" />
          </div>
          <Skeleton className="h-2 w-full rounded-full" />
          <div className="flex items-center gap-4">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-3 w-16" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function TrainingGPUSkeleton() {
  return (
    <div className="bg-card border border-border rounded-xl p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Skeleton className="h-4 w-4 rounded" />
        <Skeleton className="h-4 w-24" />
      </div>
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Skeleton className="h-3 w-12" />
            <Skeleton className="h-3 w-16" />
          </div>
          <Skeleton className="h-2 w-full rounded-full" />
        </div>
      ))}
    </div>
  );
}

export function TrainingServicesSkeleton() {
  return (
    <div className="flex gap-3 flex-wrap">
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="bg-card border border-border rounded-lg px-3 py-2 flex items-center gap-2"
        >
          <Skeleton className="h-2 w-2 rounded-full" />
          <Skeleton className="h-3 w-20" />
        </div>
      ))}
    </div>
  );
}

// ── Package Manager ─────────────────────────────────────────

export function PackageCardSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="bg-card border border-border rounded-xl p-4 space-y-3"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Skeleton className="h-8 w-8 rounded-lg" />
              <div className="space-y-1">
                <Skeleton className="h-3.5 w-32" />
                <Skeleton className="h-2.5 w-20" />
              </div>
            </div>
            <Skeleton className="h-5 w-14 rounded-full" />
          </div>
          <Skeleton className="h-2.5 w-full" />
          <div className="flex items-center gap-2">
            <Skeleton className="h-5 w-14 rounded" />
            <Skeleton className="h-5 w-14 rounded" />
            <Skeleton className="h-5 w-14 rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}
