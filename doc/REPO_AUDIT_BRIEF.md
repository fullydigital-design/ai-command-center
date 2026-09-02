# REPO_AUDIT_BRIEF.md — Deep Read-Only Audit Brief

You are an independent **audit model**. Your job: exhaustively verify the state of this
repository and produce one complete, evidence-backed report plus an implementation plan
to bring the repo to clean v1. **You do not implement anything** — you audit and report.

This document is self-contained. You need no prior knowledge of the repo. Everything
below (including "Known starting points") is a **hypothesis to verify**, not a fact to
trust — including `AGENTS.md`, `README.md` and any docs you find.

---

## 1. Mission

1. Perform a full read-only audit of the entire repository: frontend, backend, Tauri
   wrapper, tests, docs, repo hygiene, security.
2. Verify every claim you make with concrete evidence: `file:line` references or command
   output you actually ran.
3. Deliverables:
   - **Full report saved to `doc/AUDIT_FINDINGS.md`** (create only this one file).
   - Executive summary + implementation-plan highlights pasted in chat (short; the full
     detail lives in the file).

## 2. Hard constraints (non-negotiable)

- **READ-ONLY.** The only file you may create/modify is `doc/AUDIT_FINDINGS.md`.
- Do **not** modify, delete, rename, or reformat anything else — not even docs, not even
  obvious typos. Report them instead.
- Do **not** modify any `.ts`/`.tsx` file under `src/app/` even if you find a verified
  bug — that is the implementation phase's job. Report it.
- Do **not** run `pnpm tauri:build` (takes 10+ minutes). Static review of Tauri only.
- Do **not** change port numbers (backend is 127.0.0.1:8000; frontend dev 1420).
- Do **not** install new Python/pnpm packages. If a test needs a dependency that is
  missing, record it as a finding ("test X blocked: missing dep Y") instead.
- Do **not** push, branch, or commit anything.
- You MAY run: `pnpm vitest run`, `pytest`, a local backend (`uvicorn main:app` on
  127.0.0.1:8000) to exercise endpoints, and read-only git commands
  (`git status`, `git log`, `git ls-files`). Shut down any process you start.

## 3. Context snapshot (what this project is)

Local AI/ML dashboard for Windows RTX workstations. Three layers:

- **Frontend** — React + TypeScript + Vite + Tailwind. Complete, ships with mock data.
  Every service follows a 3-tier chain: Backend fetch → Browser API (GitHub/HF/CivitAI)
  → Mock fallback. Contract: `src/app/services/types.ts`.
- **Backend** — FastAPI sidecar at `src/app/backend/fastapi/` (routers under `/api/`,
  port 8000, localhost only). Provides live hardware stats, training job detection
  (psutil + TOML configs + TensorBoard logs), BAT-script setup streaming via SSE,
  TensorBoard control, AI proxy.
- **Desktop** — Tauri wrapper in `src-tauri/` spawning the backend as a sidecar.

Key entry points: `src/app/services/types.ts`, `src/app/services/createService.ts`,
`src/app/services/env.ts`, `src/app/backend/fastapi/main.py`,
`src/app/backend/fastapi/config.py`, `src-tauri/src/lib.rs`.

## 4. Known starting points (verify, don't trust)

Observations from a prior partial review. Confirm or refute each; they are seeded so you
spend time on depth, not rediscovery:

1. **`AGENTS.md` "What is stubbed" table is outdated.**
   - `routers/training.py` is fully implemented: TOML parsing (`tomllib`/`tomli`),
     TensorBoard loss reading via `tbparse`, endpoints `/jobs`, `/jobs/{id}/loss`,
     `/services`, `/gpu`, `/poll`. Path-traversal guard `_is_safe_config_path` exists.
   - SSE streaming for BAT scripts is **fully implemented in `routers/setup.py`**
     (POST `/api/setup/run` → `stream_id`; GET `/api/setup/stream` → `EventSourceResponse`;
     lock-protected process registry; zombie reaping on startup/shutdown). The frontend
     calls both (`src/app/services/setupService.ts`, ~lines 316 and 350).
