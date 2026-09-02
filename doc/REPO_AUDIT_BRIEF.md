# REPO_AUDIT_BRIEF.md — Deep Read-Only Audit Brief (v2, hardened)

You are an independent **audit model**. Your job: exhaustively verify the state of this
repository and produce one complete, evidence-backed report plus an implementation plan
to bring the repo to clean v1. **You do not implement anything** — you audit and report.

This document is self-contained. You need no prior knowledge of the repo. Everything
below (including "Known starting points") is a **hypothesis to verify**, not a fact to
trust — including `AGENTS.md`, `README.md` and any docs you find.

**Read the ENTIRE brief before starting. Do not skip sections.**

> **Expectation setting:** a real pass, including mandatory test runs, takes on the
> order of tens of minutes. Speed is not a virtue here; verifiable completeness is.
> If your total elapsed time is under ~10 minutes, you have skipped mandatory steps —
> go back and do them. An audit that finishes suspiciously fast with "everything OK"
> will be treated as failed.

---

## 1. Mission

1. Perform a full read-only audit of the entire repository: frontend, backend, Tauri
   wrapper, tests, docs, repo hygiene, security.
2. Verify every claim you make with **verbatim evidence** (see §3 — non-negotiable).
3. Deliverables:
   - **Full report saved to `doc/AUDIT_FINDINGS.md`** (create only this one file;
     overwrite any pre-existing version — do not read or trust it).
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

## 3. Evidence rules (anti-fabrication) — the most important section

A previous audit attempt of this repo was rejected for fabricated evidence: claims about
git tracking, file existence, and API endpoints that were never verified. Your report is
checked against the same standard. The most common hallucination surfaces here are
exactly: (a) what is/isn't tracked in git, (b) whether a file or directory exists,
(c) which endpoints exist.

### 3.1 The Ground Truth block (mandatory, top of the report)

Run each command in your session and paste the **raw output verbatim** — no paraphrasing,
no summarizing, no reconstructing from memory. If you cannot run a command, write
`NOT PERFORMED: <reason>`.

```
$ git ls-files | wc -l
$ git ls-files src/app | grep -cE "\.(ts|tsx)$"
$ git ls-files src/app/backend/tests
$ ls src/app/docs
$ git status --porcelain            # run again at the very end
$ pnpm vitest run                   # paste the final summary lines
$ python -m pytest src/app/backend/tests/test_toml_parsing.py -q   # paste final lines
```

Any claim in your report that contradicts your own pasted Ground Truth output
invalidates the report.

### 3.2 Evidence for findings

- Every finding must reference a numbered evidence item from an **Evidence Log appendix**
  at the end of the report. An evidence item is either:
  - the **exact command you ran** (as typed) plus its **verbatim relevant output**, or
  - a **verbatim file quote of at least 3 lines** with `file:line`.
- **P0 and P1 findings without a verbatim evidence item are forbidden.** If you believe
  something is broken but cannot produce verbatim evidence, put it in a separate
  "Unverified hypotheses" section — never in the main findings table.
- Never reference a file, symbol, endpoint, or directory you have not opened in this
  session. Endpoints must be quoted from actual `@router` decorator lines.

### 3.3 Honesty policy

- Write `NOT PERFORMED: <reason>` for any mandatory step you did not complete.
  An honest incomplete audit is acceptable; a fabricated complete one is rejected
  outright and the entire report is void.
- The report header must state: total elapsed wall time, and the list of commands
  actually executed.
- Do not read any pre-existing `doc/AUDIT_FINDINGS*.md` — overwrite, don't inherit.

## 4. Context snapshot (what this project is)

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

## 5. Known starting points (verify, don't trust)

Observations from a prior partial review. Confirm or refute each; they are seeded so you
spend time on depth, not rediscovery. **These are hypotheses, not findings — do not
repeat them in your report without your own verbatim evidence.**

1. **`AGENTS.md` "What is stubbed" table may be outdated.**
   - `routers/training.py` is believed fully implemented: TOML parsing
     (`tomllib`/`tomli`), TensorBoard loss reading via `tbparse`, endpoints `/jobs`,
     `/jobs/{id}/loss`, `/services`, `/gpu`, `/poll`. Path-traversal guard
     `_is_safe_config_path` exists.
   - SSE streaming for BAT scripts is believed **fully implemented in
     `routers/setup.py`** (POST `/api/setup/run` → `stream_id`; GET `/api/setup/stream`
     → `EventSourceResponse`; lock-protected process registry; zombie reaping). The
     frontend is believed to call both (`src/app/services/setupService.ts`).
2. **`utils/bat_runner.py` appears to be dead code** — believed imported nowhere,
   duplicating launch logic in `setup.py`, with `classify_line()` duplicating frontend
   `classifyLine()`. Confirm with a repo-wide grep and recommend delete-or-wire.
3. **Tests**: `src/app/backend/tests/` is believed to contain `test_endpoints.py`
   (integration suite requiring a live backend), `test_toml_parsing.py`, and
   `sample_configs/`. Frontend uses Vitest, but the existence of actual frontend
   `*.test.*` files is unconfirmed — check.
4. **Missing repo artifacts**: `CHANGELOG.md`, `CONTRIBUTING.md` believed absent.
   `.env.example` and a PyInstaller spec
   (`fastapi-backend-x86_64-pc-windows-msvc.spec` + `build_backend.py`) believed present.
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

