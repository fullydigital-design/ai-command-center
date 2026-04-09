# ============================================================
# routers/system.py - System stats, cleanup, updates, optimizations
# ============================================================

import os
import re
import shutil
import subprocess
import sys
import asyncio
import time
from pathlib import Path
from typing import List

import psutil
from fastapi import APIRouter

from config import AI_ROOT, CLEANUP_TARGETS, MODELS_PATH, REPOS_TO_TRACK
from utils.gpu import get_gpu_stats as _get_gpu_stats

router = APIRouter()


@router.get("/gpu")
async def get_gpu_stats():
    """Return real GPU stats via pynvml."""
    return _get_gpu_stats()


@router.get("/cpu")
async def get_cpu_stats():
    """Return real CPU + RAM stats via psutil."""
    cpu_freq = psutil.cpu_freq()
    vm = psutil.virtual_memory()
    return {
        "usage": psutil.cpu_percent(interval=0.1),
        "frequency": round(cpu_freq.current, 0) if cpu_freq else 0,
        "cores": psutil.cpu_count(logical=False) or 0,
        "threads": psutil.cpu_count(logical=True) or 0,
        "ramTotal": round(vm.total / 1e9, 1),
        "ramUsed": round(vm.used / 1e9, 1),
        "ramPercent": vm.percent,
    }


def _to_float(value, default: float = 0.0) -> float:
    try:
        text = str(value).replace("%", "").replace("W", "").replace("MHz", "").strip()
        return float(text)
    except (TypeError, ValueError):
        return default


def _to_int(value, default: int = 0) -> int:
    try:
        return int(round(_to_float(value, float(default))))
    except (TypeError, ValueError):
        return default


def _format_uptime(seconds: float) -> str:
    total = max(0, int(seconds))
    hours = total // 3600
    minutes = (total % 3600) // 60
    if hours > 0:
        return f"{hours}h {minutes}m"
    return f"{minutes}m"


def _classify_process_type(name: str, cmdline: str) -> str:
    text = f"{name} {cmdline}".lower()
    if any(k in text for k in ("train", "kohya", "tensorboard", "musubi")):
        return "training"
    if any(k in text for k in ("download", "aria2", "wget", "curl")):
        return "download"
    if any(k in text for k in ("comfy", "swarm", "server", "uvicorn", "fastapi", "python")):
        return "server"
    if any(k in text for k in ("render", "diffusion", "invoke")):
        return "generation"
    return "other"


@router.get("/gpu-stats")
async def get_gpu_stats_alias():
    """Frontend compatibility alias: return GPU stats in dashboard shape."""
    base = _get_gpu_stats()
    vram_used = float(base.get("vramUsed", 0.0) or 0.0)
    vram_total = float(base.get("vramTotal", 0.0) or 0.0)
    vram_percent = round((vram_used / vram_total) * 100, 1) if vram_total > 0 else 0.0

    mem_util = _to_int(vram_percent)
    fan_percent = 0
    clock_gpu = 0
    clock_mem = 0
    clock_max_gpu = 0
    clock_max_mem = 0
    pcie_gen = 0
    pcie_width = 0
    driver_version = "N/A"
    cuda_version = "N/A"

    # Pull optional fields from nvidia-smi when available.
    try:
        query = (
            "utilization.memory,fan.speed,clocks.gr,clocks.mem,"
            "clocks.max.gr,clocks.max.mem,pcie.link.gen.current,"
            "pcie.link.width.current,driver_version"
        )
        result = subprocess.run(
            ["nvidia-smi", f"--query-gpu={query}", "--format=csv,noheader,nounits"],
            capture_output=True,
            text=True,
            timeout=5,
        )
        if result.returncode == 0 and result.stdout.strip():
            parts = [p.strip() for p in result.stdout.strip().split(",")]
            if len(parts) >= 1:
                mem_util = _to_int(parts[0], mem_util)
            if len(parts) >= 2:
                fan_percent = _to_int(parts[1], fan_percent)
            if len(parts) >= 3:
                clock_gpu = _to_int(parts[2], clock_gpu)
            if len(parts) >= 4:
                clock_mem = _to_int(parts[3], clock_mem)
            if len(parts) >= 5:
                clock_max_gpu = _to_int(parts[4], clock_max_gpu)
            if len(parts) >= 6:
                clock_max_mem = _to_int(parts[5], clock_max_mem)
            if len(parts) >= 7:
                pcie_gen = _to_int(parts[6], pcie_gen)
            if len(parts) >= 8:
                pcie_width = _to_int(parts[7], pcie_width)
            if len(parts) >= 9 and parts[8]:
                driver_version = parts[8]
    except Exception:
        pass

    try:
        version_result = subprocess.run(
            ["nvidia-smi"],
            capture_output=True,
            text=True,
            timeout=5,
        )
        if version_result.returncode == 0:
            match = re.search(r"CUDA Version:\s*([0-9.]+)", version_result.stdout)
            if match:
                cuda_version = match.group(1)
    except Exception:
        pass

    return {
        "name": str(base.get("name", "Unknown GPU")),
        "vramUsedGB": round(vram_used, 1),
        "vramTotalGB": round(vram_total, 1),
        "vramPercent": vram_percent,
        "gpuUtilPercent": _to_int(base.get("gpuUtilization", 0)),
        "memUtilPercent": mem_util,
        "tempC": _to_int(base.get("temperature", 0)),
        "powerW": _to_int(base.get("powerDraw", 0)),
        "powerLimitW": _to_int(base.get("powerLimit", 575), 575),
        "fanPercent": fan_percent,
        "clockMHz": clock_gpu,
        "clockGpuMHz": clock_gpu,
        "clockMemMHz": clock_mem,
        "clockMaxGpuMHz": clock_max_gpu,
        "clockMaxMemMHz": clock_max_mem,
        "pcieGen": pcie_gen,
        "pcieLinkWidth": pcie_width,
        "driverVersion": driver_version,
        "cudaVersion": cuda_version,
    }


