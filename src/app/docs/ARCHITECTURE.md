# AI Command Center -- Architecture Reference

> For Cursor AI. The React UI is 100% done. Your job is the Python backend.

---

## System Overview

```
 USER'S MACHINE (Windows 10/11)
 +--------------------------------------------------------------+
 |                                                              |
 |  +---------------------+     +----------------------------+ |
 |  |  React Frontend     |---->|  FastAPI Backend            | |
 |  |  (Vite dev :5173)   |<----|  Port 8420                  | |
 |  |                     |     |                              | |
 |  |  - 4 pages          |     |  - System stats (psutil)     | |
 |  |  - 9 services       |     |  - GPU stats (pynvml)        | |
 |  |  - 48 shadcn/ui     |     |  - Process mgmt (subprocess) | |
 |  |  - SSE terminal     |     |  - TensorBoard (tbparse)     | |
 |  |  - AI subsystem     |     |  - BAT wrapper (subprocess)  | |
 |  |  - Mock data layer  |     |  - AI proxy (OpenRouter)     | |
 |  +---------------------+     +----------+--^---------------+ |
 |          |                              |  |                 |
 |          |  OpenRouter API  <-----------|--+                 |
 |          |  (direct or proxied)         |                    |
 |          +------------------------------+------------+       |
 |          |    C:\_AI\_test_fresh_all_AI\             |       |
 |          |                              |            |       |
 |          |  ComfyUI/     (:8188)        |            |       |
 |          |  SwarmUI/     (:7801)        |            |       |
 |          |  kohya_ss/    (:7860)        |            |       |
 |          |  musubi-tuner/(:7870 CLI)    |            |       |
 |          |  models/      (shared)       |            |       |
 |          |  training_data/              |            |       |
 |          |  RTX5090_FULL_SETUP.bat  <---+            |       |
 |          |  RTX5090_PATH_AUDIT.py                    |       |
 |          +-------------------------------------------+       |
 |                                                              |
 |  Ollama  (:11434) -- installed globally                      |
 |  TensorBoard (:6006) -- launched per training job            |
 +--------------------------------------------------------------+
```

---

## Frontend File Structure

```
src/
+-- app/
|   +-- App.tsx                         # Root -- <RouterProvider>
|   +-- routes.ts                       # 4 routes (see below)
|   |
|   +-- components/
|   |   +-- Layout.tsx                  # Sidebar nav (4 items + logo)
|   |   +-- CommandCenter.tsx           # Unified Command Center -- 6 tabs:
|   |   |                               #   Overview (health bar, GPU monitor,
|   |   |                               #   processes, perf charts, actionable
|   |   |                               #   alerts, storage, activity, env vars),
|   |   |                               #   Services (health checks, start/stop,
|   |   |                               #   API endpoints), Updates, Cleanup,
|   |   |                               #   Optimization, ScriptLab
|   |   +-- TrainingPage.tsx            # 2 tabs: Monitor + AI Optimizer
|   |   |                               #   Monitor: Kohya/Musubi job detection,
|   |   |                               #   loss charts, GPU stats, TensorBoard
|   |   |                               #   AI Optimizer: TrainingConfigOptimizer
|   |   +-- TrainingConfigOptimizer.tsx  # TOML editor, VRAM estimator, presets,
|   |   |                               #   AI analysis, suggestion cards, chat
|   |   +-- ServicesPanel.tsx           # Embeddable services panel -- 5 service
|   |   |                               #   cards with live health checks,
|   |   |                               #   expandable details, API endpoints table.
|   |   |                               #   Used by CommandCenter Services tab.
|   |   +-- CommunityHubPage.tsx        # Community Hub -- GitHub/HF/CivitAI
|   |   |                               #   3-column feed with SourceBadge
|   |   |                               #   popovers showing FetchMeta
|   |   +-- ScriptLab.tsx               # 5 sub-modes: Script Generator (flag
|   |   |                               #   configurator + 22 custom nodes),
|   |   |                               #   BAT Analyzer, Kohya Config,
|   |   |                               #   Musubi Config, AI Chat
|   |   +-- SettingsPage.tsx            # Settings -- API keys (OpenRouter,
|   |   |                               #   GitHub, HuggingFace, CivitAI),
|   |   |                               #   AI model selector, local paths, theme
|   |   +-- GitHubPage.tsx              # [UNUSED] Legacy -- superseded by CommunityHub
|   |   |
|   |   +-- ai/                         # SHARED AI COMPONENT LIBRARY
|   |   |   +-- index.ts               # Barrel export
|   |   |   +-- AIAssistant.tsx         # Split-panel: content editor + chat + download
|   |   |   +-- ChatPanel.tsx           # Standalone AI chat with streaming
|   |   |   +-- CodeEditor.tsx          # Syntax-highlighted text editor
|   |   |   +-- SuggestionsPanel.tsx    # Categorized AI suggestion cards
|   |   |   +-- DownloadButton.tsx      # File download + DownloadPanel
|   |   |
|   |   +-- figma/                      # Figma Make runtime components
|   |   |   +-- ImageWithFallback.tsx   # Protected -- do not modify
|   |   |
|   |   +-- ui/                         # 48 shadcn/ui components
|   |       +-- TerminalOutput.tsx      # Reusable SSE terminal display
|   |       +-- button.tsx, card.tsx, tabs.tsx, popover.tsx, ...
|   |       +-- utils.ts               # cn() helper
|   |
|   +-- services/                       # SERVICE ABSTRACTION LAYER (9 files)
|   |   +-- types.ts                    # Shared TypeScript types (contract)
|   |   +-- aiService.ts               # OpenRouter chat/stream + system prompts
|   |   +-- settingsService.ts          # Settings CRUD (localStorage)
|   |   +-- apiKeys.ts                  # Shared API key reader + FetchMeta
|   |   +-- trainingService.ts          # Training jobs + TensorBoard launcher
|   |   +-- systemService.ts            # System stats, cleanup, updates, optim
|   |   +-- setupService.ts            # BAT wrapper: detect installs, run
|   |   |                               #   setup actions, SSE stream, preflight
|   |   +-- githubService.ts            # GitHub API (repos, trending)
|   |   +-- huggingfaceService.ts       # HuggingFace API (models, papers)
|   |   +-- civitaiService.ts           # CivitAI API (models, images)
|   |
|   +-- backend/                        # SCRIPTS (copy to AI root)
|   |   +-- RTX5090_FULL_SETUP.bat      # 16-option setup/update/cleanup menu
|   |   +-- RTX5090_PATH_AUDIT.py       # PATH + env var auditor
|   |
|   +-- docs/                           # THIS FOLDER
|       +-- INDEX.md
|       +-- ARCHITECTURE.md             # (this file)
|       +-- BACKEND_TASKS.md
|       +-- BAT_INTEGRATION.md
|       +-- SESSION_LOG.md
|
+-- styles/
    +-- index.css                       # Tailwind v4 entry
    +-- tailwind.css                    # @import chain
    +-- theme.css                       # CSS custom properties (dark theme)
    +-- fonts.css                       # Inter + JetBrains Mono
```

