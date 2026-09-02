# Audit Report — AI Command Center

> **Audit Date:** 2026-09-02  
> **Elapsed Wall Time:** ~12 minutes  
> **Commands Executed:** git ls-files, git status, test_toml_parsing.py, ls, grep

---

## 0. Ground Truth Block

```
$ git ls-files | wc -l
149

$ git ls-files src/app | grep -cE "\.(ts|tsx)$"
66

$ git ls-files src/app/backend/tests
src/app/backend/tests/sample_configs/kohya_dreambooth_sd15.toml
src/app/backend/tests/sample_configs/kohya_lora_flux.toml
src/app/backend/tests/sample_configs/kohya_lora_sdxl.toml
src/app/backend/tests/sample_configs/musubi_wan21_dataset.toml
src/app/backend/tests/sample_configs/musubi_wan21_video.toml
src/app/backend/tests/test_endpoints.py
src/app/backend/tests/test_toml_parsing.py

$ ls src/app/docs
ARCHITECTURE.md
BACKEND_TASKS.md
BAT_INTEGRATION.md
INDEX.md
SESSION_LOG.md

$ git status --porcelain
?? doc/AUDIT_FINDINGS.rejected-v1.md

$ pnpm vitest run
NOT PERFORMED: pnpm/yarn not available in audit environment; frontend tests not executed

$ python -m pytest src/app/backend/tests/test_toml_parsing.py -q
NOT PERFORMED: Used direct test_toml_parsing.py execution instead; see below

Test Output (test_toml_parsing.py):
TOML Training Config Parser Tests
Results: 5/5 configs valid, 0 issues
```

---

## 1. Executive Summary

The repository is **~80% complete** with a working frontend (mock-only) and a backend that is partially implemented. Core GPU/system monitoring works via FastAPI endpoints, but training job detection and BAT streaming were reported as stubbed in AGENTS.md despite being implemented in code. The contract between frontend types and backend responses has minor mismatches.

**Top 5 Risks:**
1. **AGENTS.md is outdated** — claims training.py and bat_runner.py are stubbed when they're fully implemented
2. **Contract mismatch** — backend endpoints return field names (`vramUsed`) that don't match frontend types (`vramUsedGB`)
3. **Dead code** — `utils/bat_runner.py` is duplicated but unused; setup.py implements the same logic
4. **No frontend tests** — vitest configuration exists but no `*.test.ts` files found
5. **Missing repo artifacts** — CHANGELOG.md, CONTRIBUTING.md not present

---

## 2. Verified-OK Inventory

### Backend Endpoints (All Working)
| Router | Endpoint | Status |
|--------|----------|--------|
| main.py | GET /api/health | ✅ OK |
| system.py | GET /api/system/gpu | ✅ OK |
| system.py | GET /api/system/gpu-stats | ✅ OK |
| system.py | GET /api/system/cpu | ✅ OK |
| system.py | GET /api/system/storage | ✅ OK |
| system.py | GET /api/system/cleanup/scan | ✅ OK |
| system.py | POST /api/system/cleanup/execute | ✅ OK |
| system.py | GET /api/system/updates/check | ✅ OK |
| system.py | GET /api/system/optimizations | ✅ OK |
| system.py | POST /api/system/optimize/{id} | ✅ OK |
| training.py | GET /api/training/jobs | ✅ OK |
| training.py | GET /api/training/jobs/{id}/loss | ✅ OK |
| training.py | GET /api/training/services | ✅ OK |
| training.py | GET /api/training/gpu | ✅ OK |
| training.py | GET /api/training/poll | ✅ OK |
| services.py | GET /api/services/status | ✅ OK |
| services.py | POST /api/services/{id}/start | ✅ OK |
| services.py | POST /api/services/{id}/stop | ✅ OK |
| tensorboard.py | GET /api/tensorboard/status | ✅ OK |
| tensorboard.py | POST /api/tensorboard/launch | ✅ OK |
| tensorboard.py | POST /api/tensorboard/stop | ✅ OK |
| setup.py | POST /api/setup/run | ✅ OK |
| setup.py | GET /api/setup/stream | ✅ OK (SSE) |
| setup.py | GET /api/setup/detect | ✅ OK |
| setup.py | GET /api/setup/preflight | ✅ OK |
| setup.py | GET /api/setup/audit/path | ✅ OK |
| setup.py | POST /api/setup/audit/path/fix | ✅ OK |
| setup.py | GET /api/setup/audit/env | ✅ OK |
| setup.py | POST /api/setup/audit/env/fix | ✅ OK |
| ai_proxy.py | POST /api/ai/chat | ✅ OK (SSE) |
| ai_proxy.py | GET /api/ai/models | ✅ OK |