## 6. Audit scope — cover ALL of it

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
  where possible), NVIDIA-free fallback behavior.
- `requirements.txt` vs actual imports: missing or unused deps.
- Subprocess output decoding: BAT/console output on Windows is often cp866/cp1251 —
  how are decode errors handled in `setup.py` and elsewhere?

### C. Backend ops & security
- `setup.py` subprocess lifecycle: leaks, race conditions, `stream_id` predictability.
- `setx` endpoint abuse potential on localhost; CORS config; binding address.
- Path traversal guards: `training.py` has one — do `tensorboard.py`, `services.py`,
  `setup.py` need the same for user-supplied paths?
- Secrets scan: `.env*`, committed keys/tokens, `ATTRIBUTIONS.md` accuracy.

### D. Tests (run them, record verbatim output — see §3.1)
- `pnpm vitest run` — paste summary (passed/failed counts).
- Backend: start `uvicorn main:app --host 127.0.0.1 --port 8000`, run
  `pytest src/app/backend/tests/` and/or `python test_endpoints.py`; record results;
  shut the server down. If the environment cannot run them, `NOT PERFORMED` is
  acceptable — inventing results is not.
- List what is NOT covered but should be (per endpoint / per service tier).

### E. Tauri & packaging (static only)
- `src-tauri/src/lib.rs`, `main.rs`, `tauri.conf.json`, capabilities: sidecar spawn
  logic, backend health detection, window config, updater/signing placeholders.
- `package.json` scripts, `justfile`, `LAUNCH_AI_COMMAND_CENTER.bat`: do they do what
  their names claim?
- PyInstaller spec + `build_backend.py`: internal consistency (entry point, hidden
  imports for `tbparse`/`pynvml`, data files, whether package `__init__.py` files are
  required by the freeze). Do not build.

### F. Contract cross-check (highest-value item)
Build one table: every `types.ts` type → producing backend endpoint(s) → verdict
(match / mismatch with field list / no backend / mock-only). Every endpoint column must
quote the real `@router` line. This table goes into the report as-is. "Every type"
means all of them, not a sample.

### G. Repo hygiene & docs
- `.gitignore` vs tracked files (logs, caches, `tmp/`, `desktop.ini`).
- `README.md` accuracy (install steps, ports, scripts). `AGENTS.md` corrections list —
  what must change so the next AI agent is not misled.
- `src/app/docs/` staleness: which files contradict the code, which are session logs
  that should be archived or deleted.
- Missing artifacts worth adding for v1: `CHANGELOG.md`, `CONTRIBUTING.md` — recommend
  content outlines, do not create them.

## 7. Method — how to organize the work (≤ 6 subagents)

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

Rules for subagents: read-only, every claim with verbatim evidence (`file:line` or raw
command output), return (a) findings list and (b) verified-OK list. You merge,
deduplicate, severity-rank, and write the single final report. Subagent claims without
evidence must be re-verified by you or dropped.

## 8. Severity scale

- **P0** — blocker: breaks a core user-facing flow (live data, setup streaming, app launch).
- **P1** — major: wrong data, contract mismatch, leak/crash risk, misleading docs that
  will cause bad implementation.
- **P2** — minor: dead code, staleness, poor DX, missing tests for stable code.
- **P3** — polish: naming, comments, ordering.

## 9. Report format (deliverable → `doc/AUDIT_FINDINGS.md`)

Write in English. Structure exactly:

```
0. Ground Truth block           — raw outputs per §3.1 + elapsed time + command log
1. Executive summary            — repo state in ~10 lines, top 5 risks
2. Verified-OK inventory        — everything checked and fine (prevents rework)
3. Contract cross-check table   — scope F output
4. Findings                     — table: ID | P0-P3 | Area | file:line | Evidence ref
                                  (E-id) | Fix — every P0/P1 must have an E-id
5. Dead code / deletion list    — files & symbols safe to remove, with proof of no usage
6. Docs corrections             — AGENTS.md rewrite notes, stale files to archive
7. Implementation plan          — ordered workstreams W1..Wn; each: tasks, acceptance
                                  criteria, rough effort (S/M/L), dependencies;
                                  first workstream must make the app verifiably
                                  end-to-end correct (contract + SSE + tests green)
8. Verification checklist       — how the implementer proves each workstream done
9. Open questions               — decisions only the owner can make
A. Evidence log                 — numbered verbatim command outputs / file quotes
B. Unverified hypotheses        — things you believe but could not prove (may be empty)
```

Chat output after saving the file: executive summary + the ordered workstream list, nothing more.

## 10. Definition of done

- [ ] Every file in the repo has been opened or consciously classified.
- [ ] Every backend endpoint enumerated and cross-checked against `types.ts`.
- [ ] Frontend and backend tests executed, raw outputs pasted (or explicit NOT PERFORMED).
- [ ] Ground Truth block present with verbatim outputs; nothing in the report contradicts it.
- [ ] Every P0/P1 finding references a numbered verbatim evidence item.
- [ ] Every finding carries `file:line` evidence; zero speculative claims outside
      section B (Unverified hypotheses).
- [ ] `doc/AUDIT_FINDINGS.md` written in the exact format above.
- [ ] Final `git status --porcelain` pasted; no file outside `doc/AUDIT_FINDINGS.md`
      created or modified; no processes left running.