---

## Routes

| Route | Component | Description |
|-------|-----------|-------------|
| `/` | `CommandCenter` | Unified Command Center -- system monitoring, services, updates, cleanup, optimization, ScriptLab |
| `/training` | `TrainingPage` | Training Monitor + AI Config Optimizer |
| `/community` | `CommunityHubPage` | Community Hub -- GitHub/HF/CivitAI feeds |
| `/settings` | `SettingsPage` | Settings -- API keys, paths, models |

---

## Page Tab Breakdown

| Page | Tabs | Components |
|------|------|------------|
| CommandCenter | `Overview`, `Services`, `Updates`, `Cleanup`, `Optimization`, `ScriptLab` | ServicesPanel.tsx, ScriptLab.tsx |
| TrainingPage | `Monitor`, `AI Optimizer` | TrainingConfigOptimizer.tsx |
| ScriptLab | `Script Generator`, `BAT Analyzer`, `Kohya Config`, `Musubi Config`, `AI Chat` | (internal sub-modes) |

---

## AI Subsystem Architecture

The AI features share a reusable component pattern and a single service file:

```
aiService.ts (service layer)
    |
    +-- streamChat()            SSE streaming to OpenRouter
    +-- chatCompletion()        Non-streaming single response
    +-- isAIAvailable()         Check if API key exists
    +-- buildTrainingSystemPrompt()   Kohya/Musubi hardware-aware prompt
    +-- buildScriptSystemPrompt()     BAT/script engineering prompt
    +-- generateMessageId()     UUID for chat messages
    +-- downloadFile()          Browser download helper
    |
    +-- Types: ChatMessage, AISuggestion, AIStreamCallbacks, GeneratedFile

AIAssistant.tsx (shared split-panel component)
    |
    +-- Left: CodeEditor (syntax-highlighted, upload, edit)
    +-- Right: ChatPanel (streaming, suggestions, prompts)
    +-- Bottom: DownloadButton / DownloadPanel
    |
    +-- Used by: TrainingConfigOptimizer, ScriptLab (BAT Analyzer, Kohya Config, Musubi Config)

ChatPanel.tsx (standalone chat)
    +-- Used by: ScriptLab (AI Chat mode), AIAssistant (right panel)
```

### 3-Tier AI Fallback

