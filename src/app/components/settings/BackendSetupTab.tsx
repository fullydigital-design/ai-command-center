// ============================================================
// BackendSetupTab — Backend setup guide tab for Settings page
// ============================================================
// Extracted from SettingsPage.tsx (Phase 5)

import {
  CheckCircle2,
  Zap,
  Copy,
  Check,
  Info,
  Terminal,
  Package,
} from "lucide-react";

export function BackendSetupTab({
  copiedId,
  copyToClipboard,
}: {
  copiedId: string | null;
  copyToClipboard: (text: string, id: string) => void;
}) {
  const requirementsTxt = `# AI Command Center — Python Backend Dependencies
# Install with: pip install -r requirements.txt

# Core
fastapi==0.115.*
uvicorn[standard]==0.34.*
pydantic==2.*

# System monitoring
psutil==6.*
pynvml==12.*

# Training monitor
tbparse==0.0.*
tomli==2.*

# GitHub integration
PyGithub==2.*
gitpython==3.*

# AI model API
requests==2.*
httpx==0.28.*

# Settings & config
cryptography==44.*
python-dotenv==1.*

# Real-time updates (optional — pick one)
sse-starlette==2.*        # Option B: Server-Sent Events
# websockets==14.*        # Option C: WebSocket

# System info (Windows)
wmi==1.*; sys_platform == "win32"
py-cpuinfo==9.*
`;

  const mainPy = `"""
AI Command Center — FastAPI Backend
Run with: uvicorn main:app --host 127.0.0.1 --port 8000 --reload
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="AI Command Center", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Tauri app origin
    allow_methods=["*"],
    allow_headers=["*"],
)

# Import routers
# from routers import settings, training, system, github

@app.get("/api/health")
async def health():
    import sys, platform
    return {
        "status": "ok",
        "version": "0.1.0",
        "python_version": sys.version,
        "platform": platform.system(),
        "port": 8000,
    }

# Mount routers:
# app.include_router(settings.router, prefix="/api/settings")
# app.include_router(training.router, prefix="/api/training")
# app.include_router(system.router, prefix="/api/system")
# app.include_router(github.router, prefix="/api/github")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)
`;

  const endpointChecklist = [
    { group: "Settings", endpoints: [
      { method: "GET", path: "/api/settings", desc: "Load all settings", service: "settingsService.ts" },
      { method: "PUT", path: "/api/settings", desc: "Save all settings", service: "settingsService.ts" },
      { method: "POST", path: "/api/settings/test-key", desc: "Test an API key", service: "settingsService.ts" },
      { method: "GET", path: "/api/models/lookup", desc: "Lookup model info", service: "settingsService.ts" },
      { method: "POST", path: "/api/paths/validate", desc: "Validate local paths", service: "settingsService.ts" },
    ]},
    { group: "Training", endpoints: [
      { method: "GET", path: "/api/training/jobs", desc: "Scan training processes", service: "trainingService.ts" },
      { method: "GET", path: "/api/training/poll", desc: "Poll for updates", service: "trainingService.ts" },
      { method: "GET", path: "/api/training/gpu", desc: "GPU stats (pynvml)", service: "trainingService.ts" },
      { method: "GET", path: "/api/training/services", desc: "Service health check", service: "trainingService.ts" },
      { method: "GET", path: "/api/training/stream", desc: "SSE stream (optional)", service: "trainingService.ts" },
    ]},
    { group: "System", endpoints: [
      { method: "GET", path: "/api/system/specs", desc: "Hardware info", service: "systemService.ts" },
      { method: "GET", path: "/api/system/software", desc: "Software versions", service: "systemService.ts" },
      { method: "GET", path: "/api/system/cleanup", desc: "Scan cleanup items", service: "systemService.ts" },
      { method: "POST", path: "/api/system/cleanup/run", desc: "Execute cleanup", service: "systemService.ts" },
      { method: "GET", path: "/api/system/env", desc: "Environment vars", service: "systemService.ts" },
      { method: "GET", path: "/api/system/optimizations", desc: "Optimization checks", service: "systemService.ts" },
    ]},
    { group: "GitHub", endpoints: [
      { method: "GET", path: "/api/github/repos", desc: "List tracked repos", service: "githubService.ts" },
      { method: "POST", path: "/api/github/repos/check-all", desc: "Check all for updates", service: "githubService.ts" },
      { method: "POST", path: "/api/github/repos/:id/pull", desc: "Git pull update", service: "githubService.ts" },
      { method: "POST", path: "/api/github/repos/:id/clone", desc: "Git clone repo", service: "githubService.ts" },
    ]},
    { group: "Setup & Audit", endpoints: [
      { method: "GET", path: "/api/setup/detect", desc: "Detect installed tools", service: "setupService.ts" },
      { method: "POST", path: "/api/setup/run", desc: "Run setup action (BAT)", service: "setupService.ts" },
      { method: "GET", path: "/api/setup/stream", desc: "SSE terminal output", service: "setupService.ts" },
      { method: "GET", path: "/api/setup/preflight", desc: "System preflight checks", service: "setupService.ts" },
      { method: "GET", path: "/api/audit/path", desc: "PATH audit (Python)", service: "setupService.ts" },
      { method: "POST", path: "/api/audit/path/fix", desc: "Apply PATH fixes", service: "setupService.ts" },
      { method: "GET", path: "/api/audit/env", desc: "Env variable audit", service: "setupService.ts" },
      { method: "POST", path: "/api/audit/env/fix", desc: "Apply env fixes", service: "setupService.ts" },
      { method: "GET", path: "/api/setup/model-audit", desc: "Shared models audit", service: "setupService.ts" },
      { method: "POST", path: "/api/setup/reset", desc: "Reset (soft/hard/nuclear)", service: "setupService.ts" },
    ]},
  ];

  return (
    <div className="space-y-6">
      {/* Quick start */}
      <div className="flex items-start gap-3 px-4 py-3 bg-chart-2/5 border border-chart-2/15 rounded-xl">
        <Terminal className="w-4 h-4 text-chart-2 mt-0.5 shrink-0" />
        <div>
          <div className="text-xs text-foreground">Backend Setup Guide</div>
          <div className="text-xs text-muted-foreground mt-0.5">
            Everything you need to connect the FastAPI backend. The frontend auto-detects{" "}
            <code className="text-primary" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
              window.__TAURI__
            </code>{" "}
            and switches from localStorage to API calls automatically.
          </div>
        </div>
      </div>

      {/* requirements.txt */}
      <div className="bg-card border border-border rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Package className="w-4 h-4 text-primary" />
            <h3 className="text-sm text-foreground">requirements.txt</h3>
          </div>
          <button
            onClick={() => copyToClipboard(requirementsTxt, "requirements")}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary text-foreground text-xs hover:bg-secondary/80 transition-colors"
          >
            {copiedId === "requirements" ? (
              <><Check className="w-3.5 h-3.5 text-chart-2" /> Copied!</>
            ) : (
              <><Copy className="w-3.5 h-3.5" /> Copy</>
            )}
          </button>
        </div>
        <pre
          className="text-[11px] text-muted-foreground p-4 bg-secondary rounded-lg overflow-x-auto max-h-64"
          style={{ fontFamily: "'JetBrains Mono', monospace" }}
        >
          {requirementsTxt}
        </pre>
        <div className="mt-3 flex gap-2">
          <button
            onClick={() => copyToClipboard("pip install -r requirements.txt", "pip-cmd")}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary/10 text-primary text-xs hover:bg-primary/20 transition-colors"
          >
            {copiedId === "pip-cmd" ? (
              <><Check className="w-3 h-3 text-chart-2" /> Copied!</>
            ) : (
              <><Terminal className="w-3 h-3" /> Copy pip install command</>
            )}
          </button>
          <button
            onClick={() => copyToClipboard("pip install fastapi uvicorn psutil pynvml tbparse tomli PyGithub gitpython sse-starlette wmi py-cpuinfo", "pip-oneliner")}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-secondary text-foreground text-xs hover:bg-secondary/80 transition-colors"
          >
            {copiedId === "pip-oneliner" ? (
              <><Check className="w-3 h-3 text-chart-2" /> Copied!</>
            ) : (
              <><Terminal className="w-3 h-3" /> Copy one-liner</>
            )}
          </button>
        </div>
      </div>

      {/* FastAPI starter */}
      <div className="bg-card border border-border rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-primary" />
            <h3 className="text-sm text-foreground">main.py — FastAPI Starter</h3>
          </div>
          <button
            onClick={() => copyToClipboard(mainPy, "main-py")}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary text-foreground text-xs hover:bg-secondary/80 transition-colors"
          >
            {copiedId === "main-py" ? (
              <><Check className="w-3.5 h-3.5 text-chart-2" /> Copied!</>
            ) : (
              <><Copy className="w-3.5 h-3.5" /> Copy</>
            )}
          </button>
        </div>
        <pre
          className="text-[11px] text-muted-foreground p-4 bg-secondary rounded-lg overflow-x-auto max-h-64"
          style={{ fontFamily: "'JetBrains Mono', monospace" }}
        >
          {mainPy}
        </pre>
        <div className="mt-3">
          <button
            onClick={() => copyToClipboard("uvicorn main:app --host 127.0.0.1 --port 8000 --reload", "uvicorn-cmd")}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary/10 text-primary text-xs hover:bg-primary/20 transition-colors"
          >
            {copiedId === "uvicorn-cmd" ? (
              <><Check className="w-3 h-3 text-chart-2" /> Copied!</>
            ) : (
              <><Terminal className="w-3 h-3" /> Copy run command</>
            )}
          </button>
        </div>
      </div>

      {/* Endpoint checklist */}
      <div className="bg-card border border-border rounded-xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <CheckCircle2 className="w-4 h-4 text-primary" />
          <h3 className="text-sm text-foreground">API Endpoint Checklist</h3>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">
            {endpointChecklist.reduce((s, g) => s + g.endpoints.length, 0)} endpoints
          </span>
        </div>
        <div className="space-y-4">
          {endpointChecklist.map((group) => (
            <div key={group.group}>
              <h4 className="text-xs text-foreground mb-2">{group.group}</h4>
              <div className="space-y-1">
                {group.endpoints.map((ep) => (
                  <div
                    key={ep.path}
                    className="flex items-center gap-3 py-1.5 px-3 bg-secondary/50 rounded-lg text-xs"
                  >
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] ${
                        ep.method === "GET"
                          ? "bg-chart-2/15 text-chart-2"
                          : ep.method === "POST"
                          ? "bg-chart-4/15 text-chart-4"
                          : "bg-primary/15 text-primary"
                      }`}
                    >
                      {ep.method}
                    </span>
                    <span
                      className="text-primary flex-1"
                      style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "11px" }}
                    >
                      {ep.path}
                    </span>
                    <span className="text-muted-foreground">{ep.desc}</span>
                    <span className="text-muted-foreground/50" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "10px" }}>
                      {ep.service}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Architecture note */}
      <div className="bg-card border border-border rounded-xl p-5">
        <div className="flex items-center gap-2 mb-3">
          <Info className="w-4 h-4 text-primary" />
          <h3 className="text-sm text-foreground">Architecture</h3>
        </div>
        <div className="text-xs text-muted-foreground space-y-2">
          <p>
            The frontend service layer (<code className="text-primary" style={{ fontFamily: "'JetBrains Mono', monospace" }}>/src/app/services/*.ts</code>) auto-detects the runtime environment:
          </p>
          <div className="grid grid-cols-2 gap-3 mt-3">
            <div className="p-3 bg-secondary rounded-lg">
              <div className="text-foreground mb-1">Browser Mode (current)</div>
              <div className="text-muted-foreground">localStorage + simulated data</div>
              <div className="text-muted-foreground mt-1">No backend needed</div>
            </div>
            <div className="p-3 bg-secondary rounded-lg">
              <div className="text-foreground mb-1">Tauri Mode (local PC)</div>
              <div className="text-muted-foreground">FastAPI @ 127.0.0.1:8000</div>
              <div className="text-muted-foreground mt-1">Auto-detected via window.__TAURI__</div>
            </div>
          </div>
          <p className="mt-2">
            Every service function checks <code className="text-primary" style={{ fontFamily: "'JetBrains Mono', monospace" }}>isTauriEnv()</code> first and falls back to localStorage if the backend is unreachable. Zero frontend changes needed to go live.
          </p>
        </div>
      </div>
    </div>
  );
}