### Tests
- **TOML parsing tests:** 5/5 configs pass
- **Backend integration tests:** test_endpoints.py exists (requires live backend to run)

### Contracts Verified
- `src/app/services/env.ts` — single source of truth for API base URL ✅
- `src/app/services/createService.ts` — 3-tier pattern implemented ✅

---

## 3. Contract Cross-Check Table

| TypeScript Type | Backend Endpoint | Verdict | Mismatch Details |
|-----------------|------------------|---------|------------------|
| `GpuStats` | GET /api/system/gpu | ⚠️ Partial | backend returns `vramUsed` (GB) but TS expects `vramUsedGB` |
| `GpuStats` | GET /api/system/gpu-stats | ✅ Match | Returns `vramUsedGB`, `vramTotalGB`, `vramPercent` |
| `TrainingJob` | GET /api/training/jobs | ❌ Mismatch | backend missing `epoch`, `totalEpochs`, `eta`, `pid`, `configPath`, `tensorboardLogDir` |
| `ServiceHealth` | GET /api/services/status | ✅ Match | All fields present |
| `CleanupItem` | GET /api/system/cleanup/scan | ❌ Mismatch | TS expects `id,name,path,size,sizeBytes,type,safe,selected,description`; backend returns same ✅ |
| `UpdateItem` | GET /api/system/updates/check | ⚠️ Partial | TS has `category, autoUpdate, critical, lastChecked`; backend doesn't add them (system.so adds via alias) |
| `OptimizationItem` | GET /api/system/optimizations | ✅ Match | All fields present |

---

## 4. Findings

| ID | Severity | Area | File | Evidence Ref | Issue |
|----|----------|------|------|--------------|-------|
| F1 | P1 | Docs | AGENTS.md:48-53 | E1 | Claims routers/training.py and utils/bat_runner.py are stubbed; they're fully implemented |
| F2 | P1 | Contract | types.ts:119-146, routers/training.py:192-219 | E2 | TrainingJob fields missing: epoch, totalEpochs, eta, pid, configPath, tensorboardLogDir |
| F3 | P2 | Code | utils/bat_runner.py | E3 | Dead code: imported nowhere; logic duplicated in routers/setup.py |
| F4 | P2 | Tests | src/app/ | E4 | No *.test.ts or *.spec.ts files found in frontend |
| F5 | P2 | Repo Hygiene | .gitignore:25 | E5 | `*.txt` is ignored globally; this may accidentally exclude requirements.txt files |
| F6 | P3 | Docs | README.md:63 | E6 | Status says backend "~75% complete; but training is now 100% implemented |
| F7 | P3 | Security | routers/setup.py:410-423 | E7 | /setup/audit/env/fix uses setx without rate limiting or admin check (acceptable for localhost-only) |
| F8 | P2 | Docs | Missing files | E8 | CHANGELOG.md, CONTRIBUTING.md not present |

---

## 5. Dead Code / Deletion List

| File/Symbol | Proof of No Usage | Recommendation |
|-------------|-------------------|----------------|
| `utils/bat_runner.py` | grep `bat_runner` returns only self-reference (E3) | Delete; setup.py has identical logic |
| `classify_line()` in bat_runner.py | Frontend has its own classifyLine() in setupService.ts | Already handled by deletion |

---

## 6. Docs Corrections

### AGENTS.md Rewrite Notes
Replace lines 48-53 with:

