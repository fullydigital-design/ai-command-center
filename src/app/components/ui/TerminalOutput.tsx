import { useState, useEffect, useRef } from "react";
import {
  X,
  Minimize2,
  Maximize2,
  Copy,
  Check,
  Lock,
  Unlock,
  Square,
} from "lucide-react";
import { toast } from "sonner";
import type { TerminalLine } from "../../services/setupService";
import { classifyLine } from "../../services/setupService";

interface TerminalOutputProps {
  /** Lines to display */
  lines: TerminalLine[];
  /** Title shown in the terminal header */
  title?: string;
  /** Whether a task is currently running */
  running?: boolean;
  /** Callback to close/dismiss the terminal */
  onClose?: () => void;
  /** Callback to stop a running task */
  onStop?: () => void;
  /** Max height in pixels (default: 400) */
  maxHeight?: number;
  /** Show as a full overlay panel vs inline */
  variant?: "inline" | "panel";
  /** Whether to animate lines appearing (browser simulation) */
  animated?: boolean;
}

const typeColors: Record<TerminalLine["type"], string> = {
  ok: "text-emerald-400",
  warn: "text-amber-400",
  error: "text-red-400",
  install: "text-cyan-400",
  info: "text-[#6d5aff]",
  progress: "text-muted-foreground/70",
  plain: "text-muted-foreground",
};

export function TerminalOutput({
  lines,
  title = "Terminal",
  running = false,
  onClose,
  onStop,
  maxHeight = 400,
  variant = "inline",
  animated = false,
}: TerminalOutputProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollLock, setScrollLock] = useState(true);
  const [copied, setCopied] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [visibleCount, setVisibleCount] = useState(animated ? 0 : lines.length);

  // Auto-scroll to bottom when new lines arrive (if not locked)
  useEffect(() => {
    if (scrollLock && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [lines.length, visibleCount, scrollLock]);

  // Animated line reveal for browser simulation
  useEffect(() => {
    if (!animated || lines.length === 0) {
      setVisibleCount(lines.length);
      return;
    }

    if (visibleCount >= lines.length) return;

    const nextLine = lines[visibleCount];
    const currentLine = visibleCount > 0 ? lines[visibleCount - 1] : null;
    const delay = currentLine
      ? Math.max(30, nextLine.timestamp - currentLine.timestamp)
      : 100;

    const timer = setTimeout(() => {
      setVisibleCount((c) => c + 1);
    }, delay);

    return () => clearTimeout(timer);
  }, [animated, lines, visibleCount]);

  // Reset animation when lines change completely
  useEffect(() => {
    if (animated) setVisibleCount(0);
  }, [lines.length === 0]); // eslint-disable-line

  const copyLog = () => {
    const text = lines.map((l) => l.text).join("\n");
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
    toast.success("Log copied to clipboard!");
  };

  const displayLines = animated ? lines.slice(0, visibleCount) : lines;

  if (minimized) {
    return (
      <div
        className={`bg-code-bg border border-border rounded-xl overflow-hidden ${
          variant === "panel" ? "fixed bottom-0 left-0 right-0 z-50" : ""
        }`}
      >
        <div className="flex items-center justify-between px-4 py-2 bg-code-header border-b border-border">
          <div className="flex items-center gap-2">
            <div className="flex gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-red-500/70" />
              <span className="w-2.5 h-2.5 rounded-full bg-yellow-500/70" />
              <span className={`w-2.5 h-2.5 rounded-full ${running ? "bg-green-500 animate-pulse" : "bg-green-500/70"}`} />
            </div>
            <span className="text-xs text-muted-foreground ml-2" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
              {title}
            </span>
            {running && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 animate-pulse">
                Running...
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setMinimized(false)}
              className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors"
              title="Maximize"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
            {onClose && (
              <button
                onClick={onClose}
                className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors"
                title="Close"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`bg-code-bg border border-border rounded-xl overflow-hidden ${
        variant === "panel" ? "fixed bottom-0 left-0 right-0 z-50" : ""
      }`}
    >
      {/* Header bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-code-header border-b border-border">
        <div className="flex items-center gap-2">
          <div className="flex gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500/70" />
            <span className="w-2.5 h-2.5 rounded-full bg-yellow-500/70" />
            <span className={`w-2.5 h-2.5 rounded-full ${running ? "bg-green-500 animate-pulse" : "bg-green-500/70"}`} />
          </div>
          <span className="text-xs text-muted-foreground ml-2" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
            {title}
          </span>
          {running && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 animate-pulse">
              Running...
            </span>
          )}
          {!running && lines.length > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">
              {lines.length} lines
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setScrollLock(!scrollLock)}
            className={`p-1 rounded transition-colors ${
              scrollLock ? "text-emerald-400 hover:text-emerald-300" : "text-muted-foreground hover:text-foreground"
            }`}
            title={scrollLock ? "Auto-scroll: ON" : "Auto-scroll: OFF"}
          >
            {scrollLock ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={copyLog}
            className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors"
            title="Copy log"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
          {running && onStop && (
            <button
              onClick={onStop}
              className="p-1 rounded text-red-400 hover:text-red-300 transition-colors"
              title="Stop"
            >
              <Square className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            onClick={() => setMinimized(true)}
            className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors"
            title="Minimize"
          >
            <Minimize2 className="w-3.5 h-3.5" />
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors"
              title="Close"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Terminal body */}
      <div
        ref={scrollRef}
        className="overflow-auto p-4"
        style={{ maxHeight, fontFamily: "'JetBrains Mono', monospace" }}
        onScroll={() => {
          if (!scrollRef.current) return;
          const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
          // Auto-disable scroll lock if user scrolls up
          const atBottom = scrollHeight - scrollTop - clientHeight < 30;
          if (!atBottom && scrollLock) setScrollLock(false);
          if (atBottom && !scrollLock) setScrollLock(true);
        }}
      >
        {displayLines.length === 0 && !running && (
          <div className="text-muted-foreground/60 text-xs text-center py-8">
            No output yet. Run a setup action to see output here.
          </div>
        )}
        {displayLines.length === 0 && running && (
          <div className="text-muted-foreground text-xs animate-pulse">
            Waiting for output...
          </div>
        )}
        {displayLines.map((line) => (
          <div key={line.id} className="flex">
            <span className="text-muted-foreground/40 select-none w-8 shrink-0 text-right mr-3 text-[10px] leading-[1.6rem]">
              {line.id + 1}
            </span>
            <pre className={`text-[11px] leading-[1.6rem] whitespace-pre-wrap break-all ${typeColors[line.type]}`}>
              {line.text || " "}
            </pre>
          </div>
        ))}
        {running && (
          <div className="flex items-center gap-2 mt-1">
            <span className="text-muted-foreground/40 select-none w-8 shrink-0 text-right mr-3 text-[10px] leading-[1.6rem]">
              {displayLines.length + 1}
            </span>
            <span className="inline-block w-2 h-4 bg-emerald-400 animate-pulse" />
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Helper: parse raw text lines into TerminalLine objects.
 * Useful when receiving raw stdout from the backend.
 */
export function parseRawOutput(text: string): TerminalLine[] {
  return text.split("\n").map((line, i) => ({
    id: i,
    text: line,
    type: classifyLine(line),
    timestamp: Date.now(),
  }));
}