```
1. Tauri/Backend → POST /api/ai/chat (FastAPI proxies to OpenRouter, hides API key)
2. Browser direct → fetch("https://openrouter.ai/api/v1/...") with user's API key
3. No key → Helpful error message, all features degrade gracefully
```

### AI Model Selection

Users select their AI model in Settings. The selected model ID is stored in localStorage under `ai_command_center_settings.selected_model`. Default: `anthropic/claude-sonnet-4-20250514`.

---

## Service Abstraction Layer

Every service file follows this pattern:

```typescript
function isTauriEnv(): boolean {
  return typeof window !== "undefined" && "__TAURI__" in window;
}

function getApiBase(): string {
  return "http://127.0.0.1:8420/api";
}

export async function getSomeData(): Promise<SomeType[]> {
  // PATH A: Tauri/Backend connected
  if (isTauriEnv()) {
    try {
      const res = await fetch(`${getApiBase()}/some/endpoint`);
      if (res.ok) return await res.json();
    } catch { /* fall through */ }
  }

  // PATH B: Live browser API (for community services with API keys)
  const apiKey = getApiKey("github");
  if (apiKey) {
    try { /* direct API call */ } catch { /* fall through */ }
  }

  // PATH C: Mock data (always works)
  return mockData;
}
```

**Priority chain:** Tauri backend -> Live browser API -> Mock data
**Key insight:** The frontend needs ZERO changes when you add the backend. Just implement the FastAPI endpoints and `isTauriEnv()` starts returning `true` when wrapped in Tauri, or the frontend can simply detect the backend is reachable.

> **For local dev without Tauri:** Change `isTauriEnv()` to also check if the FastAPI backend is reachable. Or just have the services call `fetch("http://127.0.0.1:8420/api/...")` directly and fall through to mock on failure. The pattern already handles this.

---

## Service -> API Endpoint Mapping

### aiService.ts

| Frontend Function | Backend Endpoint | What It Does |
|-------------------|------------------|--------------|
| `streamChat()` | `POST /api/ai/chat` | Proxy streaming chat to OpenRouter (hides key) |
| `chatCompletion()` | `POST /api/ai/chat` | Same endpoint, non-streaming mode |
| `analyzeConfig()` | `POST /api/ai/analyze-config` | Analyze TOML config with hardware context |
| `generateScript()` | `POST /api/ai/generate-script` | Generate .bat with AI |

### trainingService.ts

| Frontend Function | Backend Endpoint | What It Does |
|-------------------|------------------|--------------|
| `getTrainingJobs()` | `GET /api/training/jobs` | Scan running training processes (psutil + TOML config + TensorBoard) |
| `pollTrainingUpdates()` | `GET /api/training/jobs` | Same endpoint, polled every 3s |
| `getServiceHealth()` | `GET /api/training/services` | Check Kohya (:7860) and Musubi ports |
| `getFullLossHistory(jobId)` | `GET /api/training/jobs/:id/loss` | Read full TensorBoard event file (tbparse) |
| `checkTensorBoardStatus()` | `GET /api/tensorboard/status` | Check if TensorBoard process is running + logdir |
| `launchTensorBoard(logdir)` | `POST /api/tensorboard/launch` | `subprocess.Popen("tensorboard --logdir ... --port 6006")` |
| `stopTensorBoard()` | `POST /api/tensorboard/stop` | Kill TensorBoard process |

### systemService.ts

| Frontend Function | Backend Endpoint | What It Does |
|-------------------|------------------|--------------|
| `getGpuStats()` | `GET /api/system/gpu` | pynvml: utilization, VRAM, temp, power |
| `getCpuStats()` | `GET /api/system/cpu` | psutil: per-core usage, freq, temp |
| `getStorageBreakdown()` | `GET /api/system/storage` | Scan model dirs, categorize by type |
| `getCleanupItems()` | `GET /api/cleanup/scan` | Scan temp/cache dirs with sizes |
| `runCleanup(ids)` | `POST /api/cleanup/execute` | Delete selected items |
| `getUpdateStatus()` | `GET /api/updates/check` | git remote vs local HEAD for each repo |
| `runUpdate(id)` | `POST /api/updates/run/:id` | `git pull` + `pip install -r requirements.txt` |
| `getOptimizations()` | `GET /api/system/optimizations` | Check env vars, registry, CUDA settings |
| `applyOptimization(id)` | `POST /api/system/optimize/:id` | setx, PowerShell, reg.exe commands |

### setupService.ts