2. **`utils/bat_runner.py` appears to be dead code** — no module imports it. It
   duplicates the launch logic in `setup.py`, and its `classify_line()` duplicates
   frontend `classifyLine()` in `setupService.ts`. Confirm with a repo-wide grep and
   recommend delete-or-wire.
3. **Tests exist**: `src/app/backend/tests/test_endpoints.py` (integration suite that
   requires a live backend on 127.0.0.1:8000), `test_toml_parsing.py`, `sample_configs/`.
   Frontend uses Vitest (`pnpm test`, single-pass `pnpm vitest run`).
4. **Missing repo artifacts**: `CHANGELOG.md`, `CONTRIBUTING.md` do not exist.
   `.env.example` and a PyInstaller spec
   (`fastapi-backend-x86_64-pc-windows-msvc.spec` + `build_backend.py`) do exist.
5. **Possible tracked junk** in `src/app/backend/fastapi/`: `uvicorn.out.log`, `tmp/`,
   `__pycache__/` — check `.gitignore` and `git ls-files` to see what is actually tracked.
6. **Docs overlap/staleness**: root `AGENTS.md` + `CLAUDE.md` + `README.md`, plus
   `src/app/docs/` (`ARCHITECTURE.md`, `BACKEND_TASKS.md`, `BAT_INTEGRATION.md`,
   `INDEX.md`, `SESSION_LOG.md`). Some likely contradict the current code — map which.
7. **Security-sensitive endpoints** in `setup.py`: `/api/setup/run` launches a BAT file
   via subprocess; `/api/setup/audit/env/fix` runs `setx`. Verify CORS origin list in
   `config.py`, that the server binds 127.0.0.1 only, and whether any browser-reachable
   CSRF-style risk exists. This is a localhost desktop app — judge proportionally
   (Docker/Sentry/public-API-key suggestions are probably out of scope; say so if you agree).
8. `routers/ai_proxy.py` streams via SSE too — check how provider API keys are handled
   and whether any secret is committed.

## 5. Audit scope — cover ALL of it

For each area: enumerate every file, classify each as OK / needs fix / dead / stale, and
note evidence. Nothing may be left unexamined "because it looked fine at a glance."

### A. Frontend (`src/app/`)
- `services/types.ts` — the contract. Compare **field-for-field** against every backend
  endpoint response (see F). List every mismatch (extra/missing/renamed/mistyped field).
- 3-tier chain in `createService.ts` + every service: does Backend→Browser→Mock degrade
  correctly? Timeouts? Error swallowing?
- `env.ts` (`isTauriEnv`, `getApiBase`) — single source of truth actually used everywhere?
- Components/hooks/routes: dead components, broken imports, unreachable routes, mock-only
  screens, console-error-prone patterns, hardcoded URLs or ports outside `env.ts`.
- Mocks: do they still match `types.ts` shapes?
- Frontend tests: coverage gaps, stale snapshots.

