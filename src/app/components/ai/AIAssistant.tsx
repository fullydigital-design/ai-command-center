// ============================================================
// AIAssistant — Main reusable AI assistant component
// ============================================================
// Split-panel layout: Content (editor + suggestions) | Chat
// Used by Training Config Optimizer and Script Lab.

import { useState, useCallback } from "react";
import {
  PanelRightClose,
  PanelRightOpen,
  Sparkles,
  Loader2,
  Brain,
  AlertCircle,
} from "lucide-react";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { ChatPanel } from "./ChatPanel";
import { SuggestionsPanel } from "./SuggestionsPanel";
import { CodeEditor } from "./CodeEditor";
import type { AISuggestion } from "../../services/aiService";
import {
  isAIAvailable,
  chatCompletion,
  generateMessageId,
  parseSuggestionsFromResponse,
} from "../../services/aiService";
import type { ChatMessage } from "../../services/aiService";
import { toast } from "sonner";

interface AIAssistantProps {
  /** System prompt for the AI */
  systemPrompt: string;
  /** Current editor content */
  content: string;
  /** Called when editor content changes */
  onContentChange: (content: string) => void;
  /** Code language for syntax highlighting */
  language: "toml" | "bat" | "sh" | "python" | "text";
  /** Current filename */
  filename?: string;
  /** Original content for diff/reset */
  originalContent?: string;
  /** Whether to allow file uploads */
  allowUpload?: boolean;
  /** Called when user uploads a file */
  onFileUpload?: (content: string, filename: string) => void;
  /** Suggested prompts for the chat panel */
  suggestedPrompts?: string[];
  /** Chat placeholder text */
  chatPlaceholder?: string;
  /** Title for the assistant mode */
  title?: string;
  /** Description subtitle */
  description?: string;
  /** Whether to show the "Analyze" button */
  showAnalyze?: boolean;
  /** Custom analyze prompt (sent to AI when user clicks Analyze) */
  analyzePrompt?: string;
  /** Additional content above the editor (e.g. flag configurator) */
  headerContent?: React.ReactNode;
  /** Additional content below the editor (e.g. download panel) */
  footerContent?: React.ReactNode;
  /** Max editor height */
  editorMaxHeight?: number;
  /** Whether editor is read-only */
  readOnly?: boolean;
}

