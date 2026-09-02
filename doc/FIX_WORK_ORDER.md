# FIX_WORK_ORDER.md — Recursive Check & Fix Work Order (v1)

You are an **implementation model**. This is NOT a read-only audit. Your job: recursively
verify, fix, and re-verify every item in this work order, then produce a report.
The work order was derived from two prior audits whose results were independently
verified by the owner. It is **authoritative**: where it conflicts with
`doc/AUDIT_FINDINGS.md` or any other document, this document wins.

**Read this entire document before touching anything.**

> **Elapsed time is externally measured.** State the true wall-clock time in your
> report. Inflated or rounded-up time claims void the entire report.

---

## 1. Mission

1. Re-verify every item in §4 (fix list) and §5 (trap list) with verbatim evidence.
2. Fix the verified items per their acceptance criteria.
3. Actively **REJECT the trap items** in §5 with proof — they are known-false findings
   from a previous audit. "Fixing" a trap breaks working code and fails the task.
4. Loop: verify → fix → re-verify, until stable or blocked (§6).
5. Write the final report to **`doc/FIX_REPORT.md`** (§7) and give a short chat summary.

## 2. Rules of engagement

### 2.1 Evidence regime (same as the audit briefs — non-negotiable)
- Every verification, fix, and rejection must carry verbatim evidence: the exact command
  as typed + its raw output, or a verbatim file quote (≥3 lines) with `file:line`.
- Any claim of a contract mismatch between `types.ts` and the backend must quote BOTH
  the TS interface field AND the backend return value in the same evidence item.
  One-sided quotes are invalid evidence.
- Write `NOT PERFORMED: <reason>` for anything you cannot do. Honest gaps are fine;
  invented results void the report.
- Number your evidence items (E1, E2, …) in an Evidence Log appendix.

### 2.2 Whitelist — what you MAY change
- `src/app/backend/**` (Python): bug fixes, the test repair in W1, deletion in W3.
- NEW files: `src/app/services/createService.test.ts`, `src/app/services/env.test.ts`
  (or `*.test.tsx` equivalents), `CHANGELOG.md`, `CONTRIBUTING.md`, `doc/FIX_REPORT.md`.
- `AGENTS.md`, `README.md`: only the specific corrections in W4.
- Nothing else. Specifically FORBIDDEN: port numbers, `src/app/services/mocks/**`
  (never modify), `src-tauri/**` (report findings only), `requirements.txt` (only if a
  fix genuinely requires a new dependency — then justify it in the report),
  `.gitignore` (leave as is).
- Repo convention (`AGENTS.md`): never modify existing `.ts`/`.tsx` under `src/app/`
  unless fixing a verified bug. Writing NEW test files is allowed and expected (W2).
  If your tests reveal a real bug in source code: report it, do not fix it silently.
- Do **not** run `pnpm tauri:build`. Do **not** commit or push — the owner reviews.
- You MUST run `pnpm install` (restores existing lockfile; this is not adding
  dependencies) — without it nothing frontend works.

### 2.3 Subagents
You may use up to 6 subagents. Every subagent result must be re-verified by you with
verbatim evidence before it enters the report.

## 3. Baseline — Ground Truth block (run first, paste raw into the report)

```
$ git ls-files | wc -l
$ git ls-files src/app | grep -cE "\.(ts|tsx)$"
$ git status --porcelain
$ python -m pytest src/app/backend/tests/test_toml_parsing.py -q
$ pnpm install          # then: $ pnpm test
$ python src/app/backend/tests/test_toml_parsing.py
```