@router.get("/specs")
async def get_system_specs_alias():
    """Frontend compatibility alias: return system specs in card-list shape."""
    cpu_freq = psutil.cpu_freq()
    ram = psutil.virtual_memory()
    drive_root = AI_ROOT.anchor if AI_ROOT.anchor else "C:\\"
    disk = psutil.disk_usage(drive_root)

    gpu = _get_gpu_stats()
    vram_total = float(gpu.get("vramTotal", 0.0) or 0.0)

    return [
        {
            "icon": "Cpu",
            "label": "CPU",
            "value": os.environ.get("PROCESSOR_IDENTIFIER", "Unknown CPU").split(",")[0].strip(),
            "sub": f"{psutil.cpu_count(logical=False) or 0}C/{psutil.cpu_count(logical=True) or 0}T @ {round(cpu_freq.max, 0) if cpu_freq else 0} MHz",
        },
        {
            "icon": "Zap",
            "label": "GPU",
            "value": str(gpu.get("name", "Unknown GPU")),
            "sub": f"{round(vram_total, 1)} GB VRAM",
        },
        {
            "icon": "MemoryStick",
            "label": "RAM",
            "value": f"{round(ram.total / (1024 ** 3), 1)} GB",
            "sub": f"{ram.percent:.1f}% in use",
        },
        {
            "icon": "HardDrive",
            "label": "Storage",
            "value": f"{round(disk.total / (1024 ** 4), 2)} TB",
            "sub": f"{round(disk.free / (1024 ** 3), 1)} GB free on {drive_root}",
        },
        {
            "icon": "Thermometer",
            "label": "Cooling",
            "value": "Monitoring",
            "sub": f"GPU Temp {int(gpu.get('temperature', 0) or 0)}C",
        },
        {
            "icon": "Wifi",
            "label": "Network",
            "value": "Connected",
            "sub": f"Host {os.environ.get('COMPUTERNAME', 'local')}",
        },
    ]


@router.get("/processes")
async def get_processes_alias():
    """Frontend compatibility alias: return active GPU processes list."""
    processes = []
    try:
        result = subprocess.run(
            [
                "nvidia-smi",
                "--query-compute-apps=pid,process_name,used_gpu_memory",
                "--format=csv,noheader,nounits",
            ],
            capture_output=True,
            text=True,
            timeout=5,
        )
        if result.returncode == 0:
            now = time.time()
            for line in (result.stdout or "").strip().splitlines():
                parts = [p.strip() for p in line.split(",")]
                if len(parts) < 3:
                    continue

                pid = _to_int(parts[0], -1)
                if pid < 0:
                    continue

                try:
                    proc = psutil.Process(pid)
                    cmdline = " ".join(proc.cmdline())
                    ram_mb = int(proc.memory_info().rss / (1024 * 1024))
                    cpu_percent = float(proc.cpu_percent(interval=0.0))
                    status = "running" if proc.status() == psutil.STATUS_RUNNING else "idle"
                    uptime = _format_uptime(now - proc.create_time())
                    name = proc.name() or parts[1]
                except Exception:
                    cmdline = ""
                    ram_mb = 0
                    cpu_percent = 0.0
                    status = "running"
                    uptime = "0m"
                    name = parts[1]

                processes.append(
                    {
                        "pid": pid,
                        "name": name,
                        "type": _classify_process_type(name, cmdline),
                        "vramMB": _to_int(parts[2], 0),
                        "ramMB": ram_mb,
                        "cpuPercent": round(cpu_percent, 1),
                        "uptime": uptime,
                        "status": status if status in {"running", "idle", "loading"} else "running",
                    }
                )
    except Exception:
        pass

    processes.sort(key=lambda p: p.get("vramMB", 0), reverse=True)
    return processes


