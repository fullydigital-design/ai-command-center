// ============================================================
// ChatPanel — Reusable AI chat sidebar component
// ============================================================
// Used by both Training Config Optimizer and Script Lab.
// Handles message display, streaming, input, and suggested prompts.

import { useState, useRef, useEffect, useCallback } from "react";
import {
  Send,
  Square,
  Bot,
  User,
  Sparkles,
  AlertCircle,
  Loader2,
  Trash2,
  ChevronDown,
  Copy,
  Check,
  Download,
  FileCode,
} from "lucide-react";
import { toast } from "sonner";
import { ScrollArea } from "../ui/scroll-area";
import { Button } from "../ui/button";
import type { ChatMessage, AIStreamCallbacks } from "../../services/aiService";
import {
  streamChat,
  generateMessageId,
  isAIAvailable,
  getAIModelName,
  stripSuggestionBlocks,
  parseSuggestionsFromResponse,
  downloadFile,
} from "../../services/aiService";
import type { AISuggestion } from "../../services/aiService";

interface ChatPanelProps {
  /** System prompt injected into every conversation */
  systemPrompt: string;
  /** Suggested quick-action prompts */
  suggestedPrompts?: string[];
  /** Callback when AI returns suggestions embedded in response */
  onSuggestionsReceived?: (suggestions: AISuggestion[]) => void;
  /** Extra context to prepend to user messages (e.g. current config content) */
  contextPrefix?: string;
  /** Placeholder text for input */
  placeholder?: string;
  /** Optional class for the container */
  className?: string;
}

