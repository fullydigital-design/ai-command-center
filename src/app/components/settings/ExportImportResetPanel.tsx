// ============================================================
// ExportImportResetPanel — Export/Import/Reset for Settings page
// ============================================================
// Extracted from SettingsPage.tsx (Phase 5)

import { useState, useRef } from "react";
import {
  Settings,
  Download,
  Upload,
  Trash2,
  RotateCcw,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import {
  exportSettings,
  downloadSettingsFile,
  importSettings,
  readSettingsFile,
  resetAllState,
} from "../../services/settingsService";

export function ExportImportResetPanel() {
  const [includeKeys, setIncludeKeys] = useState(false);
  const [confirmReset, setConfirmReset] = useState<"soft" | "hard" | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleExport = async () => {
    try {
      const data = await exportSettings({ includeFullKeys: includeKeys });
      downloadSettingsFile(data);
      toast.success("Settings exported", {
        description: includeKeys
          ? "File includes full API keys \u2014 keep it safe!"
          : "API keys are redacted. Use 'Include full keys' for migration.",
      });
    } catch (e) {
      toast.error("Export failed", { description: String(e) });
    }
  };

  const handleImport = async (file: File) => {
    try {
      const raw = await readSettingsFile(file);
      const result = await importSettings(raw);
      if (result.imported.length > 0) {
        toast.success("Settings imported!", {
          description: result.imported.join(", "),
        });
      }
      if (result.skipped.length > 0) {
        toast.info("Some items skipped", {
          description: result.skipped.join(", "),
        });
      }
      if (result.imported.length > 0) {
        setTimeout(() => window.location.reload(), 1200);
      }
    } catch (e) {
      toast.error("Import failed", { description: e instanceof Error ? e.message : String(e) });
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleReset = (level: "soft" | "hard") => {
    resetAllState(level);
    toast.success(level === "hard" ? "Full reset complete" : "Settings reset to defaults", {
      description: "Reloading...",
    });
    setTimeout(() => window.location.reload(), 800);
  };

  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <Settings className="w-4 h-4 text-primary" />
        <h3 className="text-sm text-foreground">Export / Import / Reset</h3>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Export */}
        <div className="space-y-3">
          <div className="text-xs text-foreground">Export Settings</div>
          <div className="text-xs text-muted-foreground">
            Download your settings as a JSON file for backup or migration to another machine.
          </div>
          <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
            <input
              type="checkbox"
              checked={includeKeys}
              onChange={(e) => setIncludeKeys(e.target.checked)}
              className="rounded border-border"
            />
            Include full API keys
          </label>
          {includeKeys && (
            <div className="flex items-start gap-1.5 text-[10px] text-chart-4">
              <AlertCircle className="w-3 h-3 mt-0.5 shrink-0" />
              Keys will be saved in plain text. Keep the file secure.
            </div>
          )}
          <button
            onClick={handleExport}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary/10 text-primary text-xs hover:bg-primary/20 transition-colors w-full justify-center"
          >
            <Download className="w-3.5 h-3.5" /> Export JSON
          </button>
        </div>

        {/* Import */}
        <div className="space-y-3">
          <div className="text-xs text-foreground">Import Settings</div>
          <div className="text-xs text-muted-foreground">
            Load settings from a previously exported JSON file. Existing settings are merged (not
            overwritten).
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleImport(file);
            }}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-secondary text-foreground text-xs hover:bg-secondary/80 transition-colors w-full justify-center"
          >
            <Upload className="w-3.5 h-3.5" /> Choose JSON File
          </button>
        </div>

        {/* Reset */}
        <div className="space-y-3">
          <div className="text-xs text-foreground">Reset State</div>
          <div className="text-xs text-muted-foreground">
            Clear app state and return to defaults. Export your settings first if you want to keep
            them.
          </div>
          {confirmReset === null ? (
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmReset("soft")}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground transition-colors flex-1 justify-center"
              >
                <RotateCcw className="w-3 h-3" /> Soft Reset
              </button>
              <button
                onClick={() => setConfirmReset("hard")}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-destructive/10 text-destructive text-xs hover:bg-destructive/20 transition-colors flex-1 justify-center"
              >
                <Trash2 className="w-3 h-3" /> Full Reset
              </button>
            </div>
          ) : (
            <div className="p-3 bg-destructive/5 border border-destructive/20 rounded-lg space-y-2">
              <div className="text-xs text-destructive">
                {confirmReset === "hard"
                  ? "This will clear ALL app data including packages, launcher presets, and settings."
                  : "This will clear API keys, models, and paths. Packages and presets are preserved."}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setConfirmReset(null)}
                  className="flex-1 px-3 py-1.5 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    handleReset(confirmReset);
                    setConfirmReset(null);
                  }}
                  className="flex-1 px-3 py-1.5 rounded-lg bg-destructive text-white text-xs hover:bg-destructive/90 transition-colors"
                >
                  Confirm {confirmReset === "hard" ? "Full" : "Soft"} Reset
                </button>
              </div>
            </div>
          )}
          <div className="text-[10px] text-muted-foreground/60">
            Soft = settings only. Full = everything (packages, presets, caches).
          </div>
        </div>
      </div>
    </div>
  );
}
