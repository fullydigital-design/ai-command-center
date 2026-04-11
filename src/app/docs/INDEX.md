# AI Command Center -- Documentation Index

> Last updated: April 2026

## Documents

| File | Purpose | Status |
|------|---------|--------|
| `ARCHITECTURE.md` | Full project architecture, service layer, component map, AI subsystem | Current |
| `BACKEND_TASKS.md` | 9 ordered tasks with priority levels, Python code samples, testing checklist | Current |
| `BAT_INTEGRATION.md` | How to wrap the 3000-line BAT via subprocess + SSE streaming | Current |
| `SESSION_LOG.md` | Development history (8 sessions) | Archive |

## Quick Start

```
Project: AI Command Center -- local AI/CGI Pipeline Command Center dashboard.
React 18 + Vite 6 + TypeScript + Tailwind CSS v4 + React Router v7.
6 shadcn/ui components. 5 pages. 17 service files. SSE stream support via TerminalOutput.
AI subsystem: 6 shared AI components + aiService.ts (OpenRouter API with 3-tier fallback).
Target: RTX 5090 (32GB VRAM) + Ryzen 9 9950X + 86GB RAM. Windows 10/11.
AI Root: C:\_AI\_test_fresh_all_AI\. Backend port: 8000. Frontend port: 5173.
Frontend is 100% complete -- DO NOT modify .tsx files. Backend: FastAPI at src/app/backend/fastapi/.
Read ARCHITECTURE.md first, then BACKEND_TASKS.md for implementation order.
```

## Component Summary

| Domain | Files | What |
|--------|-------|------|
| Pages | 5 .tsx | CommandCenter (unified dashboard+system+services), Training, Community, Packages, Settings |
| AI Components | 6 .tsx in `/components/ai/` | AIAssistant, ChatPanel, CodeEditor, SuggestionsPanel, DownloadButton, index.ts |
| Feature Components | 2 .tsx | TrainingConfigOptimizer (Training page), ScriptLab (CommandCenter ScriptLab tab) |
| UI Components | 6 files in `/components/ui/` | shadcn/ui (button, badge, scroll-area, skeleton, sonner) + TerminalOutput |
| Services | 17 .ts in `/services/` | aiService, trainingService, systemService, setupService, settingsService, apiKeys, githubService, huggingfaceService, civitaiService, createService, env, fetchWithRetry, healthMonitor, packageService, packageTypes, toolsRegistry, types |
| Shared Types | `types.ts` | TypeScript contracts for all backend responses |
