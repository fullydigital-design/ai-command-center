#!/usr/bin/env python3
# ============================================================
# test_endpoints.py — Integration test suite for AI Command Center backend
# ============================================================
#
# NOTE: This file is designed for manual/standalone execution.
# When running under pytest, it is skipped via pytest.skip() below.
# Run it directly: python test_endpoints.py
#
#
# Hits every FastAPI endpoint and validates the response shape
# matches the TypeScript type contracts in src/app/services/types.ts.
#
# Usage:
#   1. Start the backend:
#      uvicorn main:app --host 127.0.0.1 --port 8000 --reload
#
#   2. Run all tests:
#      python test_endpoints.py
#
#   3. Run a single group:
#      python test_endpoints.py --group system
#      python test_endpoints.py --group training
#
#   4. Verbose output:
#      python test_endpoints.py -v
#
# Exit codes:
#   0 = all passed
#   1 = one or more failures
#   2 = backend unreachable
#
# Requirements:
#   pip install requests  (standard, no extra deps)
# ============================================================

import sys
import json
import argparse
import time
import pytest
from typing import Any, Dict, List, Optional, Callable
from dataclasses import dataclass, field

try:
    import requests
except ImportError:
    print("ERROR: 'requests' package required.  pip install requests")
    sys.exit(2)

# ── Config ────────────────────────────────────────────────────

BASE_URL = "http://127.0.0.1:8000/api"
TIMEOUT = 10  # seconds per request


# ── Schema validators ────────────────────────────────────────
# Each validator checks that a dict/list matches the expected
# TypeScript type contract. Returns a list of error strings.

def _check_keys(obj: dict, required: Dict[str, type], label: str = "") -> List[str]:
    """Verify a dict has the required keys with correct types."""
    errors = []
    prefix = f"[{label}] " if label else ""
    for key, expected_type in required.items():
        if key not in obj:
            errors.append(f"{prefix}Missing key: '{key}'")
        elif not isinstance(obj[key], expected_type):
            actual = type(obj[key]).__name__
            expected = expected_type.__name__
            errors.append(f"{prefix}'{key}' expected {expected}, got {actual} (value: {obj[key]!r})")
    return errors


def _check_list_of(data: Any, item_validator: Callable, label: str = "") -> List[str]:
    """Verify data is a list and each item passes the validator."""
    if not isinstance(data, list):
        return [f"[{label}] Expected list, got {type(data).__name__}"]
    errors = []
    for i, item in enumerate(data):
        errors.extend(item_validator(item, f"{label}[{i}]"))
    return errors


# ── Type contract validators ─────────────────────────────────
# These match the TypeScript interfaces in src/app/services/types.ts

def validate_gpu_stats(data: dict, label: str = "GpuStats") -> List[str]:
    return _check_keys(data, {
        "name": str,
        "gpuUtilization": (int, float),
        "vramUsed": (int, float),
        "vramTotal": (int, float),
        "temperature": (int, float),
        "powerDraw": (int, float),
        "powerLimit": (int, float),
    }, label)


def validate_cpu_stats(data: dict, label: str = "CpuStats") -> List[str]:
    return _check_keys(data, {
        "usage": (int, float),
        "frequency": (int, float),
        "cores": int,
        "threads": int,
        "ramTotal": (int, float),
        "ramUsed": (int, float),
        "ramPercent": (int, float),
    }, label)


def validate_storage_breakdown(data: dict, label: str = "StorageBreakdown") -> List[str]:
    errors = _check_keys(data, {"total_gb": (int, float), "categories": list}, label)
    if "categories" in data and isinstance(data["categories"], list):
        for i, cat in enumerate(data["categories"]):
            errors.extend(_check_keys(cat, {
                "name": str,
                "size_gb": (int, float),
                "count": int,
            }, f"{label}.categories[{i}]"))
    return errors


def validate_cleanup_item(data: dict, label: str = "CleanupItem") -> List[str]:
    return _check_keys(data, {
        "id": str,
        "name": str,
        "path": str,
        "size": str,
        "sizeBytes": int,
        "type": str,
        "safe": bool,
        "selected": bool,
    }, label)


def validate_update_item(data: dict, label: str = "UpdateItem") -> List[str]:
    return _check_keys(data, {
        "id": str,
        "name": str,
        "currentVersion": str,
        "latestVersion": str,
        "hasUpdate": bool,
        "commitsBehind": int,
    }, label)


def validate_optimization(data: dict, label: str = "Optimization") -> List[str]:
    return _check_keys(data, {
        "id": str,
        "title": str,
        "desc": str,
        "status": str,
        "impact": str,
        "category": str,
    }, label)