| Frontend Function | Backend Endpoint | What It Does |
|-------------------|------------------|--------------|
| `detectInstalls()` | `GET /api/setup/detect` | Check which tools are installed (file existence) |
| `runSetupAction(action)` | `POST /api/setup/run` | Run BAT menu option via subprocess |
| `connectToSetupStream()` | `GET /api/setup/stream` (SSE) | Stream BAT stdout in real-time |
| `getPreflightChecks()` | `GET /api/setup/preflight` | System requirements check |
| `getPathAudit()` | `GET /api/audit/path` | Run RTX5090_PATH_AUDIT.py --json |
| `applyPathFixes()` | `POST /api/audit/path/fix` | Apply PATH fixes via winreg |
| `getEnvAudit()` | `GET /api/audit/env` | Check CUDA_HOME, HF_HOME etc. |
| `applyEnvFixes()` | `POST /api/audit/env/fix` | setx env vars |

### githubService.ts, huggingfaceService.ts, civitaiService.ts

These already have **live browser API bridges** (Path B) that work without the backend.
They read API keys from Settings via `apiKeys.ts` and have 15-minute caching.
Backend endpoints are optional enhancements for rate limit avoidance.

### settingsService.ts

Settings are stored in `localStorage` under key `ai_command_center_settings`.
No backend needed -- but could be upgraded to a config.json via backend.

---

## Types Contract (src/app/services/types.ts)

The TypeScript types are the contract. The backend must return JSON matching these shapes:

- `TrainingJob` -- 25 fields including `configPath`, `tensorboardLogDir`, `lossHistory`
- `GpuStats` -- name, utilization, vram, temp, power
- `ServiceHealth` -- id, name, running, port, pid, url
- `AppSettings` -- apiKeys, selectedModel, models, paths
- `DataSource` -- "simulated" | "tensorboard" | "process" | "nvidia" | "config-file"

### AI Types (src/app/services/aiService.ts)

- `ChatMessage` -- id, role (user|assistant|system), content, timestamp
- `AISuggestion` -- id, category (critical|performance|quality|optional|rtx5090), title, description, field, currentValue, suggestedValue, applied, dismissed
- `AIStreamCallbacks` -- onToken, onComplete, onError
- `GeneratedFile` -- filename, content, tool, type, platform, generatedAt, aiModified

---

## ScriptLab: Script Generator Custom Nodes

The Script Generator mode exposes all 22 ComfyUI custom nodes from the RTX5090_FULL_SETUP.bat, individually selectable with categorized UI:

| Category | Nodes | Default On |
|----------|-------|------------|
| Essential (5) | Manager, Impact Pack, Inspire Pack, KJ Nodes, Custom Scripts | All |
| Image/ControlNet (5) | Advanced ControlNet, ControlNet Aux, IP-Adapter Plus, GGUF Loader, Florence2 | 4/5 (Florence2 off) |
| Video/Animation (4) | Video Helper Suite, AnimateDiff Evolved, Frame Interpolation, FizzNodes | 1/4 (VHS only) |
| Utility (6) | WAS Suite, Essentials, rgthree, Efficiency Nodes, Easy Use, Crystools | 3/6 |
| Face (2) | ReActor, FaceID Plus | None |

Quick-select buttons: All / None / Defaults. Per-category select/deselect all.

---

## Key Design Decisions

1. **Each page owns ONE domain** -- no duplicate information across pages
2. **Command Center = unified hub** -- merged Dashboard + System + Tools into one page with 6 tabs (Overview, Services, Updates, Cleanup, Optimization, ScriptLab). Services tab embeds ServicesPanel for health checks + start/stop. Alerts are actionable -- clicking switches tabs instead of navigating away
3. **TensorBoard = training companion** -- not a standalone service
4. **Services = Command Center tab** -- health checks, start/stop, API endpoints live in the Services tab (ServicesPanel.tsx), not a separate page. Sidebar has 4 items: Command Center, Training, Community, Settings
5. **TerminalOutput component** -- reusable SSE-driven terminal for any long-running task
6. **Data Provenance** -- every data point shows its source (Simulated/Live/TensorBoard/etc.)
7. **No Tauri = graceful degradation** -- everything works with mock data in browser
8. **AI features = client-side first** -- OpenRouter calls work directly from browser, backend proxy is optional upgrade for key hiding

---

## Hardware Constants

```python
GPU = "NVIDIA GeForce RTX 5090"
VRAM = 32  # GB GDDR7
CPU = "AMD Ryzen 9 9950X"
CORES = 16  # 32 threads
RAM = 86  # GB DDR5 (close to 96GB capacity)
AI_ROOT = r"C:\_AI\_test_fresh_all_AI"
BACKEND_PORT = 8420
```

## Service Ports (never change these)

```python
COMFYUI_PORT = 8188
SWARMUI_PORT = 7801
KOHYA_PORT = 7860
MUSUBI_PORT = 7870  # CLI, no web UI
OLLAMA_PORT = 11434
TENSORBOARD_PORT = 6006
BACKEND_PORT = 8420
```