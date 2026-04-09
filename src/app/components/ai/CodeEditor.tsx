// ============================================================
// CodeEditor — Simple syntax-highlighted code viewer/editor
// ============================================================
// Supports .toml and .bat/.sh with line numbers.
// Used for displaying/editing training configs and scripts.

import { useState, useRef, useCallback, useEffect } from "react";
import {
  Upload,
  Copy,
  Check,
  FileCode,
  Download,
  RotateCcw,
  Maximize2,
  Minimize2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "../ui/button";
import { downloadFile } from "../../services/aiService";

interface CodeEditorProps {
  /** Current content */
  value: string;
  /** Called when user edits content */
  onChange: (value: string) => void;
  /** Language for syntax hints */
  language: "toml" | "bat" | "sh" | "python" | "text";
  /** Filename displayed in header */
  filename?: string;
  /** Whether content is editable */
  readOnly?: boolean;
  /** Callback when user uploads a file */
  onFileUpload?: (content: string, filename: string) => void;
  /** Max height before scrolling */
  maxHeight?: number;
  /** Show line numbers */
  showLineNumbers?: boolean;
  /** Additional class */
  className?: string;
  /** Optional original content for diff/reset */
  originalContent?: string;
}

// Basic syntax color mapping
const tokenColors: Record<string, string> = {
  comment: "text-zinc-600",
  key: "text-[#00d4aa]",
  value: "text-amber-300",
  string: "text-amber-300",
  number: "text-[#6d5aff]",
  boolean: "text-[#6d5aff]",
  section: "text-[#6d5aff]",
  keyword: "text-cyan-400",
  command: "text-emerald-400",
  variable: "text-amber-400",
  flag: "text-cyan-300",
  echo: "text-zinc-400",
};

function highlightLine(line: string, language: string): React.ReactNode {
  if (language === "toml") return highlightToml(line);
  if (language === "bat" || language === "sh") return highlightBat(line);
  return <span className="text-zinc-300">{line}</span>;
}

function highlightToml(line: string): React.ReactNode {
  const trimmed = line.trim();

  // Comments
  if (trimmed.startsWith("#")) {
    return <span className={tokenColors.comment}>{line}</span>;
  }

  // Section headers [section]
  if (/^\[.*\]$/.test(trimmed)) {
    return <span className={tokenColors.section}>{line}</span>;
  }

  // Key = value
  const kvMatch = line.match(/^(\s*)([\w.]+)(\s*=\s*)(.*)/);
  if (kvMatch) {
    const [, indent, key, eq, val] = kvMatch;
    return (
      <>
        <span>{indent}</span>
        <span className={tokenColors.key}>{key}</span>
        <span className="text-zinc-500">{eq}</span>
        {highlightTomlValue(val)}
      </>
    );
  }

  return <span className="text-zinc-300">{line}</span>;
}

function highlightTomlValue(val: string): React.ReactNode {
  const trimmed = val.trim();

  if (trimmed === "true" || trimmed === "false") {
    return <span className={tokenColors.boolean}>{val}</span>;
  }
  if (/^-?\d+(\.\d+)?(e[+-]?\d+)?$/.test(trimmed)) {
    return <span className={tokenColors.number}>{val}</span>;
  }
  if (trimmed.startsWith('"') || trimmed.startsWith("'")) {
    return <span className={tokenColors.string}>{val}</span>;
  }
  if (trimmed.startsWith("[")) {
    return <span className={tokenColors.value}>{val}</span>;
  }

  return <span className={tokenColors.value}>{val}</span>;
}

function highlightBat(line: string): React.ReactNode {
  const trimmed = line.trim();

  // REM comments or :: comments
  if (/^(rem\s|::)/i.test(trimmed)) {
    return <span className={tokenColors.comment}>{line}</span>;
  }

  // Echo statements
  if (/^echo\s/i.test(trimmed)) {
    return (
      <>
        <span className={tokenColors.keyword}>{line.slice(0, line.search(/echo/i) + 4)}</span>
        <span className={tokenColors.echo}>{line.slice(line.search(/echo/i) + 4)}</span>
      </>
    );
  }

  // @echo off
  if (/^@echo\s+off/i.test(trimmed)) {
    return <span className={tokenColors.keyword}>{line}</span>;
  }

  // Labels :label
  if (trimmed.startsWith(":")) {
    return <span className={tokenColors.section}>{line}</span>;
  }

  // Keywords
  const keywords = /^(set|setlocal|endlocal|if|else|goto|call|exit|cd|for|pause|start|del|mkdir|rmdir|copy|move|ren|type|find|findstr|sort|xcopy|robocopy|taskkill|tasklist|net|reg|sc|where|pushd|popd)\b/i;
  if (keywords.test(trimmed)) {
    const match = trimmed.match(keywords);
    if (match) {
      const kwLen = match[0].length;
      const indent = line.length - line.trimStart().length;
      return (
        <>
          <span>{line.slice(0, indent)}</span>
          <span className={tokenColors.keyword}>{line.slice(indent, indent + kwLen)}</span>
          <span className="text-zinc-300">{line.slice(indent + kwLen)}</span>
        </>
      );
    }
  }

  // Variables %VAR% or !VAR!
  const varParts = line.split(/(%[^%]+%|![^!]+!)/g);
  if (varParts.length > 1) {
    return (
      <>
        {varParts.map((part, i) =>
          /^(%[^%]+%|![^!]+!)$/.test(part) ? (
            <span key={i} className={tokenColors.variable}>{part}</span>
          ) : (
            <span key={i} className="text-zinc-300">{part}</span>
          )
        )}
      </>
    );
  }

  return <span className="text-zinc-300">{line}</span>;
}

export function CodeEditor({
  value,
  onChange,
  language,
  filename,
  readOnly = false,
  onFileUpload,
  maxHeight = 500,
  showLineNumbers = true,
  className = "",
  originalContent,
}: CodeEditorProps) {
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const preRef = useRef<HTMLPreElement>(null);

  const lines = value.split("\n");
  const hasChanges = originalContent !== undefined && value !== originalContent;

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    toast.success("Copied to clipboard");
    setTimeout(() => setCopied(false), 1500);
  }, [value]);

  const handleDownload = useCallback(() => {
    const fn = filename || `file.${language}`;
    downloadFile(fn, value);
    toast.success(`Downloaded ${fn}`);
  }, [value, filename, language]);

  const handleReset = useCallback(() => {
    if (originalContent !== undefined) {
      onChange(originalContent);
    }
  }, [originalContent, onChange]);

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (ev) => {
        const content = ev.target?.result as string;
        onChange(content);
        onFileUpload?.(content, file.name);
      };
      reader.readAsText(file);
      e.target.value = ""; // Reset for re-upload
    },
    [onChange, onFileUpload]
  );

  // Sync scroll between textarea and pre
  const handleScroll = useCallback(() => {
    if (textareaRef.current && preRef.current) {
      preRef.current.scrollTop = textareaRef.current.scrollTop;
      preRef.current.scrollLeft = textareaRef.current.scrollLeft;
    }
  }, []);

  const effectiveMaxHeight = expanded ? 800 : maxHeight;

  return (
    <div className={`bg-code-bg border border-border rounded-xl overflow-hidden ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-code-header border-b border-border">
        <div className="flex items-center gap-2">
          <FileCode className="w-3.5 h-3.5 text-muted-foreground" />
          <span
            className="text-xs text-zinc-400"
            style={{ fontFamily: "'JetBrains Mono', monospace" }}
          >
            {filename || `untitled.${language}`}
          </span>
          {hasChanges && (
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400">
              Modified
            </span>
          )}
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">
            {lines.length} lines
          </span>
        </div>
        <div className="flex items-center gap-1">
          {onFileUpload && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept=".toml,.bat,.sh,.cmd,.py,.txt,.cfg,.yaml,.yml,.json"
                onChange={handleFileSelect}
                className="hidden"
              />
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => fileInputRef.current?.click()}
                title="Upload file"
              >
                <Upload className="w-3.5 h-3.5 text-zinc-500" />
              </Button>
            </>
          )}
          {hasChanges && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={handleReset}
              title="Reset to original"
            >
              <RotateCcw className="w-3.5 h-3.5 text-zinc-500" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={handleCopy}
            title="Copy all"
          >
            {copied ? (
              <Check className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <Copy className="w-3.5 h-3.5 text-zinc-500" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={handleDownload}
            title="Download file"
          >
            <Download className="w-3.5 h-3.5 text-zinc-500" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setExpanded(!expanded)}
            title={expanded ? "Collapse" : "Expand"}
          >
            {expanded ? (
              <Minimize2 className="w-3.5 h-3.5 text-zinc-500" />
            ) : (
              <Maximize2 className="w-3.5 h-3.5 text-zinc-500" />
            )}
          </Button>
        </div>
      </div>

      {/* Editor body */}
      <div className="relative" style={{ maxHeight: effectiveMaxHeight }}>
        {value.length === 0 ? (
          // Empty state
          <div
            className="flex flex-col items-center justify-center py-16 text-center"
            style={{ minHeight: 200 }}
          >
            <Upload className="w-8 h-8 text-muted-foreground/20 mb-3" />
            <p className="text-sm text-muted-foreground/60 mb-1">
              No content loaded
            </p>
            <p className="text-[11px] text-muted-foreground/40 mb-4">
              Upload a file or paste content to get started
            </p>
            {onFileUpload && (
              <Button
                variant="secondary"
                size="sm"
                className="text-xs"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="w-3 h-3 mr-1" />
                Upload .{language} file
              </Button>
            )}
          </div>
        ) : readOnly ? (
          // Read-only syntax highlighted view
          <div
            className="overflow-auto p-4"
            style={{
              maxHeight: effectiveMaxHeight,
              fontFamily: "'JetBrains Mono', monospace",
            }}
          >
            {lines.map((line, i) => (
              <div key={i} className="flex">
                {showLineNumbers && (
                  <span className="text-zinc-700 select-none w-10 shrink-0 text-right mr-4 text-[11px] leading-[1.6rem]">
                    {i + 1}
                  </span>
                )}
                <span className="text-[11px] leading-[1.6rem] whitespace-pre">
                  {highlightLine(line, language)}
                </span>
              </div>
            ))}
          </div>
        ) : (
          // Editable overlay approach
          <div
            className="relative overflow-auto"
            style={{ maxHeight: effectiveMaxHeight }}
          >
            {/* Syntax highlighted background */}
            <pre
              ref={preRef}
              className="absolute inset-0 p-4 pointer-events-none overflow-hidden"
              style={{ fontFamily: "'JetBrains Mono', monospace" }}
              aria-hidden
            >
              {lines.map((line, i) => (
                <div key={i} className="flex">
                  {showLineNumbers && (
                    <span className="text-zinc-700 select-none w-10 shrink-0 text-right mr-4 text-[11px] leading-[1.6rem]">
                      {i + 1}
                    </span>
                  )}
                  <span className="text-[11px] leading-[1.6rem] whitespace-pre">
                    {highlightLine(line, language)}
                  </span>
                </div>
              ))}
            </pre>
            {/* Transparent textarea for editing */}
            <textarea
              ref={textareaRef}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              onScroll={handleScroll}
              spellCheck={false}
              className="relative w-full h-full bg-transparent text-transparent caret-emerald-400 p-4 resize-none outline-none"
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: "11px",
                lineHeight: "1.6rem",
                minHeight: Math.min(lines.length * 25.6 + 32, effectiveMaxHeight),
                paddingLeft: showLineNumbers ? "5rem" : "1rem",
                tabSize: 2,
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}