export function ChatPanel({
  systemPrompt,
  suggestedPrompts = [],
  onSuggestionsReceived,
  contextPrefix,
  placeholder = "Ask the AI assistant...",
  className = "",
}: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [showSuggested, setShowSuggested] = useState(true);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const available = isAIAvailable();
  const modelName = getAIModelName();

  // Auto-scroll to bottom
  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      const viewport = scrollRef.current.querySelector("[data-slot='scroll-area-viewport']");
      if (viewport) {
        viewport.scrollTop = viewport.scrollHeight;
      }
    }
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamingText, scrollToBottom]);

  // Auto-resize textarea
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
      inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, 120)}px`;
    }
  }, [input]);

  const handleSend = async (text?: string) => {
    const messageText = text || input.trim();
    if (!messageText || isStreaming) return;

    setInput("");
    setShowSuggested(false);

    // Build user message with optional context
    const fullContent = contextPrefix
      ? `[Current content for context]:\n${contextPrefix}\n\n[User question]:\n${messageText}`
      : messageText;

    const userMessage: ChatMessage = {
      id: generateMessageId(),
      role: "user",
      content: fullContent,
      timestamp: Date.now(),
    };

    // For display, we show just the user's text (not the context blob)
    const displayUserMessage: ChatMessage = {
      ...userMessage,
      content: messageText,
    };

    const newMessages = [...messages, displayUserMessage];
    setMessages(newMessages);
    setIsStreaming(true);
    setStreamingText("");

    const controller = new AbortController();
    abortRef.current = controller;

    // Use full content messages for API, display messages for UI
    const apiMessages = [...messages, userMessage];

    let fullResponse = "";

    const callbacks: AIStreamCallbacks = {
      onToken: (token) => {
        fullResponse += token;
        setStreamingText((prev) => prev + token);
      },
      onComplete: (text) => {
        const assistantMessage: ChatMessage = {
          id: generateMessageId(),
          role: "assistant",
          content: text,
          timestamp: Date.now(),
        };
        setMessages((prev) => [...prev, assistantMessage]);
        setStreamingText("");
        setIsStreaming(false);
        abortRef.current = null;

        // Parse suggestions if present
        if (onSuggestionsReceived) {
          const suggestions = parseSuggestionsFromResponse(text);
          if (suggestions.length > 0) {
            onSuggestionsReceived(suggestions);
          }
        }
      },
      onError: (error) => {
        const errorMessage: ChatMessage = {
          id: generateMessageId(),
          role: "assistant",
          content: `Error: ${error}`,
          timestamp: Date.now(),
        };
        setMessages((prev) => [...prev, errorMessage]);
        setStreamingText("");
        setIsStreaming(false);
        abortRef.current = null;
        toast.error("AI request failed", { description: error });
      },
    };

    await streamChat(apiMessages, systemPrompt, callbacks, controller.signal);
  };

  const handleStop = () => {
    if (abortRef.current) {
      abortRef.current.abort();
      if (streamingText) {
        const assistantMessage: ChatMessage = {
          id: generateMessageId(),
          role: "assistant",
          content: streamingText + "\n\n*[Stopped by user]*",
          timestamp: Date.now(),
        };
        setMessages((prev) => [...prev, assistantMessage]);
      }
      setStreamingText("");
      setIsStreaming(false);
      abortRef.current = null;
    }
  };

  const handleClear = () => {
    setMessages([]);
    setStreamingText("");
    setShowSuggested(true);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const renderMarkdown = (text: string) => {
    // Strip suggestion JSON blocks for display
    const cleaned = stripSuggestionBlocks(text);

    // Parse into segments: text blocks and code blocks
    const segments: Array<{ type: "text"; content: string } | { type: "code"; lang: string; filename: string; content: string }> = [];
    const codeBlockRegex = /```(\w+)?(?::([^\n]+))?\s*\n([\s\S]*?)```/g;
    let lastIndex = 0;
    let match;

    while ((match = codeBlockRegex.exec(cleaned)) !== null) {
      // Add text before this code block
      if (match.index > lastIndex) {
        segments.push({ type: "text", content: cleaned.slice(lastIndex, match.index) });
      }
      const lang = match[1] || "";
      const filename = match[2] || "";
      const code = match[3]?.trim() || "";
      // Skip json:suggestions blocks
      if (lang === "json" && filename === "suggestions") {
        lastIndex = match.index + match[0].length;
        continue;
      }
      segments.push({ type: "code", lang, filename, content: code });
      lastIndex = match.index + match[0].length;
    }
    // Add remaining text
    if (lastIndex < cleaned.length) {
      segments.push({ type: "text", content: cleaned.slice(lastIndex) });
    }

    return segments.map((seg, i) => {
      if (seg.type === "code") {
        return (
          <InlineFileBlock
            key={`code-${i}`}
            language={seg.lang}
            filename={seg.filename}
            content={seg.content}
          />
        );
      }
      // Render text with basic markdown
      return (
        <span key={`text-${i}`}>
          {renderTextLines(seg.content)}
        </span>
      );
    });
  };

  const renderTextLines = (text: string) => {
    return text.split("\n").map((line, i) => {
      if (!line.trim()) return <span key={i} className="block h-2" />;
      // Inline code
      const withCode = line.replace(
        /`([^`]+)`/g,
        '<code class="px-1 py-0.5 rounded bg-secondary text-[#00d4aa] text-[11px]">$1</code>'
      );
      // Bold
      const withBold = withCode.replace(
        /\*\*([^*]+)\*\*/g,
        '<strong class="text-foreground">$1</strong>'
      );

      return (
        <span
          key={i}
          dangerouslySetInnerHTML={{ __html: withBold }}
          className="block"
        />
      );
    });
  };

  return (
    <div className={`flex flex-col h-full bg-card border border-border rounded-xl overflow-hidden ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
            <Sparkles className="w-3.5 h-3.5 text-primary" />
          </div>
          <div>
            <h4 className="text-xs text-foreground">AI Assistant</h4>
            <p className="text-[10px] text-muted-foreground">{modelName}</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {messages.length > 0 && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={handleClear}
              title="Clear chat"
            >
              <Trash2 className="w-3.5 h-3.5 text-muted-foreground" />
            </Button>
          )}
          {!available && (
            <div className="flex items-center gap-1 px-2 py-1 rounded bg-destructive/10 border border-destructive/20">
              <AlertCircle className="w-3 h-3 text-destructive" />
              <span className="text-[10px] text-destructive">No API key</span>
            </div>
          )}
        </div>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1" ref={scrollRef}>
        <div className="p-4 space-y-4">
          {messages.length === 0 && !isStreaming && (
            <div className="text-center py-8">
              <Bot className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground mb-1">
                AI Assistant Ready
              </p>
              <p className="text-[11px] text-muted-foreground/60">
                Ask questions or request analysis
              </p>
            </div>
          )}

          {messages.map((msg) => (
            <MessageBubble
              key={msg.id}
              message={msg}
              renderContent={renderMarkdown}
            />
          ))}

          {/* Streaming indicator */}
          {isStreaming && streamingText && (
            <div className="flex gap-3">
              <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                <Bot className="w-3.5 h-3.5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[12px] text-foreground/90 leading-relaxed whitespace-pre-wrap break-words">
                  {renderMarkdown(streamingText)}
                  <span className="inline-block w-1.5 h-4 bg-primary animate-pulse ml-0.5 align-middle" />
                </div>
              </div>
            </div>
          )}

          {isStreaming && !streamingText && (
            <div className="flex gap-3">
              <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <Bot className="w-3.5 h-3.5 text-primary" />
              </div>
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                <Loader2 className="w-3 h-3 animate-spin" />
                Thinking...
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Suggested prompts */}
      {showSuggested && suggestedPrompts.length > 0 && messages.length === 0 && (
        <div className="px-4 pb-2">
          <div className="flex items-center gap-1.5 mb-2">
            <ChevronDown className="w-3 h-3 text-muted-foreground" />
            <span className="text-[10px] text-muted-foreground">Suggested</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {suggestedPrompts.map((prompt, i) => (
              <button
                key={i}
                onClick={() => handleSend(prompt)}
                disabled={!available || isStreaming}
                className="text-[11px] px-2.5 py-1.5 rounded-lg bg-secondary/80 text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors text-left disabled:opacity-50"
              >
                {prompt}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input */}
      <div className="p-3 border-t border-border">
        <div className="flex gap-2 items-end">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={available ? placeholder : "Configure OpenRouter key in Settings first"}
            disabled={!available || isStreaming}
            rows={1}
            className="flex-1 resize-none bg-secondary/50 border border-border rounded-lg px-3 py-2 text-[12px] text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/30 disabled:opacity-50 min-h-[36px] max-h-[120px]"
            style={{ fontFamily: "inherit" }}
          />
          {isStreaming ? (
            <Button
              size="icon"
              variant="destructive"
              className="h-9 w-9 shrink-0"
              onClick={handleStop}
              title="Stop generation"
            >
              <Square className="w-3.5 h-3.5" />
            </Button>
          ) : (
            <Button
              size="icon"
              className="h-9 w-9 shrink-0"
              onClick={() => handleSend()}
              disabled={!input.trim() || !available}
              title="Send message"
            >
              <Send className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>
        <p className="text-[9px] text-muted-foreground/40 mt-1.5 text-center">
          Shift+Enter for new line
        </p>
      </div>
    </div>
  );
}

// --- Message Bubble sub-component ---

function MessageBubble({
  message,
  renderContent,
}: {
  message: ChatMessage;
  renderContent: (text: string) => React.ReactNode;
}) {
  const isUser = message.role === "user";
  const isError = message.content.startsWith("Error:");

  return (
    <div className={`flex gap-3 ${isUser ? "flex-row-reverse" : ""}`}>
      <div
        className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
          isUser
            ? "bg-chart-2/10"
            : isError
            ? "bg-destructive/10"
            : "bg-primary/10"
        }`}
      >
        {isUser ? (
          <User className="w-3.5 h-3.5 text-chart-2" />
        ) : isError ? (
          <AlertCircle className="w-3.5 h-3.5 text-destructive" />
        ) : (
          <Bot className="w-3.5 h-3.5 text-primary" />
        )}
      </div>
      <div
        className={`flex-1 min-w-0 ${isUser ? "text-right" : ""}`}
      >
        <div
          className={`inline-block text-left max-w-full rounded-xl px-3 py-2 ${
            isUser
              ? "bg-primary/10 border border-primary/20"
              : isError
              ? "bg-destructive/5 border border-destructive/10"
              : "bg-secondary/50"
          }`}
        >
          <div
            className={`text-[12px] leading-relaxed whitespace-pre-wrap break-words ${
              isError ? "text-destructive" : "text-foreground/90"
            }`}
          >
            {renderContent(message.content)}
          </div>
        </div>
        <p className="text-[9px] text-muted-foreground/40 mt-1">
          {new Date(message.timestamp).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </p>
      </div>
    </div>
  );
}

