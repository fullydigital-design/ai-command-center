# PRODUCTION_V1_ORDER.md — Final autonomous pass to production v1

You are an **autonomous implementation model**. Previous phases (audit → fixes) are done
and verified. Your job: drive this repository to **production v1 — everything found gets
fixed, everything gets tested, the app launches from the BAT in the repo root** — then
report. Work in phases, iterate until green, use up to **6 subagents**.

**Read this entire document before touching anything.** It is authoritative; where other
docs conflict, this wins. Prior work orders (`REPO_AUDIT_BRIEF.md`, `FIX_WORK_ORDER.md`)
remain in force where not overridden here.

> **Elapsed time is externally measured.** State the true wall-clock time in the report.
> In every previous report this model inflated elapsed time; do it once more and the
> report is void regardless of content. A long run (1–2 h) is expected and fine —
> `pnpm tauri:build` alone takes 10+ minutes. Do not fake speed, do not fake duration.

---

## 1. Rules of engagement

### 1.1 Evidence regime (non-negotiable, unchanged)
- Every claim carries verbatim evidence: exact command as typed + raw output, or a
  verbatim file quote (≥3 lines) with `file:line`. Number evidence items (E1, E2, …).
- Any contract-mismatch claim between `types.ts` and backend must quote BOTH sides.
- `NOT PERFORMED: <reason>` for anything you cannot do. Invented results void everything.

### 1.2 Scope
- You MAY modify anything needed to reach the Definition of Done (§5): source, tests,
  configs, docs, build scripts, `tauri.conf.json`, BAT files, `requirements.txt`.
- FORBIDDEN, always: changing port numbers (backend 8000, Tauri dev 1420, Vite 5173);
  `src/app/services/mocks/**`; real API keys/secrets anywhere in the repo;
  `LICENSE`, `ATTRIBUTIONS.md`; rewriting git history; pushing to remote;
  deleting or weakening existing tests to make them pass.
- Repo conventions (`AGENTS.md`) apply: match `types.ts` field-for-field, async
  endpoints, import path helpers from `config.py`, no hardcoded `C:\` outside `config.py`.

### 1.3 Test integrity (the letter-vs-spirit rule)
- Every test you write or touch must be **able to fail**. A test that asserts nothing
  (e.g. returns a value pytest ignores) is a defect, not a pass. If you modify a test,
  prove it can fail once (mutation: temporarily break the subject, show red, revert,
  show green) and paste both outputs.
- Never loosen an assertion to make a check green. Fix the subject instead.

### 1.4 Commits (new in this phase — you MAY commit)
- Commit after each milestone where the relevant acceptance checks pass. Conventional
  messages (`fix:`, `feat:`, `docs:`, `chore:`, `build:`), one concern per commit.
- NEVER commit: `.env`, build artifacts (`dist/`, `src-tauri/target/`,
  `src-tauri/binaries/` — all already gitignored), logs, `node_modules`.
- Do NOT push. Do NOT force-anything. Final state: `git status --porcelain` shows only
  intentionally untracked local files (e.g. `.env` must NOT exist — do not create it).

### 1.5 Subagents (≤ 6)
Use them for the Discovery phase (§3). Re-verify every subagent claim yourself with
verbatim evidence before acting on it or writing it into the report.

## 2. Baseline — run first, paste raw into the report

```
$ node --version && pnpm --version && python --version && cargo --version
$ git log --oneline -5 && git status --porcelain
$ pnpm typecheck          # expect: unknown state — NEVER run before; fix what it finds
$ pnpm lint               # expect: unknown state
$ pnpm test               # expect: 14 passed
$ python -m pytest src/app/backend/tests/ -q    # expect: 5 passed, 1 skipped
```

Known environment: Node v24.19.0, pnpm 10.33.0, Python 3.10.11, cargo/rustc 1.94.0.
`pnpm install` has already been run in this workspace.

## 3. Phase A — Discovery (≤ 6 subagents)

Find EVERYTHING still between the repo and production v1. One subagent per area; each
returns a findings list with verbatim evidence:

1. **Frontend build & types** — run `pnpm typecheck`, `pnpm lint`, `pnpm build`; record
   every error/warning; hunt dead components, broken imports, unused deps, hardcoded
   URLs/ports outside `env.ts`.
2. **Backend E2E contract** — start `uvicorn main:app --host 127.0.0.1 --port 8000`,
   run `python src/app/backend/tests/test_endpoints.py -v`; record every failing group;
   cross-check responses vs `types.ts` field-for-field; stop the server after.
3. **Launch & packaging** — read `LAUNCH_AI_COMMAND_CENTER.bat`, `src-tauri/tauri.conf.json`,
   `src-tauri/src/lib.rs`, `build_backend.py`, the PyInstaller spec. Map the exact
   production pipeline: how `app.exe` gets built, how the backend sidecar binary is
   produced and where `tauri.conf.json` expects it (`externalBin`), whether the exe name
   matches what the BAT checks (`imagename eq app.exe`). Do NOT build yet — just the map.
4. **Docs & env consistency** — grep every env var read by backend code
   (`os.environ`, `os.getenv`, `python-dotenv`) and confirm each is documented in
   `.env.example`; README quickstart must work from a fresh clone; find stale docs
   (`src/app/docs/BACKEND_TASKS.md`, `SESSION_LOG.md` still reference deleted
   `bat_runner.py`) and remaining dead references repo-wide.
5. **Security & hygiene** — secrets scan (committed tokens/keys), junk files,
   `.gitignore` vs `git ls-files`, `justfile` tasks actually runnable.
6. **Free slot** — assign to whatever Discovery 1–5 shows is hottest, or to a full
   `git grep` sweep for TODO/FIXME/stub/placeholder markers.

Output of Phase A: a single deduplicated issue list, each item with evidence ref,
severity, and proposed fix. Nothing gets fixed yet.

## 4. Phase B — Fix loop (recursive)

- Fix issues in order: build-breaking → contract → launch/packaging → docs/hygiene.
- Per issue: verify → fix → re-verify, **max 3 iterations**, then BLOCKED with the
  iteration log and root cause. Log every iteration (§8).
- Backend deps: if a fix needs `pytest` declared, or the packaging step needs
  `pyinstaller`, update `requirements.txt` (or add `requirements-dev.txt`) and justify
  in the commit body.
- After each milestone (§5 items 1–6): run that milestone's checks, commit.

## 5. Phase C — Definition of Done battery (all must be green, verbatim outputs)

1. `pnpm install` — clean.
2. `pnpm typecheck` — exit 0.
3. `pnpm lint` — exit 0 (fix violations; do not weaken eslint config to get there).
4. `pnpm test` — green.
5. `pnpm build` — exit 0, `dist/` produced.
6. Backend: `python -m pytest src/app/backend/tests/ -q` green, AND live E2E —
   uvicorn up on 127.0.0.1:8000, `python src/app/backend/tests/test_endpoints.py`
   exit 0 with all groups passing, server stopped, no orphan process on 8000.
7. Desktop pipeline (the BAT gate — the point of this phase):
   a. Build the backend sidecar binary per the PyInstaller spec / `build_backend.py`
      (install `pyinstaller` if missing; justify the dependency).
   b. `pnpm tauri:build` → succeeds; `src-tauri/target/release/app.exe` exists.
   c. Confirm the produced exe name matches what `LAUNCH_AI_COMMAND_CENTER.bat`
      expects; if the Tauri `productName` differs from `app.exe`, align the config.
   d. Run `cmd /c LAUNCH_AI_COMMAND_CENTER.bat` → exit code 0, `app.exe` process
      running (the BAT itself verifies this). Backend sidecar spawned by the app must
      answer `GET http://127.0.0.1:8000/api/health` with `{"status":"ok"}` — paste it.
   e. Close the app; verify no orphan `app.exe`/backend/python process remains
      (`tasklist` pasted). GUI clicking is NOT required — process-level verification
      is the contract.
