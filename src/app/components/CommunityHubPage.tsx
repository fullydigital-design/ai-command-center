// ============================================================
// CommunityHubPage — 3-column Community Hub (GitHub, HF, CivitAI)
// ============================================================
// Phase 5: Columns extracted to /community/ sub-components.

import { useState } from "react";
import {
  Github,
  Search,
  Globe,
  Columns3,
  X,
} from "lucide-react";

import { useDebouncedValue } from "../hooks/useDebouncedValue";
import { GitHubColumn } from "./community/GitHubColumn";
import { HuggingFaceColumn } from "./community/HuggingFaceColumn";
import { CivitAIColumn } from "./community/CivitAIColumn";

export function CommunityHubPage() {
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 300);

  return (
    <div className="flex flex-col h-screen">
      {/* Global Header */}
      <div className="p-4 pb-0 shrink-0">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-primary/15 flex items-center justify-center">
              <Globe className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-foreground flex items-center gap-2">
                Community Hub
                <Columns3 className="w-4 h-4 text-muted-foreground" />
              </h1>
              <p className="text-xs text-muted-foreground mt-0.5">
                AI repos, models & community resources in one view
              </p>
            </div>

            {/* Platform badges */}
            <div className="flex items-center gap-1.5 ml-4">
              <span className="flex items-center gap-1 px-2 py-0.5 rounded bg-secondary text-[10px] text-muted-foreground">
                <Github className="w-3 h-3" /> Repos
              </span>
              <span className="flex items-center gap-1 px-2 py-0.5 rounded bg-[hsl(45,100%,55%)]/10 text-[10px] text-[hsl(45,100%,55%)]">
                {"\uD83E\uDD17"} Models
              </span>
              <span className="flex items-center gap-1 px-2 py-0.5 rounded bg-[hsl(210,100%,60%)]/10 text-[10px] text-[hsl(210,100%,60%)]">
                {"\uD83C\uDFA8"} Community
              </span>
            </div>
          </div>

          {/* Search with clear */}
          <div className="relative w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search across all platforms..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={`w-full pl-9 pr-8 py-2 bg-card border rounded-lg text-xs text-foreground placeholder:text-muted-foreground focus:outline-none transition-colors ${
                search ? "border-primary/50 bg-primary/5" : "border-border"
              }`}
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>

        {/* Active search indicator */}
        {search && (
          <div className="flex items-center gap-2 mb-2 px-1">
            <span className="text-[10px] text-primary flex items-center gap-1">
              <Search className="w-2.5 h-2.5" />
              Searching: &quot;{search}&quot;
            </span>
            <span className="text-[10px] text-muted-foreground/40">|</span>
            <span className="text-[10px] text-muted-foreground">Results filtered across all 3 columns</span>
          </div>
        )}
      </div>

      {/* 3-column layout */}
      <div className="flex-1 grid grid-cols-3 gap-0 overflow-hidden min-h-0">
        <GitHubColumn search={debouncedSearch} />
        <HuggingFaceColumn search={debouncedSearch} />
        <CivitAIColumn search={debouncedSearch} />
      </div>
    </div>
  );
}
