# AI Command Center -- Cursor Instructions Index

> Last updated: February 25, 2026

## Documents

| File | Purpose | Status |
|------|---------|--------|
| `ARCHITECTURE.md` | Full project architecture, service layer, component map, AI subsystem | Current |
| `BACKEND_TASKS.md` | 9 ordered tasks with priority levels, Python code samples, testing checklist | Current |
| `BAT_INTEGRATION.md` | How to wrap the 3000-line BAT via subprocess + SSE streaming | Current |
| `SESSION_LOG.md` | Development history from Figma Make sessions (8 sessions) | Archive |

## Quick Start for Cursor

```
Project: AI Command Center -- local AI/CGI Pipeline Command Center dashboard.
React 18 + Vite 6 + TypeScript + Tailwind CSS v4 + React Router v7.
48 shadcn/ui components. 4 pages. 9 services. SSE stream support via TerminalOutput.
AI subsystem: 6 shared AI components + aiService.ts (OpenRouter API with 3-tier fallback).
Target: RTX 5090 (32GB VRAM) + Ryzen 9 9950X + 86GB RAM. Windows 10/11.
AI Root: C:\_AI\_test_fresh_all_AI\. Backend port: 8420. Frontend port: 5173.
Local path: [YOUR_LOCAL_PATH_TO_PROJECT]\
Workflow: Figma Make = UI design + cursor instruction .md files in /src/app/docs/ (catalogued in INDEX.md). Cursor = local Python backend implementation.
Read ARCHITECTURE.md first, then BACKEND_TASKS.md for implementation order.
Frontend is 100% complete -- DO NOT modify .tsx files. Your job: create the FastAPI backend at C:\_AI\_test_fresh_all_AI\backend\.
Today's task: [YOUR TASK HERE]
```

## Component Summary

| Domain | Files | What |
|--------|-------|------|
| Pages | 4 .tsx | CommandCenter (unified dashboard+system+services), Training, Community, Settings |
| AI Components | 6 .tsx in `/components/ai/` | AIAssistant, ChatPanel, CodeEditor, SuggestionsPanel, DownloadButton, index.ts |
| Feature Components | 2 .tsx | TrainingConfigOptimizer (Training page), ScriptLab (CommandCenter ScriptLab tab) |
| UI Components | 48 files in `/components/ui/` | shadcn/ui + TerminalOutput |
| Services | 9 .ts in `/services/` | aiService, trainingService, systemService, setupService, settingsService, apiKeys, githubService, huggingfaceService, civitaiService |
| Shared Types | `types.ts` | TypeScript contracts for all backend responses |