# ============================================================
# routers/services.py - Service health checks + start/stop
# ============================================================

import os
import socket
import subprocess

import psutil
from fastapi import APIRouter

from config import SERVICE_CONFIGS

router = APIRouter()

SERVICE_NAMES = {
    "comfyui": "ComfyUI",
    "swarmui": "SwarmUI",
    "kohya": "Kohya SS",
    "ollama": "Ollama",
    "musubi": "Musubi Tuner",
}


def _check_port(host: str, port: int, timeout: float = 0.1) -> bool:
    """Check if a TCP port is listening."""
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return True
    except (ConnectionRefusedError, TimeoutError, OSError):
        return False


def _find_pid_on_port(port: int) -> int | None:
    """Find the PID of the process listening on a given port."""
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


@router.get("/status")
async def get_services_status():
    """Check which services are running by TCP port scan + PID lookup."""
    results = []

    for sid, cfg in SERVICE_CONFIGS.items():
        port = cfg.get("port")
        name = SERVICE_NAMES.get(sid, sid)

        # CLI-only services without a listening port.
        if not port:
            results.append(
                {
                    "id": sid,
                    "name": name,
                    "running": False,
                    "port": 0,
                }
            )
            continue

        running = _check_port("127.0.0.1", int(port))
        entry = {
            "id": sid,
            "name": name,
            "running": running,
            "port": int(port),
        }

        if running:
            entry["url"] = f"http://127.0.0.1:{int(port)}"
            pid = _find_pid_on_port(int(port))
            if pid:
                entry["pid"] = pid

        results.append(entry)

    return results


@router.post("/{service_id}/start")
async def start_service(service_id: str):
    """Start a service using its configured launcher."""
    cfg = SERVICE_CONFIGS.get(service_id)
    if not cfg:
        return {"message": f"Unknown service: {service_id}", "service_id": service_id}

    name = SERVICE_NAMES.get(service_id, service_id)
    port = cfg.get("port")

    # Do not launch duplicates if service is already up.
    if port and _check_port("127.0.0.1", int(port)):
        return {
            "message": f"{name} is already running on port {int(port)}",
            "service_id": service_id,
        }

    launch_bat = cfg.get("launch_bat")
    cmd_str = cfg.get("cmd")

    if launch_bat:
        bat_path = str(launch_bat)
        if not os.path.isfile(bat_path):
            return {"message": f"Launch script not found: {bat_path}", "service_id": service_id}

        cwd_value = cfg.get("path")
        cwd = str(cwd_value) if cwd_value else "."

        flags = 0
        if os.name == "nt":
            flags |= getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0)
            flags |= getattr(subprocess, "CREATE_NEW_CONSOLE", 0)

        try:
            subprocess.Popen(
                f'cmd /c "{bat_path}"',
                shell=True,
                cwd=cwd,
                creationflags=flags,
            )
            return {
                "message": f"{name} starting via {os.path.basename(bat_path)}",
                "service_id": service_id,
            }
        except Exception as e:
            return {"message": f"Failed to start {name}: {e}", "service_id": service_id}

    if cmd_str:
        flags = 0
        if os.name == "nt":
            flags |= getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0)
            flags |= getattr(subprocess, "CREATE_NEW_CONSOLE", 0)

        try:
            subprocess.Popen(
                str(cmd_str),
                shell=True,
                creationflags=flags,
            )
            return {
                "message": f"{name} starting via: {cmd_str}",
                "service_id": service_id,
            }
        except Exception as e:
            return {"message": f"Failed to start {name}: {e}", "service_id": service_id}

    return {"message": f"No launch method configured for {name}", "service_id": service_id}


@router.post("/{service_id}/stop")
async def stop_service(service_id: str):
    """Stop a service by killing the process on its port."""
    cfg = SERVICE_CONFIGS.get(service_id)
    if not cfg:
        return {"message": f"Unknown service: {service_id}", "service_id": service_id}

    name = SERVICE_NAMES.get(service_id, service_id)
    port = cfg.get("port")

    if not port:
        return {"message": f"{name} has no port - cannot stop", "service_id": service_id}

    port = int(port)
    if not _check_port("127.0.0.1", port):
        return {"message": f"{name} is not running", "service_id": service_id}

    pid = _find_pid_on_port(port)
    if not pid:
        return {
            "message": f"{name} is running on port {port} but PID not found (may need admin)",
            "service_id": service_id,
        }

    try:
        if os.name == "nt":
            result = subprocess.run(
                ["taskkill", "/F", "/PID", str(pid), "/T"],
                capture_output=True,
                text=True,
                timeout=10,
            )
            if result.returncode == 0:
                return {"message": f"{name} stopped (PID {pid})", "service_id": service_id}

            proc = psutil.Process(pid)
            proc.terminate()
            return {"message": f"{name} terminated (PID {pid})", "service_id": service_id}

        proc = psutil.Process(pid)
        proc.terminate()
        return {"message": f"{name} terminated (PID {pid})", "service_id": service_id}
    except Exception as e:
        return {"message": f"Failed to stop {name}: {e}", "service_id": service_id}
