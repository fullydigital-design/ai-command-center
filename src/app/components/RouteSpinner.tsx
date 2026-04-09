// Lightweight loading spinner shown while a lazy route chunk downloads.
// Phase 7: upgraded from bare spinner to a branded shimmer.

import { Zap } from "lucide-react";

export function RouteSpinner() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 gap-3">
      <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center animate-pulse">
        <Zap className="w-5 h-5 text-primary" />
      </div>
      <span className="text-xs text-muted-foreground animate-pulse">
        Loading...
      </span>
    </div>
  );
}
