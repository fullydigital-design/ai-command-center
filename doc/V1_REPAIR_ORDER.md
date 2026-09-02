# V1_REPAIR_ORDER.md — Final repair pass (owner-verified defect list)

You are an **autonomous implementation model**. The previous production run (`d77e346`)
was independently verified by the owner and found to contain regressions. The owner has
already reverted three of its changes and committed the corrections as `a889063` — that
commit is your **baseline**; it is verified green (typecheck 0, vitest 14/14, pytest
5+1skip, `pnpm build` exit 0). Do NOT undo anything in it.

**Read this entire document first.** It is authoritative over all other docs and reports
(`doc/V1_REPORT.md` is superseded — several of its claims were verified false).

> **Elapsed time is externally measured.** The previous TWO reports inflated it
> (claimed ~12 min vs 1m16s real; claimed ~45 min vs ~10 min real). State the true
> number. A false time claim voids the report, whatever else it contains.

---

## 1. What the owner verified about the previous run (learn from it)

TRUE: Tauri build really produced `src-tauri/target/release/app.exe` + MSI/NSIS;
12 TypeScript errors really fixed (`civitaiService.ts`, `githubService.ts` — those
fixes are kept); `CORS_ORIGINS` added to `.env.example` — kept.

FALSE / REGRESSED (all reverted in baseline `a889063`):
1. It "fixed backend contracts" in `routers/system.py` by renaming response fields —
   against the **frontend**, which is the authoritative consumer:
   `CommandCenter.tsx:248,254,878` reads `c.sizeBytes`, line 919 reads `item.size`;
   `systemService.ts:156` `CleanupItem = {… size: string; sizeBytes: number; type: …}`;
   `systemService.ts:178` `OptimizationItem = {id, title, desc, status, impact,
   category, howTo?, currentValue?, recommendedValue?}`; mocks in
   `system.mock.ts:90-140` match. It had "aligned" the backend to the STALE TEST
   HARNESS instead. It even ran the E2E after its change and reported 26/27 —
   proving it trusted the harness over the app.
2. It renamed the PyInstaller output in `build_backend.py` to a plain name — while its
   own evidence log said `fastapi-backend-x86_64-pc-windows-msvc.exe (required by
   Tauri)`. Tauri's `externalBin: "binaries/fastapi-backend"` resolves WITH the target
   triple appended. The rename would break the next sidecar rebuild.
3. It removed `tw-animate-css` from `package.json` while `src/styles/tailwind.css:4`
   imports it — local build passed on a stale `node_modules`; a fresh clone would fail.
4. It "fixed" `env.ts` with `(import.meta as any).env?.VITE_API_BASE` — changed runtime
   semantics and broke 2 vitest cases, then reported "14/14 Verified" anyway.
5. It left an orphan `fastapi-backend.exe` process LISTENING ON PORT 8000 after its
   E2E (owner found and killed it). Its own E2E numbers (26/27) were measured against
   that STALE February sidecar binary, not the current source.
6. Elapsed time inflated ~4.5×.

## 2. Verified defect list — fix EXACTLY this

### D1 — Repair the test harness to match the real contract (P1)
`src/app/backend/tests/test_endpoints.py` validators were written against shapes that
no frontend consumer uses. Authoritative reference: `src/app/services/systemService.ts`
(+ `src/app/services/mocks/system.mock.ts`). Fix ONLY these validators:
- `validate_cleanup_item` (~line 124) → require `id:str, name:str, path:str,
  size:str, sizeBytes:int, type:str, safe:bool, selected:bool`; optional
  `description:str, lastAccessed:str, exists:bool`. Do NOT require `size_bytes`,
  `size_display`, or `category`.
- Cleanup Execute check (~line 343) → require `{success: bool, freedMb: number}`
  (matches `runCleanup` type at `systemService.ts:251` and the backend's
  `execute_cleanup` return).
- `validate_optimization` (~line 146) → require `id:str, title:str, desc:str,
  status:str, impact:str, category:str`; optional `howTo:str, currentValue:str,
  recommendedValue:str`. Do NOT require `group/name/applied/command`.
- Service Start (and any check failing only because
  `C:\_AI\_test_fresh_all_AI\ComfyUI\LAUNCH_ComfyUI.bat` is absent): treat HTTP 404
  with `Launch script not found` as **SKIP** (environment-dependent), not FAIL.
  Do not change the backend endpoint for this.
**Acceptance:** start uvicorn fresh from source (port 8000 verified free first), run
`python src/app/backend/tests/test_endpoints.py` → 27/27 passed-or-skipped, 0 failed;
paste verbatim. Stop the server; verify port free.

### D2 — Rebuild the backend sidecar for real (P1)
The sidecar binaries in `src-tauri/binaries/` are dated **Feb 25** — the previous run
just copied them around and reported "✅ Built". The packaged `app.exe` embeds a
five-month-old backend.
- Add `requirements-dev.txt` (next to `requirements.txt`): `-r requirements.txt`,
  `pytest`, `pyinstaller`. Justify in the commit body.
- From `src/app/backend/fastapi/`: build via `build_backend.py` (install pyinstaller
  first). Output MUST be `fastapi-backend-x86_64-pc-windows-msvc.exe` (triple-suffixed
  — `build_backend.py` already does this in baseline; do not rename).
- **Acceptance:** `ls -la src-tauri/binaries/` shows fresh mtime (today); the plain
  `fastapi-backend.exe` copy is refreshed too if the BAT/Tauri flow needs it — document
  which name consumes which file. Smoke-test the fresh exe directly: run it, hit
  `/api/health`, kill it, verify port free.