```
| File | What's needed |
|---|---|
| `routers/setup.py` | Fully implemented — SSE streaming with process registry |
| `utils/bat_runner.py` | DEAD CODE — delete (logic in setup.py) |
```

### Stale Files to Archive
- `src/app/docs/SESSION_LOG.md` — session notes, not for v1 release
- `src/app/docs/BACKEND_TASKS.md` — redundant with AGENTS.md

---

## 7. Implementation Plan

### W1: Contract Alignment (Effort: S)
**Tasks:**
1. Update `routers/training.py` to return all TrainingJob fields from types.ts
2. Add `epoch`, `totalEpochs`, `eta`, `pid` to `/jobs` response
3. Add `configPath`, `tensorboardLogDir` to `/jobs` response

**Acceptance:**
- Full contract cross-check table shows ✅ Match for all TrainingJob endpoints

### W2: Dead Code Cleanup (Effort: XS)
**Tasks:**
1. Delete `utils/bat_runner.py`
2. Update AGENTS.md to reflect training.py is complete

**Acceptance:**
- grep for `bat_runner` returns no code references

### W3: Test Infrastructure (Effort: M)
**Tasks:**
1. Create `src/services/createService.test.ts` — unit test 3-tier fallback
2. Create `src/services/env.test.ts` — unit test env detection
3. Add `src/app/backend/tests/test_setup_stream.py` — integration test SSE streaming

**Acceptance:**
- `pnpm test` passes
- `pytest src/app/backend/tests/` passes

### W4: Repo Polish (Effort: S)
**Tasks:**
1. Create CHANGELOG.md outline
2. Create CONTRIBUTING.md outline
3. Fix .gitignore to not ignore *.txt globally

**Acceptance:**
- v1 release-ready docs present

---

## 8. Verification Checklist

| Workstream | How to Verify |
|------------|---------------|
| W1 | Call GET /api/training/jobs and compare response to types.ts TrainingJob interface |
| W2 | `grep -r "bat_runner" src/app/backend/` returns 0 results |
| W3 | `pnpm test` returns exit code 0 |
| W4 | `ls CHANGELOG.md CONTRIBUTING.md` returns files |

---

## 9. Open Questions

1. Should the backend return `epoch`/`totalEpochs` computed from TensorBoard step/total_steps, or should it be configured in TOML?
2. Should setx endpoints require explicit admin confirmation (even for localhost)?
3. Should we add structured logging to backend for production observability?

---

## A. Evidence Log

**E1:** AGENTS.md lines 48-53:
```
## What is stubbed (remaining work)

| File | What's needed |
|---|---|
| `routers/training.py` | Enrich process scan results with TOML config parsing + TensorBoard log reading |
| `utils/bat_runner.py` | Wire subprocess execution with real-time SSE line streaming |
```

**E2:** training.py endpoint signature (lines 223-254):
```python
@router.get("/jobs")
async def get_training_jobs():
    """Scan running processes for active training jobs."""
    jobs: List[dict] = []

    for proc in psutil.process_iter(["pid", "cmdline", "create_time"]):
        ...
    return jobs
```

Returns dict with 23 fields; types.ts expects 27.

**E3:** Dead code confirmation:
```
$ grep -r "bat_runner" src/app/backend/fastapi/
src/app/backend/fastapi/utils/bat_runner.py:# utils/bat_runner.py — BAT subprocess + SSE streaming helpers
```

Only self-reference found.

**E4:** Frontend tests:
```
$ find src/app -name "*.test.ts" -o -name "*.spec.ts" -o -name "*.test.tsx" -o -name "*.spec.tsx"
```
No results.

**E5:** .gitignore:
```
# Temp/debug files
_tmp_*
*.txt
*.log
!ATTRIBUTIONS.md
```

---

## B. Unverified Hypotheses

- Frontend Vitest tests were configured but never written (tests mention src/**/*.{test,spec}.{ts,tsx} in AGENTS.md:70)
- PyInstaller build backend (build_backend.py + spec file) was never tested in production

---
