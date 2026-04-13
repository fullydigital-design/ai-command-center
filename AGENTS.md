# AGENTS.md — AI Agent Conventions

Rules and context for AI agents working in this codebase.

## Project snapshot

Local AI/ML dashboard for Windows RTX workstations. The React frontend is complete and
ships with full mock data — it is never broken. The FastAPI backend runs as a sidecar
process (or standalone) and provides live hardware stats. Tauri wraps both into a desktop
app.

## File map — what matters

```
src/app/
  services/types.ts          ← TypeScript contract. Backend JSON must match these shapes exactly.
  services/createService.ts  ← Factory for 3-tier fetch (Backend → Browser API → Mock).
  services/mocks/            ← Mock data used when backend is offline. Do not modify.
  services/env.ts            ← isTauriEnv(), getApiBase(). Single source of truth.
  backend/fastapi/
    main.py                  ← FastAPI entry, CORS, router registration
    config.py                ← AI_ROOT, port constants, path helpers
    routers/                 ← One file per domain (system, training, services, etc.)
    utils/gpu.py             ← pynvml wrapper (working)
    utils/processes.py       ← psutil helpers + training process scanner (working)
    utils/bat_runner.py      ← BAT subprocess + SSE streaming (partially stubbed)
src-tauri/src/lib.rs         ← Tauri commands and sidecar spawn logic
```

## Service pattern

Every frontend service follows this priority chain — your backend endpoints plug into Tier 1:

```
Tier 1: Backend  →  fetch("http://127.0.0.1:8000/api/...")
Tier 2: Browser  →  direct API call (GitHub / HuggingFace / CivitAI)
Tier 3: Mock     →  always works, graceful degradation
```

## Backend development rules

1. Match `types.ts` shapes field-for-field — no extra fields, no missing fields
2. All routers mount under `/api/` prefix (set in `main.py`)
3. Import path helpers from `config.py` — never hardcode `C:\` paths
4. Async endpoints only — use `async def` throughout
5. SSE endpoints use `sse-starlette`'s `EventSourceResponse`

## What is stubbed (remaining work)

| File | What's needed |
|---|---|
| `routers/training.py` | Enrich process scan results with TOML config parsing + TensorBoard log reading |
| `utils/bat_runner.py` | Wire subprocess execution with real-time SSE line streaming |

## Constraints

- Do not modify any `.tsx` or `.ts` file in `src/app/` unless fixing a verified bug
- Do not change port numbers anywhere
- Do not add Python dependencies without updating `requirements.txt`
- Do not write Windows-only code in `utils/` — keep it portable where possible
- Tauri build (`pnpm tauri:build`) takes 10+ minutes — do not run during exploration

## Testing

```bash
pnpm test           # Vitest unit tests (jsdom environment)
pnpm vitest run     # Single-pass (CI mode)
```

Tests live in `src/**/*.{test,spec}.{ts,tsx}`. Setup file: `src/test/setup.ts`.
The backend has integration tests in `src/app/backend/tests/` — run with `pytest`.
