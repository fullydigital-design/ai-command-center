# V1_FINAL_ORDER.md — Closing pass to production v1

You are an **autonomous implementation model**. Two previous runs are done; the owner
audited both and fixed several things himself. Your baseline is commit **`c33fed6`** —
it is owner-verified: typecheck 0, vitest 14/14, pytest 5 passed + 1 skipped, `pnpm build`
exit 0, live `/system/cleanup/scan` returns the correct contract. Do not undo anything in it.

**Read this entire document first.** It is authoritative over all reports and docs.

> **Elapsed time is externally measured.** Previous reports inflated it
> (12 claimed vs 1m16s real; 45 vs ~10; 8 vs ~6). State the TRUE number. A false time
> claim voids the report regardless of content.

---

## 1. State of the world (verified by the owner — do not re-litigate, but re-verify before acting)

- `112becd` added a **sidecar watchdog**: the Tauri app passes its PID to the backend via
  `--app-pid` (`src-tauri/src/lib.rs`), and `main.py::_start_parent_watchdog()` exits the
  sidecar within ~2–4 s after the app dies — even on force-kill or crash. This fixes the
  "sidecar survives app.exe kill" bug found in the previous run. **Do not remove or
  weaken it.**
- `c33fed6` completed a contract revert that a previous owner commit (`a889063`) had
  applied only PARTIALLY (its message overstated the revert — the code, not commit
  messages, is the source of truth). `/system/cleanup/scan` now returns
  `size / sizeBytes / type` per `systemService.ts:156`, and the live E2E "Cleanup Scan"
  check passes.
- The sidecar and `app.exe` binaries on disk were built BEFORE `c33fed6`, so they
  contain the stale scan shape. **They must be rebuilt (T1).**
- The previous run bypassed the launcher: it started `app.exe` directly instead of
  running `LAUNCH_AI_COMMAND_CENTER.bat` — not accepted (T3).
- The previous run's harness SKIP for `Service Start` returns `passed=False` with a
  note, so the tally counts it as FAILED and prints "unknown" — to fix (T2).

## 2. Rules (unchanged, non-negotiable)

- Evidence: verbatim command + raw output, or file quote ≥3 lines with `file:line`.
  Number evidence items. `NOT PERFORMED: <reason>` instead of guessing.
- FORBIDDEN: changing ports (8000/1420/5173); `src/app/services/mocks/**`; secrets;
  `LICENSE`/`ATTRIBUTIONS.md`; pushing; weakening tests; `(import.meta as any)` casts;
  removing `tw-animate-css` (used in `src/styles/tailwind.css:4`); renaming backend
  response fields away from the frontend contract (`systemService.ts` + mocks are
  authoritative); deleting `__init__.py`; touching the watchdog without cause.
- Commits allowed per completed task (conventional messages). Never push.
- ≤ 6 subagents; re-verify every subagent claim with verbatim evidence yourself.
- Per issue: verify → fix → re-verify, max 3 iterations, then BLOCKED with root cause.
- Process hygiene: port 8000 must be free (netstat) before and after EVERY server/exe
  run; every process you start, you kill.

## 3. Task list — exact and complete

### T1 — Rebuild both binaries from the fixed source (P1)
1. From `src/app/backend/fastapi/`: `python build_backend.py` (pyinstaller 6.22.2 is
   installed). Output: `dist/fastapi-backend-x86_64-pc-windows-msvc.exe`.
2. Copy it to `src-tauri/binaries/fastapi-backend-x86_64-pc-windows-msvc.exe` AND to
   `src-tauri/binaries/fastapi-backend.exe` (both consumers expect their own name).
3. `pnpm tauri:build`. Verify `src-tauri/target/release/app.exe` and the sidecar copy
   under `src-tauri/target/release/` have fresh mtimes (paste `ls -la`).
**Acceptance:** today's mtimes on: both `src-tauri/binaries/*.exe`,
`src-tauri/target/release/app.exe`, `src-tauri/target/release/fastapi-backend*.exe`.