// --- Inline File Block sub-component ---

function InlineFileBlock({
  language,
  filename,
  content,
}: {
  language: string;
  filename: string;
  content: string;
}) {
  const [copied, setCopied] = useState(false);

  // Infer filename from language if not provided
  const displayFilename = filename || inferFilename(language);
  const isDownloadable = !!displayFilename && /\.\w+$/.test(displayFilename);

  const handleCopy = () => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    toast.success("Code copied to clipboard");
    setTimeout(() => setCopied(false), 1500);
  };

  const handleDownload = () => {
    if (displayFilename) {
      downloadFile(displayFilename, content);
      toast.success(`Downloaded ${displayFilename}`);
    }
  };

  // Language badge color
  const langColor = getLangColor(language);

  return (
    <div className="my-2 rounded-lg border border-border bg-code-bg overflow-hidden">
      {/* Header bar */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-code-header border-b border-border">
        <div className="flex items-center gap-2">
          <FileCode className="w-3 h-3 text-muted-foreground" />
          <span
            className="text-[11px]"
            style={{ color: langColor, fontFamily: "'JetBrains Mono', monospace" }}
          >
            {displayFilename || language || "code"}
          </span>
          {language && (
            <span
              className="text-[9px] px-1.5 py-0.5 rounded"
              style={{ backgroundColor: `${langColor}15`, color: langColor }}
            >
              {language.toUpperCase()}
            </span>
          )}
          <span className="text-[9px] text-muted-foreground/50">
            {content.split("\n").length} lines
          </span>
        </div>
        <div className="flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={handleCopy}
            title="Copy to clipboard"
          >
            {copied ? (
              <Check className="w-3 h-3 text-emerald-400" />
            ) : (
              <Copy className="w-3 h-3 text-zinc-500 hover:text-zinc-300" />
            )}
          </Button>
          {isDownloadable && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={handleDownload}
              title={`Download ${displayFilename}`}
            >
              <Download className="w-3 h-3 text-zinc-500 hover:text-zinc-300" />
            </Button>
          )}
        </div>
      </div>
      {/* Code content */}
      <div
        className="overflow-auto max-h-[300px] p-3"
        style={{ fontFamily: "'JetBrains Mono', monospace" }}
      >
        {content.split("\n").map((line, i) => (
          <div key={i} className="flex">
            <span className="text-zinc-700 select-none w-7 shrink-0 text-right mr-3 text-[10px] leading-[1.4rem]">
              {i + 1}
            </span>
            <pre className="text-[11px] leading-[1.4rem] text-zinc-400 whitespace-pre-wrap">
              {line || " "}
            </pre>
          </div>
        ))}
      </div>
    </div>
  );
}

// --- Helper: Infer filename from language ---

function inferFilename(lang: string): string {
  const map: Record<string, string> = {
    bat: "script.bat",
    batch: "script.bat",
    cmd: "script.cmd",
    powershell: "script.ps1",
    ps1: "script.ps1",
    python: "script.py",
    py: "script.py",
    toml: "config.toml",
    yaml: "config.yaml",
    yml: "config.yml",
    json: "config.json",
    sh: "script.sh",
    bash: "script.sh",
  };
  return map[lang.toLowerCase()] || "";
}

// --- Helper: Language color ---

function getLangColor(lang: string): string {
  const colors: Record<string, string> = {
    bat: "#4ec9b0",
    batch: "#4ec9b0",
    cmd: "#4ec9b0",
    powershell: "#2196f3",
    ps1: "#2196f3",
    python: "#ffd43b",
    py: "#ffd43b",
    toml: "#9c5fff",
    yaml: "#ff6b6b",
    yml: "#ff6b6b",
    json: "#00d4aa",
    sh: "#4ec9b0",
    bash: "#4ec9b0",
    javascript: "#f7df1e",
    js: "#f7df1e",
    typescript: "#3178c6",
    ts: "#3178c6",
  };
  return colors[lang.toLowerCase()] || "#888";
}