8. Env & secrets: every backend-read env var documented in `.env.example`; secret scan
   clean; `.env` does not exist and is gitignored.
9. Docs: README quickstart matches the fresh-clone reality (install → build → BAT);
   CHANGELOG gets a v1.0.0 release-notes section listing this phase's changes; stale
   docs moved to `doc/archive/` (not deleted); zero remaining references to
   `bat_runner.py` anywhere (including `src/app/docs/BACKEND_TASKS.md` diagrams).
10. Git: all milestones committed; `git status --porcelain` empty or only intentional
    untracked leftovers (list them); nothing pushed.

If an item is genuinely impossible in this environment (missing tool, no network,
hardware), mark it **BLOCKED-OK** with evidence and root cause — never fake it, never
hack around it by disabling the check.

## 6. Trap recap — do not regress these (all were false findings in earlier audits)

1. `TrainingJob` backend already returns `epoch/totalEpochs/eta/pid/configPath/
   tensorboardLogDir` — do NOT "add missing fields".
2. `GpuStats` uses `vramUsed` in BOTH `types.ts` and backend — no `vramUsedGB` fix needed.
3. `routers/__init__.py` and `utils/__init__.py` stay (17/18 bytes; needed for freezing).
4. `.gitignore` already un-ignores `requirements.txt` via negation line.
5. Do not re-add `utils/bat_runner.py` — it is deleted on purpose; logic lives in
   `routers/setup.py`.

## 7. Report → `doc/V1_REPORT.md`

```
0. Ground Truth block (baseline §2 raw) + TRUE elapsed time
1. Verdict: PRODUCTION-READY / NOT-READY (+ what's missing)
2. DoD battery §5: per item — status, verbatim proof, commit hash
3. Phase A issue list: found → fixed / blocked, with evidence refs
4. Recursive loop log (per §4)
5. Files changed / commits made (hash + message each)
6. Known limitations & BLOCKED-OK items with root causes
7. Evidence Log (numbered, verbatim)
```

Chat output after saving: verdict, DoD scorecard, commit list, true elapsed time — short.

## 8. Definition of done for YOU

- [ ] Every §5 item green with verbatim evidence (or BLOCKED-OK with root cause).
- [ ] Every fix iterated per §4 with the loop log recorded.
- [ ] Every test touched proven able to fail (mutation proof pasted).
- [ ] BAT in repo root launches a working app whose backend answers `/api/health`.
- [ ] Tree committed clean; nothing pushed; no processes left running.
- [ ] `doc/V1_REPORT.md` written in §7 format; true elapsed time stated.