Known baseline (verify, don't trust): 149 tracked files; 66 tracked frontend TS/TSX;
`pytest` currently ERRORS on `test_toml_parsing.py:111` (`fixture 'filepath' not found` —
the test is written as a standalone script, so pytest treats its parameter as a missing
fixture); the script itself, run directly, prints "Results: 5/5 configs valid, 0 issues";
`pnpm test` fails until `pnpm install` is run (vitest 3.2.3 is in devDependencies).

## 4. Fix list — verified findings (re-verify each, then fix)

### W0 — Environment bootstrap
`pnpm install`. Record versions (node, pnpm, python). If the environment has no network,
mark W0/W2 `NOT PERFORMED` and continue with everything else.

### W1 — Repair backend pytest compatibility (P1)
`src/app/backend/tests/test_toml_parsing.py` errors under pytest
(`fixture 'filepath' not found`, line 111) but works when run directly.
- Make it a proper pytest suite: parametrize over
  `src/app/backend/tests/sample_configs/*.toml` (5 files), asserting the existing
  validation logic's outcome. Preserve the standalone-script mode (it must still print
  its 5/5 summary when run directly).
- Also check `test_endpoints.py` under pytest collection: if pytest errors or collects
  it wrongly, add a graceful skip (e.g. `pytest.importorskip` / explicit skip marker
  with a comment "requires live backend on 127.0.0.1:8000") so the whole suite is green.
  Do not rewrite its logic — it is a working integration harness.
- **Acceptance:** `python -m pytest src/app/backend/tests/ -q` → exit 0, ≥5 tests passed,
  verbatim output pasted. Direct script run still prints 5/5.

### W2 — Frontend test bootstrap (P2)
No `*.test.*` files exist anywhere under `src/` (verify with `find`/`git ls-files`).
- Read `src/app/services/createService.ts` and `src/app/services/env.ts` FIRST. Write
  unit tests against their ACTUAL behavior: 3-tier fallback (backend → browser → mock),
  `isTauriEnv()`, `getApiBase()` in browser vs Tauri. Do not modify the sources unless
  you find a verified bug (then report it, see §2.2).
- **Acceptance:** `pnpm test` (i.e. `vitest run`) → exit 0, verbatim summary pasted,
  and `git status` shows the new test files as the only frontend additions.

### W3 — Dead code removal (P2)
`src/app/backend/fastapi/utils/bat_runner.py` is imported nowhere (repo-wide grep
returns only self-references); `routers/setup.py` implements the same launch logic.
- Re-verify zero imports (grep verbatim). Also grep the PyInstaller spec
  (`fastapi-backend-x86_64-pc-windows-msvc.spec`) and `build_backend.py` for any
  reference to `bat_runner` before deleting.
- Delete the file. **Do NOT delete `routers/__init__.py` or `utils/__init__.py`** —
  they are 17/18 bytes, NOT empty, and package markers matter for the freeze (§5.3).
- **Acceptance:** `grep -r "bat_runner" src/ --include="*.py"` → 0 hits; backend still
  imports cleanly (`python -c "import main"` from `src/app/backend/fastapi/` after
  installing deps, or `python -m compileall` as fallback), verbatim output pasted.

### W4 — Documentation alignment (P2)
- `AGENTS.md`: replace the "What is stubbed" table (lines ~48-53) with an
  "Implementation Status" table reflecting reality: `routers/training.py` complete
  (TOML + tbparse + path guard), `routers/setup.py` complete (BAT subprocess + SSE
  streaming + process registry), `utils/bat_runner.py` deleted as dead code. Update the
  Testing section: frontend tests now exist (after W2), backend suite runs under pytest
  (after W1). Keep the rest of AGENTS.md intact.
- `README.md` line 63: replace "Backend | ~75% — … partially stubbed" with an accurate
  one-line status (core routers complete; note anything genuinely missing, e.g. live
  backend E2E coverage).
- Create `CHANGELOG.md` (Keep a Changelog format; derive real entries from `git log`
  — read-only git is allowed — grouped under an "Unreleased / v1.0.0" heading).
- Create `CONTRIBUTING.md`: setup steps (`pnpm install`, backend venv +
  `pip install -r src/app/backend/fastapi/requirements.txt`), dev commands, ports
  (backend 8000, frontend dev 1420), test commands, pointer to AGENTS.md conventions.
- **Acceptance:** a fresh reader (or AI agent) gets no contradiction between docs and
  code; paste the new AGENTS.md status table verbatim.

