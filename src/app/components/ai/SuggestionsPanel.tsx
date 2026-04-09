// ============================================================
// SuggestionsPanel — Displays AI-generated optimization suggestions
// ============================================================
// Categorized suggestions with apply/dismiss actions.
// Used by Training Config Optimizer and Script Lab.

import { useState } from "react";
import {
  AlertCircle,
  Zap,
  Sparkles,
  Lightbulb,
  Cpu,
  Check,
  X,
  ChevronDown,
  ChevronRight,
  CheckCheck,
} from "lucide-react";
import { Button } from "../ui/button";
import type { AISuggestion } from "../../services/aiService";

interface SuggestionsPanelProps {
  suggestions: AISuggestion[];
  onApply: (suggestion: AISuggestion) => void;
  onDismiss: (id: string) => void;
  onApplyAll: () => void;
  className?: string;
}

const categoryConfig: Record<
  AISuggestion["category"],
  { icon: typeof AlertCircle; label: string; color: string; bgColor: string; borderColor: string }
> = {
  critical: {
    icon: AlertCircle,
    label: "Critical",
    color: "text-red-400",
    bgColor: "bg-red-500/10",
    borderColor: "border-red-500/20",
  },
  performance: {
    icon: Zap,
    label: "Performance",
    color: "text-amber-400",
    bgColor: "bg-amber-500/10",
    borderColor: "border-amber-500/20",
  },
  quality: {
    icon: Sparkles,
    label: "Quality",
    color: "text-blue-400",
    bgColor: "bg-blue-500/10",
    borderColor: "border-blue-500/20",
  },
  rtx5090: {
    icon: Cpu,
    label: "RTX 5090",
    color: "text-emerald-400",
    bgColor: "bg-emerald-500/10",
    borderColor: "border-emerald-500/20",
  },
  optional: {
    icon: Lightbulb,
    label: "Optional",
    color: "text-muted-foreground",
    bgColor: "bg-secondary",
    borderColor: "border-border",
  },
};

const categoryOrder: AISuggestion["category"][] = [
  "critical",
  "performance",
  "quality",
  "rtx5090",
  "optional",
];

export function SuggestionsPanel({
  suggestions,
  onApply,
  onDismiss,
  onApplyAll,
  className = "",
}: SuggestionsPanelProps) {
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());

  const activeSuggestions = suggestions.filter((s) => !s.dismissed);
  const appliedCount = suggestions.filter((s) => s.applied).length;
  const pendingCount = activeSuggestions.filter((s) => !s.applied).length;

  if (suggestions.length === 0) return null;

  // Group by category
  const grouped = categoryOrder
    .map((cat) => ({
      category: cat,
      items: activeSuggestions.filter((s) => s.category === cat),
    }))
    .filter((g) => g.items.length > 0);

  const toggleCategory = (cat: string) => {
    setCollapsedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  return (
    <div className={`space-y-3 ${className}`}>
      {/* Header bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-primary" />
          <h4 className="text-xs text-foreground">
            AI Suggestions
          </h4>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary">
            {activeSuggestions.length}
          </span>
          {appliedCount > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400">
              {appliedCount} applied
            </span>
          )}
        </div>
        {pendingCount > 1 && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-[11px] gap-1"
            onClick={onApplyAll}
          >
            <CheckCheck className="w-3 h-3" />
            Apply All ({pendingCount})
          </Button>
        )}
      </div>

      {/* Category groups */}
      {grouped.map(({ category, items }) => {
        const config = categoryConfig[category];
        const Icon = config.icon;
        const isCollapsed = collapsedCategories.has(category);
        const categoryAppliedCount = items.filter((s) => s.applied).length;

        return (
          <div key={category} className="space-y-2">
            {/* Category header */}
            <button
              onClick={() => toggleCategory(category)}
              className="flex items-center gap-2 w-full text-left group"
            >
              {isCollapsed ? (
                <ChevronRight className="w-3 h-3 text-muted-foreground" />
              ) : (
                <ChevronDown className="w-3 h-3 text-muted-foreground" />
              )}
              <Icon className={`w-3.5 h-3.5 ${config.color}`} />
              <span className={`text-[11px] ${config.color}`}>
                {config.label}
              </span>
              <span className="text-[10px] text-muted-foreground">
                ({items.length})
              </span>
              {categoryAppliedCount === items.length && items.length > 0 && (
                <Check className="w-3 h-3 text-emerald-400 ml-auto" />
              )}
            </button>

            {/* Suggestion cards */}
            {!isCollapsed &&
              items.map((suggestion) => (
                <SuggestionCard
                  key={suggestion.id}
                  suggestion={suggestion}
                  config={config}
                  onApply={() => onApply(suggestion)}
                  onDismiss={() => onDismiss(suggestion.id)}
                />
              ))}
          </div>
        );
      })}
    </div>
  );
}

// --- Individual suggestion card ---

function SuggestionCard({
  suggestion,
  config,
  onApply,
  onDismiss,
}: {
  suggestion: AISuggestion;
  config: (typeof categoryConfig)[AISuggestion["category"]];
  onApply: () => void;
  onDismiss: () => void;
}) {
  return (
    <div
      className={`rounded-lg border p-3 transition-all ${
        suggestion.applied
          ? "bg-emerald-500/5 border-emerald-500/20 opacity-75"
          : `${config.bgColor} ${config.borderColor}`
      }`}
    >
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <h5
          className={`text-[12px] ${
            suggestion.applied ? "text-emerald-400 line-through" : "text-foreground"
          }`}
        >
          {suggestion.applied && <Check className="w-3 h-3 inline mr-1" />}
          {suggestion.title}
        </h5>
        {!suggestion.applied && (
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={onApply}
              className="p-1 rounded hover:bg-emerald-500/20 text-emerald-400 transition-colors"
              title="Apply suggestion"
            >
              <Check className="w-3 h-3" />
            </button>
            <button
              onClick={onDismiss}
              className="p-1 rounded hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-colors"
              title="Dismiss"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        )}
      </div>

      <p className="text-[11px] text-muted-foreground leading-relaxed mb-2">
        {suggestion.description}
      </p>

      {/* Current → Suggested values */}
      {(suggestion.currentValue || suggestion.suggestedValue) && (
        <div className="flex items-center gap-2 text-[10px] font-mono">
          {suggestion.currentValue && (
            <span className="px-1.5 py-0.5 rounded bg-destructive/10 text-destructive/80 line-through">
              {suggestion.currentValue}
            </span>
          )}
          {suggestion.currentValue && suggestion.suggestedValue && (
            <span className="text-muted-foreground">&rarr;</span>
          )}
          {suggestion.suggestedValue && (
            <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400">
              {suggestion.suggestedValue}
            </span>
          )}
          {suggestion.field && (
            <span className="text-muted-foreground/50 ml-auto">
              {suggestion.field}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
