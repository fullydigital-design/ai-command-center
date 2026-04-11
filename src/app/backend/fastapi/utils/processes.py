# ============================================================
# utils/processes.py — psutil helpers for process management
# ============================================================
# Shared process scanning and management utilities.
# Imported by: system.py, services.py, training.py
# ============================================================

import logging
import shlex
import socket

import psutil

logger = logging.getLogger("ai_command_center.processes")


# ── CPU / RAM stats ─────────────────────────────────────────


def get_cpu_stats() -> dict:
    """
    Get CPU usage, frequency, core count, and RAM stats.

    Returns dict matching the frontend's expected shape:
    {
        "usage": float,       # 0-100
        "frequency": int,     # MHz
        "cores": int,         # physical
        "threads": int,       # logical
        "ramTotal": float,    # GB
        "ramUsed": float,     # GB
        "ramPercent": float,  # 0-100
    }
    """
    freq = psutil.cpu_freq()
    mem = psutil.virtual_memory()
    return {
        "usage": psutil.cpu_percent(interval=0.1),
        "frequency": int(freq.current) if freq else 0,
        "cores": psutil.cpu_count(logical=False) or 0,
        "threads": psutil.cpu_count(logical=True) or 0,
        "ramTotal": round(mem.total / 1e9, 1),
        "ramUsed": round(mem.used / 1e9, 1),
        "ramPercent": mem.percent,
    }


# ── Port / network helpers ──────────────────────────────────


def check_port(host: str, port: int, timeout: float = 0.1) -> bool:
    """Check if a TCP port is listening."""
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return True
    except (ConnectionRefusedError, TimeoutError, OSError):
        return False


def find_pid_on_port(port: int) -> int | None:
    """
    Find the PID of the process listening on a given port.
    Tries psutil.net_connections first (fast), then falls back to
    per-process connection enumeration (works without admin on some systems).
    """
    try:
        for conn in psutil.net_connections(kind="tcp"):
            laddr = conn.laddr
            laddr_port = getattr(laddr, "port", None)
            if laddr_port is None and isinstance(laddr, tuple) and len(laddr) >= 2:
                laddr_port = laddr[1]
            if laddr_port == port and conn.status == psutil.CONN_LISTEN:
                return conn.pid
    except (psutil.AccessDenied, PermissionError):
        pass

    # Fallback for restricted environments.
    for proc in psutil.process_iter(["pid"]):
        try:
            for conn in proc.connections(kind="tcp"):
                laddr = conn.laddr
                laddr_port = getattr(laddr, "port", None)
                if laddr_port is None and isinstance(laddr, tuple) and len(laddr) >= 2:
                    laddr_port = laddr[1]
                if laddr_port == port and conn.status == psutil.CONN_LISTEN:
                    return proc.pid
        except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
            continue
    return None


# ── Process management ──────────────────────────────────────


def kill_process_tree(pid: int) -> bool:
    """Kill a process and all its children."""
    try:
        proc = psutil.Process(pid)
        children = proc.children(recursive=True)
        for child in children:
            child.terminate()
        proc.terminate()
        gone, alive = psutil.wait_procs(children + [proc], timeout=5)
        for p in alive:
            p.kill()
        return True
    except (psutil.NoSuchProcess, psutil.AccessDenied):
        return False


# ── Training process scanning ───────────────────────────────


def extract_arg(cmd: str, flag: str) -> str:
    """Extract the value after a CLI flag in a command string.

    Handles both `--flag value` and `--flag=value` forms.
    Uses shlex for proper quote handling.
    """
    try:
        parts = shlex.split(cmd, posix=False)
    except ValueError:
        parts = cmd.split()

    for i, part in enumerate(parts):
        if part == flag and i + 1 < len(parts):
            return parts[i + 1].strip('"').strip("'")
        if part.startswith(f"{flag}="):
            return part.split("=", 1)[1].strip('"').strip("'")
    return ""


def scan_training_processes() -> list:
    """
    Scan running processes for training jobs.

    Looks for:
      - 'accelerate' + 'train_network' in cmdline -> Kohya SS
      - 'musubi' + 'train' in cmdline -> Musubi Tuner

    Returns list of {"pid": int, "tool": str, "cmdline": str, "config_path": str}
    """
    results = []
    for proc in psutil.process_iter(["pid", "cmdline", "create_time"]):
        try:
            cmdline = proc.info.get("cmdline") or []
            cmd = " ".join(cmdline)
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            continue

        if not cmd:
            continue

        cmd_lower = cmd.lower()
        if "accelerate" in cmd_lower and "train_network" in cmd_lower:
            config_path = extract_arg(cmd, "--config_file")
            results.append({
                "pid": proc.pid,
                "tool": "kohya",
                "cmdline": cmd,
                "config_path": config_path,
            })
        elif "musubi" in cmd_lower and "train" in cmd_lower:
            config_path = extract_arg(cmd, "--config_file")
            results.append({
                "pid": proc.pid,
                "tool": "musubi",
                "cmdline": cmd,
                "config_path": config_path,
            })

    return results
