# ============================================================
# utils/processes.py — psutil helpers for process management
# ============================================================
# Shared process scanning and management utilities.
#
# TODO for Cursor:
#   - Uncomment the real psutil calls
#   - Add error handling for AccessDenied / NoSuchProcess
# ============================================================

# import psutil


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
    # TODO: Uncomment real implementation
    # return {
    #     "usage": psutil.cpu_percent(interval=0.1),
    #     "frequency": psutil.cpu_freq().current if psutil.cpu_freq() else 0,
    #     "cores": psutil.cpu_count(logical=False),
    #     "threads": psutil.cpu_count(logical=True),
    #     "ramTotal": round(psutil.virtual_memory().total / 1e9, 1),
    #     "ramUsed": round(psutil.virtual_memory().used / 1e9, 1),
    #     "ramPercent": psutil.virtual_memory().percent,
    # }

    return {
        "usage": 0.0,
        "frequency": 0,
        "cores": 16,
        "threads": 32,
        "ramTotal": 86.0,
        "ramUsed": 0.0,
        "ramPercent": 0.0,
    }


def find_process_by_port(port: int) -> dict | None:
    """
    Find a process listening on the given port.
    Returns {"pid": int, "name": str} or None.
    """
    # TODO: Uncomment real implementation
    # for conn in psutil.net_connections(kind='inet'):
    #     if conn.laddr.port == port and conn.status == 'LISTEN':
    #         try:
    #             proc = psutil.Process(conn.pid)
    #             return {"pid": proc.pid, "name": proc.name()}
    #         except (psutil.NoSuchProcess, psutil.AccessDenied):
    #             pass
    return None


def is_port_in_use(port: int) -> bool:
    """Check if a port is in use (faster than find_process_by_port)."""
    # TODO: Uncomment real implementation
    # import socket
    # try:
    #     s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    #     s.settimeout(1)
    #     s.connect(("127.0.0.1", port))
    #     s.close()
    #     return True
    # except:
    #     return False
    return False


def kill_process_tree(pid: int) -> bool:
    """Kill a process and all its children."""
    # TODO: Uncomment real implementation
    # try:
    #     proc = psutil.Process(pid)
    #     children = proc.children(recursive=True)
    #     for child in children:
    #         child.terminate()
    #     proc.terminate()
    #     # Wait for termination
    #     gone, alive = psutil.wait_procs(children + [proc], timeout=5)
    #     for p in alive:
    #         p.kill()  # Force kill survivors
    #     return True
    # except (psutil.NoSuchProcess, psutil.AccessDenied):
    #     return False
    return False


def scan_training_processes() -> list:
    """
    Scan running processes for training jobs.

    Looks for:
      - 'accelerate' + 'train_network' in cmdline → Kohya SS
      - 'musubi' + 'train' in cmdline → Musubi Tuner

    Returns list of {"pid": int, "tool": str, "cmdline": str, "config_path": str}
    """
    # TODO: Uncomment real implementation
    # results = []
    # for proc in psutil.process_iter(['pid', 'cmdline', 'create_time']):
    #     try:
    #         cmd = ' '.join(proc.info['cmdline'] or [])
    #     except (psutil.NoSuchProcess, psutil.AccessDenied):
    #         continue
    #
    #     if 'accelerate' in cmd and 'train_network' in cmd:
    #         config_path = _extract_arg(cmd, '--config_file')
    #         results.append({"pid": proc.pid, "tool": "kohya", "cmdline": cmd, "config_path": config_path})
    #
    #     elif 'musubi' in cmd and 'train' in cmd:
    #         config_path = _extract_arg(cmd, '--config_file')
    #         results.append({"pid": proc.pid, "tool": "musubi", "cmdline": cmd, "config_path": config_path})
    #
    # return results
    return []


def _extract_arg(cmd: str, flag: str) -> str:
    """Extract the value after a CLI flag."""
    parts = cmd.split()
    for i, part in enumerate(parts):
        if part == flag and i + 1 < len(parts):
            return parts[i + 1].strip('"').strip("'")
    return ""
