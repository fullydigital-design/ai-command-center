# ============================================================
# routers/setup.py - BAT wrapper + SSE streaming + install detection
# ============================================================

import asyncio
import json
import os
import shutil
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, Query
from fastapi.responses import StreamingResponse
from sse_starlette.sse import EventSourceResponse

from config import AI_ROOT, PATH_AUDIT_PY, SERVICE_CONFIGS, SETUP_BAT

router = APIRouter()

# Track running BAT processes by stream_id
_running_processes: dict[str, dict] = {}

# BAT menu action -> keystroke mapping
ACTION_TO_KEY = {
    "full_setup": "1",
    "install_comfyui": "2",
    "install_swarmui": "3",
    "install_kohya": "4",
    "install_musubi": "5",
    "system_setup": "6",
    "nodes_models": "7",
    "update_all": "8",
    "cleanup": "9",
    "diagnostics": "0",
    "comfy_reset": "C",
    "model_audit": "S",
    "full_reset": "R",
    "path_cleanup": "P",
}

ENV_CHECKS = [
    {"key": "CUDA_HOME", "required": False, "description": "CUDA toolkit install path"},
    {"key": "CUDA_PATH", "required": False, "description": "CUDA toolkit path (Windows)"},
    {"key": "HF_HOME", "required": False, "description": "HuggingFace cache directory"},
    {"key": "HF_HUB_ENABLE_HF_TRANSFER", "required": False, "description": "Fast HuggingFace downloads"},
    {"key": "NVIDIA_TF32_OVERRIDE", "required": False, "description": "TF32 math mode for RTX GPUs"},
    {"key": "PYTORCH_CUDA_ALLOC_CONF", "required": False, "description": "PyTorch CUDA memory allocator config"},
    {"key": "CUDA_VISIBLE_DEVICES", "required": False, "description": "GPU device selection"},
    {"key": "COMFYUI_PATH", "required": False, "description": "ComfyUI install path"},
]


def _get_python_version() -> tuple[bool, str]:
    """Get Python version and check if it's in the supported range."""
    ver = f"{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}"
    minor = sys.version_info.minor
    ok = 10 <= minor <= 12
    return (ok, ver)


def _get_git_version() -> tuple[bool, str]:
    """Check if git is available and get version."""
    try:
        result = subprocess.run(
            ["git", "--version"],
            capture_output=True,
            text=True,
            timeout=10,
        )
        if result.returncode == 0:
            ver = result.stdout.strip().replace("git version ", "").split(".windows")[0]
            return (True, ver)
    except (FileNotFoundError, subprocess.TimeoutExpired):
        pass
    return (False, "not found")


def _get_cuda_version() -> tuple[bool, str]:
    """Check CUDA availability via nvidia-smi."""
    try:
        result = subprocess.run(
            ["nvidia-smi", "--query-gpu=driver_version", "--format=csv,noheader,nounits"],
            capture_output=True,
            text=True,
            timeout=10,
        )
        if result.returncode == 0:
            driver = result.stdout.strip().split("\n")[0]
            cuda_result = subprocess.run(
                ["nvidia-smi"],
                capture_output=True,
                text=True,
                timeout=10,
            )
            cuda_ver = ""
            if cuda_result.returncode == 0:
                for line in cuda_result.stdout.split("\n"):
                    if "CUDA Version" in line:
                        parts = line.split("CUDA Version:")
                        if len(parts) > 1:
                            cuda_ver = parts[1].strip().rstrip("|").strip()
                            break
            ver = cuda_ver if cuda_ver else f"driver {driver}"
            return (True, ver)
    except (FileNotFoundError, subprocess.TimeoutExpired):
        pass
    return (False, "not found")


def _get_disk_space() -> tuple[bool, float]:
    """Check available disk space on the AI_ROOT drive."""
    try:
        usage = shutil.disk_usage(str(AI_ROOT))
        available_gb = round(usage.free / (1024 ** 3), 1)
        return (available_gb >= 50, available_gb)
    except OSError:
        return (False, 0.0)


