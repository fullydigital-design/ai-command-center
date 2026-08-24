# ============================================================
# routers/services.py - Service health checks + start/stop
# ============================================================

import logging
import os
import shlex
import subprocess

from fastapi import APIRouter, HTTPException

from config import SERVICE_CONFIGS
from utils.processes import check_port, find_pid_on_port, kill_process_tree

logger = logging.getLogger("ai_command_center.services")

router = APIRouter()

SERVICE_NAMES = {
    "comfyui": "ComfyUI",
    "swarmui": "SwarmUI",
    "kohya": "Kohya SS",
    "ollama": "Ollama",
    "musubi": "Musubi Tuner",
}


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

        running = check_port("127.0.0.1", int(port))
        entry = {
            "id": sid,
            "name": name,
            "running": running,
            "port": int(port),
        }

        if running:
            entry["url"] = f"http://127.0.0.1:{int(port)}"
            pid = find_pid_on_port(int(port))
            if pid:
                entry["pid"] = pid

        results.append(entry)

    return results


@router.post("/{service_id}/start")
async def start_service(service_id: str):
    """Start a service using its configured launcher."""
    cfg = SERVICE_CONFIGS.get(service_id)
    if not cfg:
        raise HTTPException(status_code=404, detail=f"Unknown service: {service_id}")

    name = SERVICE_NAMES.get(service_id, service_id)
    port = cfg.get("port")

    # Do not launch duplicates if service is already up.
    if port and check_port("127.0.0.1", int(port)):
        return {
            "message": f"{name} is already running on port {int(port)}",
            "service_id": service_id,
        }

    launch_bat = cfg.get("launch_bat")
    cmd_str = cfg.get("cmd")

    if launch_bat:
        bat_path = str(launch_bat)
        if not os.path.isfile(bat_path):
            raise HTTPException(status_code=404, detail=f"Launch script not found: {bat_path}")

        cwd_value = cfg.get("path")
        cwd = str(cwd_value) if cwd_value else "."

        flags = 0
        if os.name == "nt":
            flags |= getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0)
            flags |= getattr(subprocess, "CREATE_NEW_CONSOLE", 0)

        try:
            subprocess.Popen(
                ["cmd", "/c", bat_path],
                shell=False,
                cwd=cwd,
                creationflags=flags,
            )
            return {
                "message": f"{name} starting via {os.path.basename(bat_path)}",
                "service_id": service_id,
            }
        except Exception as e:
            logger.exception("Failed to start %s", name)
            raise HTTPException(status_code=500, detail=f"Failed to start {name}: {e}")

    if cmd_str:
        flags = 0
        if os.name == "nt":
            flags |= getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0)
            flags |= getattr(subprocess, "CREATE_NEW_CONSOLE", 0)

        try:
            # cmd_str is expected as a list from config; fall back to shlex.split for legacy string form
            if isinstance(cmd_str, (list, tuple)):
                argv = [str(a) for a in cmd_str]
            else:
                argv = shlex.split(str(cmd_str), posix=(os.name != "nt"))
            subprocess.Popen(
                argv,
                shell=False,
                creationflags=flags,
            )
            return {
                "message": f"{name} starting via: {cmd_str}",
                "service_id": service_id,
            }
        except Exception as e:
            logger.exception("Failed to start %s", name)
            raise HTTPException(status_code=500, detail=f"Failed to start {name}: {e}")

    raise HTTPException(status_code=400, detail=f"No launch method configured for {name}")


@router.post("/{service_id}/stop")
async def stop_service(service_id: str):
    """Stop a service by killing the process on its port."""
    cfg = SERVICE_CONFIGS.get(service_id)
    if not cfg:
        raise HTTPException(status_code=404, detail=f"Unknown service: {service_id}")

    name = SERVICE_NAMES.get(service_id, service_id)
    port = cfg.get("port")

    if not port:
        raise HTTPException(status_code=400, detail=f"{name} has no port - cannot stop")

    port = int(port)
    if not check_port("127.0.0.1", port):
        return {"message": f"{name} is not running", "service_id": service_id}

    pid = find_pid_on_port(port)
    if not pid:
        return {
            "message": f"{name} is running on port {port} but PID not found (may need admin)",
            "service_id": service_id,
        }

    killed = kill_process_tree(pid)
    if killed:
        logger.info("Stopped %s (PID %d)", name, pid)
        return {"message": f"{name} stopped (PID {pid})", "service_id": service_id}

    return {"message": f"Failed to stop {name} (PID {pid})", "service_id": service_id}