def validate_training_job(data: dict, label: str = "TrainingJob") -> List[str]:
    """Validate TrainingJob — only runs if jobs are detected."""
    return _check_keys(data, {
        "id": str,
        "name": str,
        "type": str,
        "tool": str,
        "status": str,
        "progress": (int, float),
        "currentStep": int,
        "totalSteps": int,
        "currentLoss": (int, float),
        "lossHistory": list,
        "learningRate": (int, float),
        "batchSize": int,
        "resolution": str,
        "model": str,
        "dataset": str,
        "outputPath": str,
    }, label)


def validate_loss_point(data: dict, label: str = "LossDataPoint") -> List[str]:
    return _check_keys(data, {
        "step": int,
        "loss": (int, float),
    }, label)


def validate_service_health(data: dict, label: str = "ServiceHealth") -> List[str]:
    return _check_keys(data, {
        "id": str,
        "name": str,
        "running": bool,
        "port": int,
    }, label)


def validate_preflight(data: dict, label: str = "Preflight") -> List[str]:
    errors = []
    for key in ("python", "git", "cuda"):
        if key not in data:
            errors.append(f"[{label}] Missing key: '{key}'")
        elif not isinstance(data[key], dict):
            errors.append(f"[{label}] '{key}' should be dict")
        elif "ok" not in data[key]:
            errors.append(f"[{label}] '{key}' missing 'ok' field")
    if "disk_space_gb" not in data:
        errors.append(f"[{label}] Missing key: 'disk_space_gb'")
    return errors


# ── Test definitions ─────────────────────────────────────────

@dataclass
class TestResult:
    name: str
    group: str
    method: str
    url: str
    passed: bool
    status_code: int = 0
    errors: List[str] = field(default_factory=list)
    response_time_ms: float = 0
    note: str = ""
    skipped: bool = False


def _get(path: str) -> requests.Response:
    return requests.get(f"{BASE_URL}{path}", timeout=TIMEOUT)


def _post(path: str, body: dict = None) -> requests.Response:
    return requests.post(
        f"{BASE_URL}{path}",
        json=body or {},
        headers={"Content-Type": "application/json"},
        timeout=TIMEOUT,
    )


def run_test(
    name: str,
    group: str,
    method: str,
    path: str,
    validator: Optional[Callable] = None,
    body: dict = None,
    expect_list: bool = False,
    list_item_validator: Optional[Callable] = None,
    allow_empty_list: bool = True,
    note: str = "",
) -> TestResult:
    """Run a single endpoint test."""
    url = f"{BASE_URL}{path}"
    result = TestResult(name=name, group=group, method=method, url=url, passed=False, note=note)

    try:
        start = time.time()
        if method == "GET":
            resp = _get(path)
        else:
            resp = _post(path, body)
        result.response_time_ms = (time.time() - start) * 1000
        result.status_code = resp.status_code

        if resp.status_code not in (200, 201):
            result.errors.append(f"HTTP {resp.status_code}: {resp.text[:200]}")
            return result

        data = resp.json()

        # Validate response shape
        if expect_list:
            if not isinstance(data, list):
                result.errors.append(f"Expected list, got {type(data).__name__}")
            elif list_item_validator and len(data) > 0:
                for i, item in enumerate(data):
                    result.errors.extend(list_item_validator(item, f"[{i}]"))
            elif not allow_empty_list and len(data) == 0:
                result.errors.append("Empty list returned (expected items)")
        elif validator:
            result.errors.extend(validator(data, name))

        result.passed = len(result.errors) == 0

    except requests.ConnectionError:
        result.errors.append("Connection refused — is the backend running?")
    except requests.Timeout:
        result.errors.append(f"Timeout after {TIMEOUT}s")
    except json.JSONDecodeError:
        result.errors.append("Response is not valid JSON")
    except Exception as e:
        result.errors.append(f"Unexpected error: {e}")

    return result


# ── Test suite ────────────────────────────────────────────────

ALL_TESTS: List[Callable[[], TestResult]] = []


def register_test(fn):
    ALL_TESTS.append(fn)
    return fn


# ─── Health ───────────────────────────────────────────────────

@register_test
def test_health():
    def validate(data, label):
        errors = _check_keys(data, {"status": str, "version": str}, label)
        if data.get("status") != "ok":
            errors.append(f"Expected status='ok', got '{data.get('status')}'")
        return errors
    return run_test("Health Check", "health", "GET", "/health", validator=validate)


# ─── System ──────────────────────────────────────────────────

@register_test
def test_gpu_stats():
    return run_test("GPU Stats", "system", "GET", "/system/gpu", validator=validate_gpu_stats)


@register_test
def test_cpu_stats():
    return run_test("CPU Stats", "system", "GET", "/system/cpu", validator=validate_cpu_stats)


@register_test
def test_storage():
    return run_test("Storage Breakdown", "system", "GET", "/system/storage", validator=validate_storage_breakdown)