### T2 — Harness SKIP must not count as failure (P2)
In `src/app/backend/tests/test_endpoints.py`, the Service Start skip (added in
`26391b2`) returns `passed=False`, so the tally prints it as a failure and the failure
printer shows "unknown". Make SKIP a first-class outcome:
- Track skipped tests separately (e.g. a `skipped` flag on `TestResult` and a third
  counter in the summary: `26 passed, 1 skipped, 0 failed`).
- The results printer must show the skip reason (`SKIP: Launch script not found …`),
  never a bare "unknown".
- Keep the skip condition exactly as-is (HTTP 404 + "Launch script not found").
**Acceptance:** run the harness against a freshly started source backend → paste the
verbatim tally and the Service Start line. `0 failed` required.

### T3 — BAT end-to-end with watchdog proof (P1 — the core gate)
All steps verbatim into the report:
1. `netstat -ano | findstr :8000` → empty.
2. From the repo root: `cmd /c LAUNCH_AI_COMMAND_CENTER.bat` → exit code 0 →
   `tasklist | findstr app.exe` shows the process. **You must run the BAT itself**, not
   `start app.exe` — the BAT's own pre-checks are part of the contract.
3. Poll `GET http://127.0.0.1:8000/api/health` (≤60 s) → `{"status":"ok"}`; also
   `GET /api/training/services` → JSON array (proves current routes).
4. `taskkill /IM app.exe /F` (simulate the harshest user exit).
5. Within ~8 s: `fastapi-backend.exe` must be GONE from `tasklist` and port 8000 free
   (netstat) — this proves the `112becd` watchdog works under force-kill.
6. If the sidecar survives: capture its PID, check whether it is the onefile
   bootloader or the child, investigate (watchdog armed? `--app-pid` received?), fix,
   iterate ≤3.
**Acceptance:** launch → health ok → force-kill → zero `app.exe`/`fastapi-backend.exe`
processes and port 8000 free, all pasted verbatim.

### T4 — Fresh-clone simulation (P1)
Delete `node_modules` entirely, `pnpm install`, then `pnpm typecheck`, `pnpm test`,
`pnpm build` — all green, verbatim. (This is the check that catches "works on my
machine" dependency breakages; it has never been run. Do not skip it.)

### T5 — Full battery, three passes (P1)
Battery = `pnpm typecheck` + `pnpm lint` + `pnpm test` + `pnpm build` +
`python -m pytest src/app/backend/tests/ -q` + live E2E harness (fresh uvicorn from
source, per §2 hygiene).
- **Pass A** — right now, on baseline `c33fed6` (before your changes).
- **Pass B** — after T1/T2, with freshly built binaries.
- **Pass C** — after T4's fresh install.
All three pasted verbatim; all green. If lint reports pre-existing warnings, list them
once and mark them pre-existing — do not chase them at the cost of the other items.

### T6 — Final report (P2)
Write `doc/V1_FINAL_REPORT.md` (format below). Mark `doc/V1_REPAIR_REPORT.md` as
superseded by adding one line at its top: `> SUPERSEDED by doc/V1_FINAL_REPORT.md`.
**Acceptance:** report in the exact format, committed.

## 4. Report format → `doc/V1_FINAL_REPORT.md`

```
0. Ground Truth block (raw) + TRUE elapsed time
1. Verdict: PRODUCTION-READY / NOT-READY
2. T1–T6 cards: action, verbatim acceptance evidence, commit hash
3. Battery Pass A/B/C — raw summaries
4. BAT E2E transcript incl. watchdog proof (force-kill → sidecar gone → port free)
5. Known limitations / BLOCKED items with root causes
6. Evidence Log (numbered, verbatim)
```

Chat output after saving: verdict, T1–T6 status, battery one-liners, commits, true time.

## 5. Definition of done

- [ ] T1: all four binary artifacts with today's mtime.
- [ ] T2: harness tally `… passed, 1 skipped, 0 failed` with readable skip reason.
- [ ] T3: BAT → health → force-kill → sidecar gone ≤8 s → port free, verbatim.
- [ ] T4: fresh-clone battery green.
- [ ] T5: Passes A/B/C all green, pasted.
- [ ] T6: final report committed; older report marked superseded.
- [ ] Tree committed clean; nothing pushed; no leftover processes.