def _dir_size(path: Path) -> int:
    """Recursively compute total size of all files in a directory."""
    if not path.exists():
        return 0
    try:
        return sum(f.stat().st_size for f in path.rglob("*") if f.is_file())
    except (PermissionError, OSError):
        return 0


def _format_size(size_bytes: int) -> str:
    """Format bytes as human-readable string."""
    if size_bytes == 0:
        return "0 B"
    value = float(size_bytes)
    for unit in ("B", "KB", "MB", "GB", "TB"):
        if abs(value) < 1024.0:
            return f"{value:.1f} {unit}"
        value /= 1024.0
    return f"{value:.1f} PB"


def _pip_cache_size() -> tuple[int, str]:
    """Get pip cache size and path. Returns (size_bytes, cache_path)."""
    try:
        result = subprocess.run(
            [sys.executable, "-m", "pip", "cache", "dir"],
            capture_output=True,
            text=True,
            timeout=10,
        )
        cache_dir_raw = (result.stdout or "").strip()
        if result.returncode == 0 and cache_dir_raw:
            cache_dir = Path(cache_dir_raw)
            if cache_dir.is_absolute() and cache_dir.exists():
                return (_dir_size(cache_dir), str(cache_dir))
    except Exception:
        pass

    fallback = Path.home() / "AppData" / "Local" / "pip" / "cache"
    if fallback.exists():
        return (_dir_size(fallback), str(fallback))
    return (0, str(fallback))


def _find_by_pattern(root: Path, pattern: str) -> tuple[int, list[Path]]:
    """Find all files/dirs matching a pattern under root."""
    total = 0
    found: list[Path] = []
    if not root.exists():
        return (0, [])

    try:
        for item in root.rglob(pattern):
            try:
                if item.is_dir():
                    size = _dir_size(item)
                else:
                    size = item.stat().st_size
                total += size
                found.append(item)
            except (PermissionError, OSError):
                continue
    except (PermissionError, OSError):
        pass

    return (total, found)


@router.get("/storage")
async def get_storage_breakdown():
    """Scan model directories and categorize by type."""
    categories = {
        "Checkpoints": {"size": 0, "count": 0},
        "LoRA": {"size": 0, "count": 0},
        "VAE": {"size": 0, "count": 0},
        "ControlNet": {"size": 0, "count": 0},
        "Other": {"size": 0, "count": 0},
    }

    if not MODELS_PATH.exists():
        return _empty_storage()

    for file_path in MODELS_PATH.rglob("*"):
        if not file_path.is_file():
            continue
        try:
            size = file_path.stat().st_size
        except (PermissionError, OSError):
            continue

        parent_lower = file_path.parent.name.lower()
        ext = file_path.suffix.lower()

        if "lora" in parent_lower:
            cat = "LoRA"
        elif "vae" in parent_lower:
            cat = "VAE"
        elif "controlnet" in parent_lower or "control" in parent_lower:
            cat = "ControlNet"
        elif ext in {".safetensors", ".ckpt", ".pt", ".pth"}:
            cat = "Checkpoints"
        else:
            cat = "Other"

        categories[cat]["size"] += size
        categories[cat]["count"] += 1

    total = sum(c["size"] for c in categories.values())

    return {
        "total_gb": round(total / (1024 ** 3), 2),
        "categories": [
            {
                "name": name,
                "size_gb": round(c["size"] / (1024 ** 3), 2),
                "count": c["count"],
            }
            for name, c in categories.items()
        ],
    }