@register_test
def test_cleanup_scan():
    return run_test("Cleanup Scan", "system", "GET", "/system/cleanup/scan",
                    expect_list=True, list_item_validator=validate_cleanup_item)


@register_test
def test_cleanup_execute():
    return run_test("Cleanup Execute", "system", "POST", "/system/cleanup/execute",
                    body={"item_ids": ["pip_cache"]},
                    validator=lambda d, l: _check_keys(d, {"success": bool, "freedMb": (int, float)}, l))


@register_test
def test_updates_check():
    return run_test("Software Updates", "system", "GET", "/system/updates/check",
                    expect_list=True, list_item_validator=validate_update_item)


@register_test
def test_update_run():
    return run_test("Run Update", "system", "POST", "/system/updates/run/comfyui",
                    validator=lambda d, l: _check_keys(d, {"id": str, "status": str}, l))


@register_test
def test_optimizations():
    return run_test("Optimizations List", "system", "GET", "/system/optimizations",
                    expect_list=True, list_item_validator=validate_optimization)


@register_test
def test_apply_optimization():
    return run_test("Apply Optimization", "system", "POST", "/system/optimize/tf32",
                    validator=lambda d, l: _check_keys(d, {"id": str, "applied": bool}, l))


# ─── Training ────────────────────────────────────────────────

@register_test
def test_training_jobs():
    return run_test("Training Jobs", "training", "GET", "/training/jobs",
                    expect_list=True, list_item_validator=validate_training_job,
                    allow_empty_list=True,
                    note="Empty list is valid (no training detected)")


@register_test
def test_loss_history():
    return run_test("Loss History", "training", "GET", "/training/jobs/12345/loss",
                    expect_list=True, list_item_validator=validate_loss_point,
                    allow_empty_list=True,
                    note="Empty list is valid (no job or no TB logs)")


@register_test
def test_training_services():
    return run_test("Training Services", "training", "GET", "/training/services",
                    expect_list=True, list_item_validator=validate_service_health)


# ─── TensorBoard ─────────────────────────────────────────────

@register_test
def test_tensorboard_status():
    return run_test("TensorBoard Status", "tensorboard", "GET", "/tensorboard/status",
                    validator=lambda d, l: _check_keys(d, {"running": bool}, l))


@register_test
def test_tensorboard_launch():
    return run_test("TensorBoard Launch", "tensorboard", "POST", "/tensorboard/launch",
                    body={"logdir": "C:/test/logs", "port": 6006},
                    validator=lambda d, l: _check_keys(d, {"message": str}, l))


@register_test
def test_tensorboard_stop():
    return run_test("TensorBoard Stop", "tensorboard", "POST", "/tensorboard/stop",
                    validator=lambda d, l: _check_keys(d, {"message": str}, l))


# ─── Services ────────────────────────────────────────────────

@register_test
def test_services_status():
    return run_test("Services Status", "services", "GET", "/services/status",
                    expect_list=True, list_item_validator=validate_service_health)


@register_test
def test_service_start():
    """Skip if launch script not found (environment-dependent)."""
    resp = _post("/services/comfyui/start", body={"name": "comfyui"})
    if resp.status_code == 404 and "Launch script not found" in resp.text:
        return TestResult(name="Service Start", group="services", method="POST",
                        url=f"{BASE_URL}/services/comfyui/start", passed=True,
                        status_code=404, note="SKIP: script not found (environment-dependent)", skipped=True)
    return run_test("Service Start", "services", "POST", "/services/comfyui/start",
                    validator=lambda d, l: _check_keys(d, {"message": str}, l))


@register_test
def test_service_stop():
    return run_test("Service Stop", "services", "POST", "/services/comfyui/stop",
                    validator=lambda d, l: _check_keys(d, {"message": str}, l))


# ─── Setup ───────────────────────────────────────────────────

@register_test
def test_detect_installs():
    def validate(data, label):
        expected = {"comfyui": bool, "swarmui": bool, "kohya": bool, "musubi": bool}
        return _check_keys(data, expected, label)
    return run_test("Detect Installs", "setup", "GET", "/setup/detect", validator=validate)


@register_test
def test_preflight():
    return run_test("Preflight Checks", "setup", "GET", "/setup/preflight",
                    validator=validate_preflight)


@register_test
def test_setup_run():
    return run_test("Setup Run", "setup", "POST", "/setup/run",
                    body={"action": "cleanup"},
                    validator=lambda d, l: _check_keys(d, {"stream_id": str}, l))


@register_test
def test_path_audit():
    return run_test("PATH Audit", "setup", "GET", "/setup/audit/path",
                    validator=lambda d, l: _check_keys(d, {"issues": list, "suggestions": list}, l))