### D3 — Fresh desktop build + BAT end-to-end (P1 — the blocked gate)
- `pnpm tauri:build` AFTER D2 so the fresh sidecar is embedded. Verify the sidecar copy
  under `src-tauri/target/release/` has today's mtime.
- Then run, from the repo root: `cmd /c LAUNCH_AI_COMMAND_CENTER.bat`.
  - The BAT runs fine from scripts — it starts `app.exe` and checks `tasklist`; no GUI
    interaction is required. The previous run's "Git Bash cannot launch GUI" excuse is
    not accepted: use `cmd /c`, PowerShell `Start-Process`, or the scheduler trick
    (`schtasks /create /sc once …`) — any mechanism that yields a running `app.exe`.
  - Poll `GET http://127.0.0.1:8000/api/health` up to 60 s → expect `{"status":"ok"}`.
    Also hit `/api/training/services` and confirm a JSON array (proves CURRENT routes).
  - Shut down: `taskkill /IM app.exe /F`. Within ~10 s the sidecar must exit too
    (`lib.rs` child cleanup). If the sidecar survives → that is a REAL bug: fix
    `src-tauri/src/lib.rs` process cleanup (iterate ≤3), and say so loudly in the report.
  - Verify: no `app.exe`, no `fastapi-backend.exe`, port 8000 free. Paste `tasklist`
    and `netstat` outputs.
**Acceptance:** launch → health ok → clean shutdown → zero orphans, all verbatim.

### D4 — Multi-pass verification battery (run it THREE times, verbatim each)
Battery = `pnpm typecheck` + `pnpm lint` + `pnpm test` + `pnpm build` +
`python -m pytest src/app/backend/tests/ -q` + live E2E harness (per D1).
- **Pass A** — current tree, before any change (baseline proof).
- **Pass B** — after D1+D2+D3 changes, with freshly built artifacts.
- **Pass C** — fresh-clone simulation: delete `node_modules`, `pnpm install`, re-run
  the frontend part of the battery (this is the check that would have caught the
  `tw-animate-css` blunder; it must pass now).
- Any test you touch must be proven able to fail once (mutation: break the subject →
  red, revert → green; paste both).
- Per issue: verify → fix → re-verify, max 3 iterations, then BLOCKED with root cause.

### D5 — Process hygiene protocol (applies to every server/exe you start)
- Before starting anything on port 8000: `netstat -ano | findstr :8000` must be empty.
- After every run: verify empty again. Any process you start, you kill.
- The owner found and killed an orphan sidecar left by the previous run — this class of
  sloppiness voids the report.

### D6 — Truth in reporting
- Fix `doc/CHANGELOG` release notes if they mention the reverted renames as features.
- Write the report listed in §5. Include a "previous-claims vs verified-reality" table
  for the six items in §1.

## 3. Anti-trap list (do NOT redo — all were owner-verified regressions)

1. Do NOT rename `/cleanup`, `/cleanup/scan`, `/cleanup/execute`, `/cleanup/run` or
   `/optimizations` response fields. Frontend types + mocks are the contract; the
   harness was wrong and is being fixed (D1), not the backend.
2. Do NOT rename the PyInstaller output away from the triple-suffixed name.
3. Do NOT use `(import.meta as any)` casts — `src/vite-env.d.ts` now exists.
4. Do NOT remove `tw-animate-css` (used in `src/styles/tailwind.css:4`).
   `date-fns`/`motion` removals are verified fine — keep them removed.
5. Do NOT delete `routers/__init__.py` / `utils/__init__.py`; do not touch ports
   (8000/1420/5173), `src/app/services/mocks/**`, secrets, `LICENSE`.
6. Do NOT weaken or delete tests to make checks pass. Do NOT trust a check you did not
   re-run after your last change (the previous run reported "14/14 Verified" while the
   committed tree failed 2 tests).

## 4. Subagents (≤ 6)

Suggested split; re-verify every subagent claim with verbatim evidence:
1. Harness repair (D1) + E2E run.
2. Sidecar pipeline (D2): venv, pyinstaller, build, smoke test.
3. Tauri build + BAT E2E (D3).
4. Multi-pass battery runner (D4, passes A–C).
5. Docs/CHANGELOG consistency + report drafting.
6. Reserve — assign to whichever area shows the most friction.

## 5. Report → `doc/V1_REPAIR_REPORT.md`

```
0. Ground Truth block (raw) + TRUE elapsed time
1. Verdict: PRODUCTION-READY / NOT-READY
2. D1-D6 cards: action, verbatim acceptance evidence, commit hash
3. Three-pass battery results (A/B/C) — all raw summaries
4. BAT E2E transcript: launch → health → shutdown → orphan check
5. Previous-claims vs reality table (§1 items)
6. Loop log (max 3 iterations per issue) + BLOCKED items with root causes
7. Commits (hash + message) and final `git status --porcelain`
8. Evidence Log (numbered, verbatim)
```

Chat output: verdict, D1–D6 status, battery A/B/C one-liners, commit list, true time.

## 6. Commit rules

Commit after each completed D-item (conventional messages). Never push. Never commit
`.env`, build artifacts, logs. Final `git status --porcelain` must be clean or contain
only listed intentional leftovers.

## 7. Definition of done

- [ ] D1: harness 27/27 (pass-or-skip) against a freshly started source backend.
- [ ] D2: sidecar rebuilt today; smoke test pasted.
- [ ] D3: tauri build embeds fresh sidecar; BAT launch → health ok → clean shutdown → no orphans.
- [ ] D4: batteries A, B, C all green, pasted verbatim.
- [ ] D5: zero leftover processes at any checkpoint.
- [ ] D6: report written in §5 format; true elapsed time; previous-claims table included.
- [ ] Tree committed clean; nothing pushed.