def _empty_storage():
    return {
        "total_gb": 0.0,
        "categories": [
            {"name": name, "size_gb": 0.0, "count": 0}
            for name in ["Checkpoints", "LoRA", "VAE", "ControlNet", "Other"]
        ],
    }


@router.get("/cleanup/scan")
async def scan_cleanup():
    """Scan cache directories and return items with real sizes."""
    results = []

    for target in CLEANUP_TARGETS:
        tid = target["id"]
        name = target["name"]

        if "cmd" in target:
            size_bytes, cache_path = _pip_cache_size()
            results.append(
                {
                    "id": tid,
                    "name": name,
                    "path": cache_path,
                    "size_bytes": int(size_bytes),
                    "size_display": _format_size(int(size_bytes)),
                    "category": "cache",
                }
            )

        elif "scan_root" in target:
            root = Path(target["scan_root"])
            pattern = target["pattern"]
            size_bytes, _ = _find_by_pattern(root, pattern)
            results.append(
                {
                    "id": tid,
                    "name": name,
                    "path": f"{root}/{pattern}",
                    "size_bytes": int(size_bytes),
                    "size_display": _format_size(int(size_bytes)),
                    "category": "cache",
                }
            )

        elif "path" in target:
            p = Path(target["path"])
            size_bytes = _dir_size(p) if p.exists() else 0
            category = "temp" if tid.endswith("temp") else "cache"
            results.append(
                {
                    "id": tid,
                    "name": name,
                    "path": str(p),
                    "size_bytes": int(size_bytes),
                    "size_display": _format_size(int(size_bytes)),
                    "category": category,
                }
            )

    return results


@router.post("/cleanup/execute")
async def execute_cleanup(body: dict):
    """Delete selected cleanup items and return freed bytes."""
    ids = body.get("ids", [])
    freed = 0
    deleted: list[str] = []

    target_map = {t["id"]: t for t in CLEANUP_TARGETS}

    for item_id in ids:
        target = target_map.get(item_id)
        if not target:
            continue

        try:
            if "cmd" in target:
                size_before, cache_path = _pip_cache_size()
                subprocess.run(
                    [sys.executable, "-m", "pip", "cache", "purge"],
                    capture_output=True,
                    timeout=30,
                )
                size_after, _ = _pip_cache_size()
                reclaimed = max(0, int(size_before - size_after))

                # Fallback for environments where pip cache commands are disabled.
                if reclaimed == 0 and size_before > 0 and cache_path:
                    cache_dir = Path(cache_path)
                    try:
                        if cache_dir.exists():
                            shutil.rmtree(cache_dir, ignore_errors=True)
                            reclaimed = int(size_before)
                    except Exception:
                        pass

                freed += reclaimed
                deleted.append(item_id)

            elif "scan_root" in target:
                root = Path(target["scan_root"])
                pattern = target["pattern"]
                _, found_paths = _find_by_pattern(root, pattern)
                for p in found_paths:
                    try:
                        if p.is_dir():
                            size = _dir_size(p)
                            shutil.rmtree(p, ignore_errors=True)
                        else:
                            size = p.stat().st_size
                            p.unlink()
                        freed += int(size)
                    except (PermissionError, OSError):
                        continue
                deleted.append(item_id)

            elif "path" in target:
                p = Path(target["path"])
                if p.exists():
                    if p.is_dir():
                        size = _dir_size(p)
                        shutil.rmtree(p, ignore_errors=True)
                    else:
                        size = p.stat().st_size
                        p.unlink()
                    freed += int(size)
                deleted.append(item_id)

        except Exception:
            continue

    return {"deleted": deleted, "freed_bytes": int(freed)}


@router.get("/cleanup")
async def cleanup_alias():
    """Alias for frontend compatibility."""
    return await scan_cleanup()


@router.post("/cleanup/run")
async def cleanup_run_alias(body: dict):
    """Alias for frontend compatibility."""
    return await execute_cleanup(body)


REPO_NAMES = {
    "comfyui": "ComfyUI",
    "swarmui": "SwarmUI",
    "kohya": "Kohya SS",
    "musubi": "Musubi Tuner",
}


def _git_run(args: list[str], cwd: Path, timeout: int = 30) -> str:
    """Run a git command and return stripped stdout. Returns empty string on failure."""
    try:
        result = subprocess.run(
            ["git"] + args,
            cwd=str(cwd),
            capture_output=True,
            text=True,
            timeout=timeout,
        )
        return result.stdout.strip()
    except (subprocess.TimeoutExpired, FileNotFoundError, OSError):
        return ""