### B. Backend core (`src/app/backend/fastapi/`)
- `main.py`, `config.py`: router registration, CORS origins content, path helpers
  (no hardcoded `C:\` outside `config.py`), logging setup, PyInstaller `_MEIPASS` path.
- Every router (`system`, `training`, `tensorboard`, `services`, `setup`, `ai_proxy`):
  response shapes vs `types.ts`, async correctness (blocking calls inside `async def`,
  e.g. `time.sleep`, sync file IO on hot paths), error handling, timeouts on subprocess
  calls, resource cleanup.
- `utils/gpu.py`, `utils/processes.py`: correctness, portability (repo rule: portable
  where possible), NVIDA-free fallback behavior.
- `requirements.txt` vs actual imports: missing or unused deps.

### C. Backend ops & security
- `setup.py` subprocess lifecycle: leaks, race conditions, `stream_id` predictability,
  output encoding (BAT output may be cp866/cp1251 — how are decode errors handled?).
- `setx` endpoint abuse potential on localhost; CORS config; binding address.
- Path traversal guards: `training.py` has one — do `tensorboard.py`, `services.py`,
  `setup.py` need the same for user-supplied paths?
- Secrets scan: `.env*`, committed keys/tokens, `ATTRIBUTIONS.md` accuracy.

### D. Tests (run them, record output)
- `pnpm vitest run` — paste summary (passed/failed counts).
- Backend: start `uvicorn main:app --host 127.0.0.1 --port 8000`, run
  `pytest src/app/backend/tests/` and/or `python test_endpoints.py`; record results;
  shut the server down.
- List what is NOT covered but should be (per endpoint / per service tier).

### E. Tauri & packaging (static only)
- `src-tauri/src/lib.rs`, `main.rs`, `tauri.conf.json`, capabilities: sidecar spawn
  logic, backend health detection, window config, updater/signing placeholders.
- `package.json` scripts, `justfile`, `LAUNCH_AI_COMMAND_CENTER.bat`: do they do what
  their names claim?
- PyInstaller spec + `build_backend.py`: internal consistency (entry point, hidden
  imports for `tbparse`/`pynvml`, data files). Do not build.

### F. Contract cross-check (highest-value item)
Build one table: every `types.ts` type → producing backend endpoint(s) → verdict
(match / mismatch with field list / no backend / mock-only). This table goes into the
report as-is.

### G. Repo hygiene & docs
- `.gitignore` vs tracked files (logs, caches, `tmp/`, `desktop.ini`).
- `README.md` accuracy (install steps, ports, scripts). `AGENTS.md` corrections list —
  what must change so the next AI agent is not misled (the stub table, at minimum).
- `src/app/docs/` staleness: which files contradict the code, which are session logs
  that should be archived or deleted.
- Missing artifacts worth adding for v1: `CHANGELOG.md`, `CONTRIBUTING.md` — recommend
  content outlines, do not create them.

## 6. Method — how to organize the work (≤ 6 subagents)

You may spawn up to 6 subagents (or, if your environment lacks subagents, do the same
passes yourself sequentially). Suggested split — one subagent per area, evidence-only
returns, you synthesize:

1. **Contract & frontend** — scope A + F frontend side.
2. **Backend core** — scope B.
3. **Backend ops & security** — scope C.
4. **Tests & runtime verification** — scope D (the only subagent allowed to run
   servers/tests).
5. **Tauri & packaging** — scope E.
6. **Hygiene & docs** — scope G + F backend side.

Rules for subagents: read-only, every claim with `file:line`, return (a) findings list
and (b) verified-OK list. You merge, deduplicate, severity-rank, and write the single
final report. Do not let subagent output leak unverified into the report.

## 7. Severity scale

- **P0** — blocker: breaks a core user-facing flow (live data, setup streaming, app launch).
- **P1** — major: wrong data, contract mismatch, leak/crash risk, misleading docs that
  will cause bad implementation.
- **P2** — minor: dead code, staleness, poor DX, missing tests for stable code.
- **P3** — polish: naming, comments, ordering.

## 8. Report format (deliverable → `doc/AUDIT_FINDINGS.md`)

Write in English. Structure exactly:

```
1. Executive summary            — repo state in ~10 lines, top 5 risks
2. Verified-OK inventory        — everything checked and fine (prevents rework)
3. Contract cross-check table   — scope F output
4. Findings                     — table: ID | P0-P3 | Area | file:line | Evidence | Fix
5. Dead code / deletion list    — files & symbols safe to remove, with proof of no usage
6. Docs corrections             — AGENTS.md rewrite notes, stale files to archive
7. Implementation plan          — ordered workstreams W1..Wn; each: tasks, acceptance
                                  criteria, rough effort (S/M/L), dependencies;
                                  first workstream must make the app verifiably
                                  end-to-end correct (contract + SSE + tests green)
8. Verification checklist       — how the implementer proves each workstream done
9. Open questions               — decisions only the owner can make
```

Chat output after saving the file: executive summary + the ordered workstream list, nothing more.

## 9. Definition of done

- [ ] Every file in the repo has been opened or consciously classified.
- [ ] Every backend endpoint enumerated and cross-checked against `types.ts`.
- [ ] Frontend and backend tests executed with results recorded.
- [ ] Every finding carries `file:line` evidence; zero speculative claims unmarked.
- [ ] `doc/AUDIT_FINDINGS.md` written in the exact format above.
- [ ] No file outside `doc/AUDIT_FINDINGS.md` was created or modified; no processes left running.