@router.post("/run")
async def run_setup(body: dict):
    """Start a BAT action via subprocess and return a stream_id."""
    action = body.get("action", "")
    menu_key = ACTION_TO_KEY.get(action)
    if not menu_key:
        return {"error": f"Unknown action: {action}"}

    stream_id = f"setup-{action}-{int(time.time())}"

    if not SETUP_BAT.exists():
        _running_processes[stream_id] = {
            "error": f"Setup script not found: {SETUP_BAT}",
        }
        return {"stream_id": stream_id}

    try:
        creationflags = 0
        if os.name == "nt":
            creationflags = getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0)

        proc = subprocess.Popen(
            f'cmd /c "{SETUP_BAT}"',
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            shell=True,
            creationflags=creationflags,
            text=True,
            bufsize=1,
        )

        if proc.stdin:
            proc.stdin.write(f"{menu_key}\n")
            proc.stdin.flush()

        _running_processes[stream_id] = {"proc": proc}
    except Exception as e:
        _running_processes[stream_id] = {"error": str(e)}

    return {"stream_id": stream_id}


@router.get("/stream")
async def stream_output(stream_id: str = Query(...)):
    """SSE endpoint - streams BAT stdout line by line."""

    async def event_generator():
        entry = _running_processes.get(stream_id)

        if not entry:
            yield {
                "event": "error",
                "data": json.dumps({"text": f"No such stream: {stream_id}"}),
            }
            return

        if "error" in entry:
            yield {
                "event": "output",
                "data": json.dumps(
                    {
                        "text": f"ERROR: {entry['error']}",
                        "timestamp": datetime.now().isoformat(),
                    }
                ),
            }
            yield {
                "event": "done",
                "data": json.dumps({"exitCode": 1}),
            }
            _running_processes.pop(stream_id, None)
            return

        proc = entry.get("proc")
        if not proc:
            yield {
                "event": "error",
                "data": json.dumps({"text": "Process not found"}),
            }
            return

        try:
            while True:
                if proc.stdout is None:
                    break
                line = await asyncio.to_thread(proc.stdout.readline)

                if not line and proc.poll() is not None:
                    break

                if line:
                    yield {
                        "event": "output",
                        "data": json.dumps(
                            {
                                "text": line.rstrip("\n\r"),
                                "timestamp": datetime.now().isoformat(),
                            }
                        ),
                    }

            yield {
                "event": "done",
                "data": json.dumps({"exitCode": proc.returncode}),
            }
        except Exception as e:
            yield {
                "event": "error",
                "data": json.dumps({"text": str(e)}),
            }
        finally:
            _running_processes.pop(stream_id, None)

    return EventSourceResponse(event_generator())


@router.get("/detect")
async def detect_installs():
    """Check which tools are installed by detecting key files."""
    results: dict[str, bool] = {}

    for svc_id, cfg in SERVICE_CONFIGS.items():
        svc_path = cfg.get("path")
        detect_file = cfg.get("detect_file")

        if not svc_path or not detect_file:
            if svc_id == "ollama":
                results[svc_id] = shutil.which("ollama") is not None
            else:
                results[svc_id] = False
            continue

        svc_path = Path(svc_path)
        target = svc_path / str(detect_file)

        if target.exists():
            results[svc_id] = True
        elif svc_id == "kohya":
            alt = svc_path / "sd-scripts" / str(detect_file)
            results[svc_id] = alt.exists()
        elif svc_id == "musubi":
            results[svc_id] = (svc_path / ".git").exists()
        else:
            results[svc_id] = False

    return results