def _check_repo(repo_id: str, repo_path: Path) -> dict:
    """Check a single repo for updates. Returns an UpdateItem dict."""
    name = REPO_NAMES.get(repo_id, repo_id)
    fallback = {
        "id": repo_id,
        "name": name,
        "currentVersion": "not installed",
        "latestVersion": "unknown",
        "hasUpdate": False,
        "commitsBehind": 0,
    }

    if not repo_path.exists() or not (repo_path / ".git").exists():
        return fallback

    local_hash = _git_run(["rev-parse", "HEAD"], cwd=repo_path)
    local_short = _git_run(["rev-parse", "--short", "HEAD"], cwd=repo_path)
    if not local_hash:
        return fallback

    local_tag = _git_run(["describe", "--tags", "--exact-match", "HEAD"], cwd=repo_path)
    current_version = local_tag if local_tag else local_short

    # Keep timeout short so endpoint stays responsive when offline.
    _git_run(["fetch", "--quiet"], cwd=repo_path, timeout=5)

    upstream = _git_run(["rev-parse", "--abbrev-ref", "@{upstream}"], cwd=repo_path)
    if not upstream:
        for branch in ("origin/main", "origin/master"):
            test = _git_run(["rev-parse", branch], cwd=repo_path)
            if test:
                upstream = branch
                break

    if not upstream:
        return {
            **fallback,
            "currentVersion": current_version,
        }

    remote_hash = _git_run(["rev-parse", upstream], cwd=repo_path)
    remote_short = _git_run(["rev-parse", "--short", upstream], cwd=repo_path)
    remote_tag = _git_run(["describe", "--tags", "--exact-match", upstream], cwd=repo_path)
    latest_version = remote_tag if remote_tag else remote_short

    commits_behind = 0
    if local_hash and remote_hash and local_hash != remote_hash:
        count_str = _git_run(["rev-list", "--count", f"{local_hash}..{remote_hash}"], cwd=repo_path)
        try:
            commits_behind = int(count_str)
        except (ValueError, TypeError):
            commits_behind = 0

    has_update = local_hash != remote_hash and commits_behind > 0
    return {
        "id": repo_id,
        "name": name,
        "currentVersion": current_version if current_version else "unknown",
        "latestVersion": latest_version if latest_version else "unknown",
        "hasUpdate": has_update,
        "commitsBehind": commits_behind,
    }


@router.get("/updates/check")
async def check_updates():
    """Compare local HEAD vs remote HEAD for all tracked repos."""
    tasks = [
        asyncio.to_thread(_check_repo, repo_id, repo_path)
        for repo_id, repo_path in REPOS_TO_TRACK.items()
    ]
    results = await asyncio.gather(*tasks)
    return list(results)


@router.post("/updates/run/{software_id}")
async def run_update(software_id: str):
    """Run git pull for a specific repo."""
    repo_path = REPOS_TO_TRACK.get(software_id)
    name = REPO_NAMES.get(software_id, software_id)

    if not repo_path:
        return {"id": software_id, "status": "error", "message": f"Unknown software: {software_id}"}

    if not repo_path.exists() or not (repo_path / ".git").exists():
        return {
            "id": software_id,
            "status": "error",
            "message": f"{name} is not installed or not a git repo",
        }

    try:
        result = subprocess.run(
            ["git", "pull"],
            cwd=str(repo_path),
            capture_output=True,
            text=True,
            timeout=120,
        )
        if result.returncode == 0:
            output = (result.stdout or "").strip()
            if "already up to date" in output.lower():
                return {
                    "id": software_id,
                    "status": "current",
                    "message": f"{name} is already up to date",
                }
            return {
                "id": software_id,
                "status": "updated",
                "message": f"{name} updated successfully",
            }

        error = (result.stderr or "").strip()
        return {
            "id": software_id,
            "status": "error",
            "message": f"git pull failed: {error[:200]}",
        }
    except subprocess.TimeoutExpired:
        return {"id": software_id, "status": "error", "message": f"git pull timed out for {name}"}
    except Exception as e:
        return {"id": software_id, "status": "error", "message": str(e)[:200]}


