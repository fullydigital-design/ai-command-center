// ============================================================
// DownloadButton — File download button with preview option
// ============================================================

import { useState } from "react";
import { Download, Eye, EyeOff, FileCode, Monitor, Terminal } from "lucide-react";
import { Button } from "../ui/button";
import { downloadFile } from "../../services/aiService";
import type { GeneratedFile } from "../../services/aiService";

interface DownloadButtonProps {
  file: GeneratedFile;
  variant?: "compact" | "full";
  className?: string;
}

export function DownloadButton({
  file,
  variant = "compact",
  className = "",
}: DownloadButtonProps) {
  const [showPreview, setShowPreview] = useState(false);

  const PlatformIcon = file.platform === "windows" ? Monitor : Terminal;
  const extension = file.platform === "windows" ? ".bat" : ".sh";

  if (variant === "compact") {
    return (
      <Button
        variant="secondary"
        size="sm"
        className={`gap-1.5 text-xs ${className}`}
        onClick={() => downloadFile(file.filename, file.content)}
        title={`Download ${file.filename}`}
      >
        <PlatformIcon className="w-3 h-3" />
        <Download className="w-3 h-3" />
        {file.filename}
      </Button>
    );
  }

  return (
    <div className={`rounded-lg border border-border bg-card overflow-hidden ${className}`}>
      <div className="flex items-center justify-between px-3 py-2 bg-secondary/50">
        <div className="flex items-center gap-2">
          <FileCode className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-xs text-foreground">{file.filename}</span>
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">
            {file.type}
          </span>
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">
            {file.platform === "windows" ? "Windows" : "Linux"}
          </span>
          {file.aiModified && (
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-primary/10 text-primary">
              AI Modified
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setShowPreview(!showPreview)}
            title={showPreview ? "Hide preview" : "Show preview"}
          >
            {showPreview ? (
              <EyeOff className="w-3.5 h-3.5 text-muted-foreground" />
            ) : (
              <Eye className="w-3.5 h-3.5 text-muted-foreground" />
            )}
          </Button>
          <Button
            variant="default"
            size="sm"
            className="h-7 text-[11px] gap-1"
            onClick={() => downloadFile(file.filename, file.content)}
          >
            <Download className="w-3 h-3" />
            Download {extension}
          </Button>
        </div>
      </div>

      {showPreview && (
        <div
          className="overflow-auto max-h-[300px] p-4 bg-code-bg"
          style={{ fontFamily: "'JetBrains Mono', monospace" }}
        >
          {file.content.split("\n").map((line, i) => (
            <div key={i} className="flex">
              <span className="text-zinc-700 select-none w-8 shrink-0 text-right mr-3 text-[10px] leading-[1.5rem]">
                {i + 1}
              </span>
              <pre className="text-[11px] leading-[1.5rem] text-zinc-400 whitespace-pre-wrap">
                {line || " "}
              </pre>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// --- Multi-download panel for script generator ---

interface DownloadPanelProps {
  files: GeneratedFile[];
  className?: string;
}

export function DownloadPanel({ files, className = "" }: DownloadPanelProps) {
  if (files.length === 0) return null;

  const windowsFiles = files.filter((f) => f.platform === "windows");
  const linuxFiles = files.filter((f) => f.platform === "linux");

  return (
    <div className={`space-y-3 ${className}`}>
      {windowsFiles.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Monitor className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-[11px] text-muted-foreground">Windows</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {windowsFiles.map((f) => (
              <DownloadButton key={f.filename} file={f} variant="compact" />
            ))}
          </div>
        </div>
      )}
      {linuxFiles.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Terminal className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-[11px] text-muted-foreground">Linux / Cloud GPU</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {linuxFiles.map((f) => (
              <DownloadButton key={f.filename} file={f} variant="compact" />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}