@router.get("/preflight")
async def preflight_checks():
    """Check system requirements before running setup."""
    py_ok, py_ver = _get_python_version()
    git_ok, git_ver = _get_git_version()
    cuda_ok, cuda_ver = _get_cuda_version()
    disk_ok, disk_avail = _get_disk_space()

    return {
        "python": {"ok": py_ok, "version": py_ver, "required": ">=3.10,<=3.12"},
        "git": {"ok": git_ok, "version": git_ver},
        "cuda": {"ok": cuda_ok, "version": cuda_ver},
        "disk_space_gb": {"ok": disk_ok, "available": disk_avail, "required": 50},
    }


@router.get("/audit/path")
async def path_audit():
    """Run RTX5090_PATH_AUDIT.py --json and return structured results."""
    if not PATH_AUDIT_PY.exists():
        return {
            "issues": [{"level": "info", "message": f"Audit script not found: {PATH_AUDIT_PY}"}],
            "suggestions": [],
        }

    try:
        result = subprocess.run(
            [sys.executable, str(PATH_AUDIT_PY), "3.12", "--json"],
            capture_output=True,
            text=True,
            timeout=30,
            cwd=str(AI_ROOT),
        )
        if result.returncode == 0 and result.stdout.strip():
            try:
                data = json.loads(result.stdout)
                return {
                    "issues": data.get("issues", []),
                    "suggestions": data.get("suggestions", []),
                }
            except json.JSONDecodeError:
                return {
                    "issues": [{"level": "warning", "message": "Audit output was not valid JSON"}],
                    "suggestions": [],
                }

        return {
            "issues": [
                {
                    "level": "warning",
                    "message": (result.stderr.strip()[:200] if result.stderr else "Audit returned no output"),
                }
            ],
            "suggestions": [],
        }
    except subprocess.TimeoutExpired:
        return {"issues": [{"level": "error", "message": "Audit timed out"}], "suggestions": []}
    except Exception as e:
        return {"issues": [{"level": "error", "message": str(e)[:200]}], "suggestions": []}


@router.post("/audit/path/fix")
async def apply_path_fixes(body: dict):
    """Apply PATH fixes. Safe no-op without admin privileges."""
    fixes = body.get("fixes", [])
    if not fixes:
        return {"fixed": [], "errors": []}

    return {
        "fixed": [],
        "errors": [
            {
                "message": "PATH modifications require running as Administrator. Use the BAT script instead.",
            }
        ],
    }


@router.get("/audit/env")
async def env_audit():
    """Check important environment variables for AI workflows."""
    variables = []
    issues = []

    for check in ENV_CHECKS:
        key = check["key"]
        value = os.environ.get(key, "")
        is_set = bool(value)

        variables.append(
            {
                "key": key,
                "value": value if is_set else "(not set)",
                "set": is_set,
                "required": check["required"],
                "description": check["description"],
            }
        )

        if check["required"] and not is_set:
            issues.append(
                {
                    "level": "warning",
                    "key": key,
                    "message": f"{key} is not set - {check['description']}",
                }
            )

    return {"variables": variables, "issues": issues}


@router.post("/audit/env/fix")
async def apply_env_fixes(body: dict):
    """Apply env var fixes via setx."""
    fixes = body.get("fixes", [])
    fixed = []
    errors = []

    for fix in fixes:
        key = fix.get("key", "")
        value = fix.get("value", "")
        if not key:
            continue

        try:
            result = subprocess.run(
                ["setx", key, value],
                capture_output=True,
                text=True,
                timeout=10,
            )
            if result.returncode == 0:
                os.environ[key] = value
                fixed.append({"key": key, "value": value})
            else:
                errors.append({"key": key, "message": (result.stderr or "").strip()[:200]})
        except Exception as e:
            errors.append({"key": key, "message": str(e)[:200]})

    return {"fixed": fixed, "errors": errors}


def cleanup_processes():
    """Kill any BAT processes still running on shutdown."""
    for stream_id, entry in list(_running_processes.items()):
        proc = entry.get("proc")
        if proc and proc.poll() is None:
            try:
                proc.terminate()
                proc.wait(timeout=5)
            except Exception:
                try:
                    proc.kill()
                except Exception:
                    pass
    _running_processes.clear()