export function AIAssistant({
  systemPrompt,
  content,
  onContentChange,
  language,
  filename,
  originalContent,
  allowUpload = true,
  onFileUpload,
  suggestedPrompts = [],
  chatPlaceholder,
  title = "AI Assistant",
  description,
  showAnalyze = true,
  analyzePrompt,
  headerContent,
  footerContent,
  editorMaxHeight = 400,
  readOnly = false,
}: AIAssistantProps) {
  const [chatOpen, setChatOpen] = useState(true);
  const [suggestions, setSuggestions] = useState<AISuggestion[]>([]);
  const [analyzing, setAnalyzing] = useState(false);

  const available = isAIAvailable();

  // Handle analyze button click
  const handleAnalyze = useCallback(async () => {
    if (!content.trim() || !available) return;

    setAnalyzing(true);
    setSuggestions([]);

    const prompt =
      analyzePrompt ||
      `Analyze the following ${language} configuration and provide optimization suggestions:\n\n\`\`\`${language}\n${content}\n\`\`\``;

    const message: ChatMessage = {
      id: generateMessageId(),
      role: "user",
      content: prompt,
      timestamp: Date.now(),
    };

    try {
      const response = await chatCompletion([message], systemPrompt);
      const parsed = parseSuggestionsFromResponse(response);
      if (parsed.length > 0) {
        setSuggestions(parsed);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Analysis failed";
      toast.error(msg);
    } finally {
      setAnalyzing(false);
    }
  }, [content, available, analyzePrompt, language, systemPrompt]);

  // Handle applying a suggestion
  const handleApplySuggestion = useCallback(
    (suggestion: AISuggestion) => {
      if (!suggestion.field || !suggestion.suggestedValue) {
        // Mark as applied even without auto-apply
        setSuggestions((prev) =>
          prev.map((s) => (s.id === suggestion.id ? { ...s, applied: true } : s))
        );
        return;
      }

      // Try to find and replace the value in content
      let newContent = content;

      if (language === "toml") {
        // Match key = value pattern in TOML
        const regex = new RegExp(
          `^(\\s*${escapeRegex(suggestion.field)}\\s*=\\s*)(.*)$`,
          "m"
        );
        if (regex.test(content)) {
          newContent = content.replace(regex, `$1${suggestion.suggestedValue}`);
        } else if (suggestion.suggestedValue.startsWith("--")) {
          // It's a CLI flag suggestion, append to content
          newContent = content + `\n${suggestion.field} = ${suggestion.suggestedValue}`;
        } else {
          // Add as new line
          newContent = content + `\n${suggestion.field} = ${suggestion.suggestedValue}`;
        }
      } else {
        // For BAT/SH, try line-based replacement
        if (suggestion.currentValue) {
          newContent = content.replace(suggestion.currentValue, suggestion.suggestedValue);
        }
      }

      if (newContent !== content) {
        onContentChange(newContent);
      }

      setSuggestions((prev) =>
        prev.map((s) => (s.id === suggestion.id ? { ...s, applied: true } : s))
      );
    },
    [content, language, onContentChange]
  );

  const handleDismissSuggestion = useCallback((id: string) => {
    setSuggestions((prev) =>
      prev.map((s) => (s.id === id ? { ...s, dismissed: true } : s))
    );
  }, []);

  const handleApplyAll = useCallback(() => {
    const pending = suggestions.filter((s) => !s.applied && !s.dismissed);
    pending.forEach(handleApplySuggestion);
  }, [suggestions, handleApplySuggestion]);

  const handleSuggestionsFromChat = useCallback((newSuggestions: AISuggestion[]) => {
    setSuggestions((prev) => [...prev, ...newSuggestions]);
  }, []);

  return (
    <div className="flex gap-4 h-full">
      {/* Left: Content panel */}
      <div className={`flex-1 min-w-0 space-y-4 ${chatOpen ? "" : ""}`}>
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Brain className="w-4 h-4 text-primary" />
            </div>
            <div>
              <h3 className="text-sm text-foreground">{title}</h3>
              {description && (
                <p className="text-[11px] text-muted-foreground">{description}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {showAnalyze && content.trim() && (
              <Button
                variant="default"
                size="sm"
                className="gap-1.5 text-xs"
                onClick={handleAnalyze}
                disabled={!available || analyzing}
              >
                {analyzing ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Sparkles className="w-3 h-3" />
                )}
                {analyzing ? "Analyzing..." : "Analyze with AI"}
              </Button>
            )}
            {!available && (
              <Badge variant="outline" className="text-[10px] gap-1 text-amber-400 border-amber-400/20">
                <AlertCircle className="w-3 h-3" />
                Set OpenRouter key in Settings
              </Badge>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setChatOpen(!chatOpen)}
              title={chatOpen ? "Close chat" : "Open chat"}
            >
              {chatOpen ? (
                <PanelRightClose className="w-4 h-4 text-muted-foreground" />
              ) : (
                <PanelRightOpen className="w-4 h-4 text-muted-foreground" />
              )}
            </Button>
          </div>
        </div>

        {/* Optional header content (e.g. flag configurator) */}
        {headerContent}

        {/* Code editor */}
        <CodeEditor
          value={content}
          onChange={onContentChange}
          language={language}
          filename={filename}
          readOnly={readOnly}
          onFileUpload={allowUpload ? onFileUpload : undefined}
          maxHeight={editorMaxHeight}
          originalContent={originalContent}
        />

        {/* Suggestions panel */}
        {suggestions.length > 0 && (
          <SuggestionsPanel
            suggestions={suggestions}
            onApply={handleApplySuggestion}
            onDismiss={handleDismissSuggestion}
            onApplyAll={handleApplyAll}
          />
        )}

        {/* Optional footer content (e.g. download panel) */}
        {footerContent}
      </div>

      {/* Right: Chat panel */}
      {chatOpen && (
        <div className="w-[380px] shrink-0 h-[calc(100vh-180px)] sticky top-4">
          <ChatPanel
            systemPrompt={systemPrompt}
            suggestedPrompts={suggestedPrompts}
            onSuggestionsReceived={handleSuggestionsFromChat}
            contextPrefix={content.trim() ? content : undefined}
            placeholder={chatPlaceholder}
          />
        </div>
      )}
    </div>
  );
}

// --- Utility ---

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}