OPTIMIZATIONS = [
    {
        "id": "tf32",
        "group": "GPU",
        "name": "Enable TF32 for RTX 5090",
        "description": "Sets NVIDIA_TF32_OVERRIDE=1 for faster matrix ops on Ampere+ GPUs",
        "env_key": "NVIDIA_TF32_OVERRIDE",
        "env_value": "1",
        "command": 'setx NVIDIA_TF32_OVERRIDE "1"',
    },
    {
        "id": "cuda_malloc",
        "group": "GPU",
        "name": "CUDA Memory Allocator",
        "description": "Expandable segments + GC threshold for less OOM errors",
        "env_key": "PYTORCH_CUDA_ALLOC_CONF",
        "env_value": "expandable_segments:True,garbage_collection_threshold:0.8",
        "command": 'setx PYTORCH_CUDA_ALLOC_CONF "expandable_segments:True,garbage_collection_threshold:0.8"',
    },
    {
        "id": "hf_transfer",
        "group": "AI Stack",
        "name": "Fast HuggingFace Downloads",
        "description": "Enables hf_transfer for 5-10x faster model downloads",
        "env_key": "HF_HUB_ENABLE_HF_TRANSFER",
        "env_value": "1",
        "command": 'setx HF_HUB_ENABLE_HF_TRANSFER "1"',
    },
    {
        "id": "hf_home",
        "group": "AI Stack",
        "name": "HuggingFace Cache Directory",
        "description": "Sets HF_HOME to a known location for shared model cache",
        "env_key": "HF_HOME",
        "env_value": "",
        "command": 'setx HF_HOME "C:\\_AI\\hf_cache"',
    },
    {
        "id": "cuda_visible",
        "group": "GPU",
        "name": "GPU Device Selection",
        "description": "CUDA_VISIBLE_DEVICES=0 for stable single-GPU workflows",
        "env_key": "CUDA_VISIBLE_DEVICES",
        "env_value": "0",
        "command": 'setx CUDA_VISIBLE_DEVICES "0"',
    },
    {
        "id": "triton_cache",
        "group": "System",
        "name": "Triton Cache Directory",
        "description": "Sets TRITON_CACHE_DIR to avoid polluting AppData",
        "env_key": "TRITON_CACHE_DIR",
        "env_value": "",
        "command": 'setx TRITON_CACHE_DIR "C:\\_AI\\triton_cache"',
    },
]


def _extract_setx_value(command: str) -> str:
    """Extract value from command like: setx KEY \"VALUE\"."""
    parts = command.split('"')
    if len(parts) >= 2:
        return parts[1]
    return ""


@router.get("/optimizations")
async def get_optimizations():
    """Check env vars and return optimization status."""
    results = []
    for opt in OPTIMIZATIONS:
        env_key = opt["env_key"]
        current_value = os.environ.get(env_key, "")
        expected = opt["env_value"]

        if expected:
            applied = current_value == expected
        else:
            applied = bool(current_value)

        results.append(
            {
                "id": opt["id"],
                "group": opt["group"],
                "name": opt["name"],
                "description": opt["description"],
                "applied": applied,
                "command": opt["command"],
            }
        )

    return results


@router.post("/optimize/{optimization_id}")
async def apply_optimization(optimization_id: str):
    """Apply a specific optimization via setx."""
    opt = next((o for o in OPTIMIZATIONS if o["id"] == optimization_id), None)
    if not opt:
        return {
            "id": optimization_id,
            "applied": False,
            "message": f"Unknown optimization: {optimization_id}",
        }

    env_key = opt["env_key"]
    env_value = opt["env_value"] or _extract_setx_value(opt["command"])
    if not env_value:
        return {
            "id": optimization_id,
            "applied": False,
            "message": "No value to set",
        }

    try:
        result = subprocess.run(
            ["setx", env_key, env_value],
            capture_output=True,
            text=True,
            timeout=10,
        )
        if result.returncode == 0:
            os.environ[env_key] = env_value
            return {
                "id": optimization_id,
                "applied": True,
                "message": f"Set {env_key}={env_value}",
            }
        error = (result.stderr or "").strip() or (result.stdout or "").strip()
        return {
            "id": optimization_id,
            "applied": False,
            "message": f"setx failed: {error[:200]}",
        }
    except FileNotFoundError:
        os.environ[env_key] = env_value
        return {
            "id": optimization_id,
            "applied": True,
            "message": f"Set {env_key} in process (setx not available)",
        }
    except subprocess.TimeoutExpired:
        return {
            "id": optimization_id,
            "applied": False,
            "message": "setx timed out",
        }
    except Exception as e:
        return {
            "id": optimization_id,
            "applied": False,
            "message": str(e)[:200],
        }