@register_test
def test_path_fix():
    return run_test("PATH Fix", "setup", "POST", "/setup/audit/path/fix",
                    body={"fixes": []},
                    validator=lambda d, l: _check_keys(d, {"fixed": list, "errors": list}, l))


@register_test
def test_env_audit():
    return run_test("Env Audit", "setup", "GET", "/setup/audit/env",
                    validator=lambda d, l: _check_keys(d, {"variables": list, "issues": list}, l))


@register_test
def test_env_fix():
    return run_test("Env Fix", "setup", "POST", "/setup/audit/env/fix",
                    body={"fixes": []},
                    validator=lambda d, l: _check_keys(d, {"fixed": list, "errors": list}, l))


# ─── AI Proxy ────────────────────────────────────────────────

@register_test
def test_ai_chat():
    """AI proxy — expected to return an error unless OPENROUTER_API_KEY is set."""
    def validate(data, label):
        # Both "error" (no key) and valid response are acceptable
        if "error" in data:
            return []  # Expected when no API key
        return _check_keys(data, {"choices": list}, label)
    return run_test("AI Chat Proxy", "ai", "POST", "/ai/chat",
                    body={"messages": [{"role": "user", "content": "test"}], "model": "anthropic/claude-sonnet-4-20250514"},
                    validator=validate,
                    note="Returns error if OPENROUTER_API_KEY not set (expected)")


# ── Runner ────────────────────────────────────────────────────

def check_backend_reachable() -> bool:
    """Quick health ping before running tests."""
    try:
        resp = requests.get(f"{BASE_URL}/health", timeout=3)
        return resp.status_code == 200
    except Exception:
        return False


def print_result(result: TestResult, verbose: bool = False):
    """Print a single test result."""
    if result.skipped:
        icon = "⏭"
    elif result.passed:
        icon = "✅"
    else:
        icon = "❌"
    time_str = f"{result.response_time_ms:.0f}ms"
    print(f"  {icon}  {result.name:<25} {result.method:<5} {result.status_code:<4} {time_str}")

    if verbose and result.note:
        print(f"       ℹ️  {result.note}")

    if not result.passed and not result.skipped:
        for err in result.errors:
            print(f"       ⚠  {err}")


def main():
    global BASE_URL
    parser = argparse.ArgumentParser(description="AI Command Center backend integration tests")
    parser.add_argument("-v", "--verbose", action="store_true", help="Show extra details")
    parser.add_argument("--group", type=str, help="Run only tests in this group (health|system|training|tensorboard|services|setup|ai)")
    parser.add_argument("--url", type=str, default=BASE_URL, help=f"Base URL (default: {BASE_URL})")
    args = parser.parse_args()

    BASE_URL = args.url.rstrip("/")

    # ── Connectivity check ─────────────────────────────────────
    print(f"\n🔌 Checking backend at {BASE_URL}...")
    if not check_backend_reachable():
        print(f"\n❌ Backend unreachable at {BASE_URL}")
        print("   Start it with: uvicorn main:app --host 127.0.0.1 --port 8000 --reload\n")
        sys.exit(2)
    print(f"   ✅ Backend is up!\n")

    # ── Run tests ──────────────────────────────────────────────
    results: List[TestResult] = []
    current_group = ""

    for test_fn in ALL_TESTS:
        result = test_fn()
        if args.group and result.group != args.group:
            continue
        if result.group != current_group:
            current_group = result.group
            print(f"  {'─' * 50}")
            print(f"  📂 {current_group.upper()}")
            print(f"  {'─' * 50}")
        results.append(result)
        print_result(result, verbose=args.verbose)

    # ── Summary ────────────────────────────────────────────────
    passed = sum(1 for r in results if r.passed and not r.skipped)
    skipped = sum(1 for r in results if r.skipped)
    failed = sum(1 for r in results if not r.passed and not r.skipped)
    total = len(results)
    avg_ms = sum(r.response_time_ms for r in results) / max(total, 1)

    print(f"\n{'=' * 55}")
    print(f"  📊 Results: {passed} passed, {skipped} skipped, {failed} failed")
    print(f"  ⏱  Average response time: {avg_ms:.0f}ms")

    if skipped > 0:
        print(f"\n  ⏭  Skipped tests:")
        for r in results:
            if r.skipped:
                print(f"     - {r.name}: {r.note}")

    if failed > 0:
        print(f"\n  ❌ Failed tests:")
        for r in results:
            if not r.passed and not r.skipped:
                print(f"     - {r.name}: {r.errors[0] if r.errors else 'unknown'}")

    print()
    sys.exit(0 if failed == 0 else 1)


if __name__ == "__main__":
    main()
else:
    # Skip this file when running under pytest - it requires a live backend
    pytest.skip("Integration tests require live backend on 127.0.0.1:8000", allow_module_level=True)
