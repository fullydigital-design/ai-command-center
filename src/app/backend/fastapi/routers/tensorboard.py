# ============================================================
# routers/tensorboard.py - TensorBoard launch / stop / status
# ============================================================

import importlib.util
import logging
import os
import subprocess
import sys
import time
from typing import Any

import psutil
from fastapi import APIRouter

from config import TENSORBOARD_PORT
from utils.processes import extract_arg

logger = logging.getLogger("ai_command_center.tensorboard")

router = APIRouter()

# Track the TensorBoard process launched by this backend instance.
_tb_process: subprocess.Popen | None = None
_tb_logdir: str | None = None
_tb_port: int = TENSORBOARD_PORT


def _find_running_tensorboard() -> dict[str, Any] | None:
    """Scan for a running TensorBoard instance."""
    global _tb_process, _tb_logdir, _tb_port

    # 1) Our launched subprocess.
    if _tb_process is not None and _tb_process.poll() is None:
        return {
            "running": True,
            "pid": _tb_process.pid,
            "logdir": _tb_logdir or "",
            "port": _tb_port,
            "url": f"http://localhost:{_tb_port}",
        }

    if _tb_process is not None and _tb_process.poll() is not None:
        _tb_process = None

    # 2) Any system TensorBoard process.
    for proc in psutil.process_iter(["pid", "cmdline"]):
        try:
            cmdline = proc.info.get("cmdline") or []
            cmd = " ".join(cmdline)
        except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
            continue

        if "tensorboard" in cmd.lower() and "--logdir" in cmd:
            logdir = extract_arg(cmd, "--logdir")
            port_str = extract_arg(cmd, "--port")
            port = int(port_str) if str(port_str).isdigit() else TENSORBOARD_PORT
            return {
                "running": True,
                "pid": proc.pid,
                "logdir": logdir,
                "port": port,
                "url": f"http://localhost:{port}",
            }

    return None


def _kill_tensorboard():
    """Kill TensorBoard - our process first, then psutil fallback."""
    global _tb_process, _tb_logdir, _tb_port

    # 1) Kill our own subprocess handle.
    if _tb_process is not None:
        try:
            if _tb_process.poll() is None:
                _tb_process.terminate()
                _tb_process.wait(timeout=5)
        except Exception:
            try:
                _tb_process.kill()
            except Exception as kill_err:
                logger.warning("Failed to kill TensorBoard process: %s", kill_err)
        finally:
            _tb_process = None

    # 2) Kill remaining TensorBoard processes on the system.
    for proc in psutil.process_iter(["pid", "cmdline"]):
        try:
            cmdline = proc.info.get("cmdline") or []
            cmd = " ".join(cmdline)
            if "tensorboard" in cmd.lower() and "--logdir" in cmd:
                proc.terminate()
        except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
            continue

    _tb_logdir = None
    _tb_port = TENSORBOARD_PORT


def shutdown():
    """Public shutdown hook for app lifecycle cleanup."""
    _kill_tensorboard()


@router.get("/status")
async def tensorboard_status():
    """Check if TensorBoard is running (our process or system TB)."""
    result = _find_running_tensorboard()
    if result:
        return result
    return {"running": False}


@router.post("/launch")
async def tensorboard_launch(body: dict):
    """Launch TensorBoard with the given logdir and port."""
    global _tb_process, _tb_logdir, _tb_port

    logdir = str(body.get("logdir", "") or "").strip()
    port_raw = body.get("port", TENSORBOARD_PORT)
    try:
        port = int(port_raw)
    except (TypeError, ValueError):
        port = TENSORBOARD_PORT

    if not logdir:
        return {"message": "Error: logdir is required", "pid": 0}

    if importlib.util.find_spec("tensorboard.main") is None:
        return {
            "message": "Error: tensorboard not found. Install with: pip install tensorboard",
            "pid": 0,
        }
    if importlib.util.find_spec("pkg_resources") is None:
        return {
            "message": "Error: setuptools is required for TensorBoard. Install with: pip install setuptools",
            "pid": 0,
        }

    existing = _find_running_tensorboard()
    if existing:
        _kill_tensorboard()

    python_exe = sys.executable
    tb_cmd = [
        python_exe,
        "-m",
        "tensorboard.main",
        "--logdir",
        logdir,
        "--port",
        str(port),
        "--bind_all",
    ]

    creationflags = 0
    if os.name == "nt" and hasattr(subprocess, "CREATE_NEW_PROCESS_GROUP"):
        creationflags = subprocess.CREATE_NEW_PROCESS_GROUP

    try:
        _tb_process = subprocess.Popen(
            tb_cmd,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            creationflags=creationflags,
        )
        _tb_logdir = logdir
        _tb_port = port

        # If it exits immediately, surface a useful launch error.
        time.sleep(0.3)
        if _tb_process.poll() is not None:
            _tb_process = None
            _tb_logdir = None
            _tb_port = TENSORBOARD_PORT
            return {
                "message": "Error launching TensorBoard: process exited immediately",
                "pid": 0,
            }

        return {
            "message": f"TensorBoard launched on port {port}",
            "pid": _tb_process.pid,
        }
    except FileNotFoundError:
        return {
            "message": "Error: tensorboard not found. Install with: pip install tensorboard",
            "pid": 0,
        }
    except Exception as e:
        return {
            "message": f"Error launching TensorBoard: {e}",
            "pid": 0,
        }


@router.post("/stop")
async def tensorboard_stop():
    """Stop the running TensorBoard process."""
    existing = _find_running_tensorboard()
    if not existing:
        return {"message": "No TensorBoard process found"}

    _kill_tensorboard()
    return {"message": "TensorBoard stopped"}