### W5 — Recursive final verification & report
After W1–W4: re-run the full battery (pytest suite, `pnpm test`, bat_runner grep,
`git status --porcelain`, `git diff --stat` vs the §2.2 whitelist), write
`doc/FIX_REPORT.md` (§7). Anything you could not do → `NOT PERFORMED` + reason.

## 5. Trap list — known-FALSE findings. REJECT these with evidence. Do NOT "fix" them.

These come from a previous audit and were disproven by the owner. For each: re-verify
yourself, then record a rejection with verbatim quotes of BOTH sides. If your
re-verification CONFIRMS a trap instead (i.e. the owner is wrong), say so loudly with
evidence — that is also a valid outcome. Silently "fixing" any trap = task failed.

1. **"TrainingJob endpoint is missing `epoch`, `totalEpochs`, `eta`, `pid`,
   `configPath`, `tensorboardLogDir`"** — FALSE. `routers/training.py:192-219`
   (`_build_job_from_toml`) returns ALL six fields, and `types.ts:118-146` declares
   them (`epoch` line 125, `totalEpochs` 126, `eta` 136, `configPath?` 143,
   `tensorboardLogDir?` 144, `pid?` 145). Do NOT add these fields anywhere. The
   previous audit's W1 ("Contract Alignment") is VOID.
2. **"GpuStats mismatch: backend `vramUsed` vs TS `vramUsedGB`"** — FALSE.
   `types.ts:149-157` declares `vramUsed` (GB), matching the backend. There is no
   `vramUsedGB` field in GpuStats.
3. **"Delete `routers/__init__.py` and `utils/__init__.py`, they are empty (0 bytes)"**
   — FALSE and dangerous: they are 17/18 bytes, and deleting package markers can break
   PyInstaller freezing. Leave them alone.
4. **"`.gitignore` may accidentally exclude `requirements.txt`"** — FALSE: the file
   contains the negation `!src/**/requirements.txt` right after `!ATTRIBUTIONS.md`.
5. **Field-count claims** (e.g. "backend returns 23 fields, TS expects 27") — re-derive
   any counts yourself; do not inherit numbers from previous reports.

## 6. Recursive loop protocol

- Per item: verify → (fix) → re-verify. If re-verification fails, fix again —
  **max 3 iterations per item**, then mark BLOCKED with the iteration log.
- After all items: one full-system pass (W5). If it surfaces regressions caused by your
  fixes, fix them under the same 3-iteration limit.
- Log every iteration (item, action, evidence ref, outcome) in the report — the loop
  log is part of the deliverable.

## 7. Report format → `doc/FIX_REPORT.md`

```
0. Ground Truth block (raw outputs, incl. post-fix re-runs) + TRUE elapsed time
1. Summary: fixed / rejected(traps) / blocked counts; tests before → after
2. Per-item cards: W0..W5 and T1..T5 (traps) — action taken, evidence refs,
   acceptance criterion met (verbatim)
3. Recursive loop log (per §6)
4. Files changed: git diff --stat + one-line rationale each, mapped to the §2.2 whitelist
5. Bugs discovered but NOT fixed (per §2.2 reporting rule)
6. Evidence Log (numbered, verbatim)
```

Chat output after saving: fixed/rejected/blocked counts, test results, elapsed time — nothing more.

## 8. Definition of done

- [ ] Ground Truth block pasted raw; baseline claims of §3 independently confirmed or corrected.
- [ ] Every §4 item fixed with its acceptance criterion demonstrated verbatim, or NOT PERFORMED/BLOCKED with reason.
- [ ] Every §5 trap rejected (or refuted the owner!) with two-sided verbatim evidence.
- [ ] `python -m pytest src/app/backend/tests/ -q` → green; `pnpm test` → green.
- [ ] `git status --porcelain` shows ONLY whitelisted changes + `doc/FIX_REPORT.md`.
- [ ] Nothing committed; no processes left running; true elapsed time stated.
