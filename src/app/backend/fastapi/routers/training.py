# ============================================================
# routers/training.py - Training job detection + loss history
# ============================================================

import logging
import os
import time
from datetime import datetime
from pathlib import Path
from typing import List

import psutil
from fastapi import APIRouter

try:
    import tomllib
except ModuleNotFoundError:
    import tomli as tomllib

from config import AI_ROOT, KOHYA_PORT, MUSUBI_PORT
from utils.gpu import get_gpu_stats
from utils.processes import check_port, extract_arg

logger = logging.getLogger("ai_command_center.training")

router = APIRouter()


def _is_safe_config_path(config_path: str) -> bool:
    """Ensure the TOML config path resolves under AI_ROOT to prevent traversal."""
    if not config_path:
        return False
    try:
        resolved = Path(config_path).resolve()
        root = AI_ROOT.resolve()
        return resolved.is_file() and resolved.is_relative_to(root)
    except (OSError, ValueError):
        return False



def _detect_training_type(config: dict, tool: str) -> str:
    """Detect training type from TOML config."""
    network_module = str(config.get("network_module", ""))

    if tool == "musubi":
        return "musubi-video"

    if not network_module:
        return "kohya-dreambooth"

    nm_lower = network_module.lower()
    if "lora_flux" in nm_lower:
        return "kohya-lora"
    if "lora_wan" in nm_lower:
        return "musubi-video"
    if "lora" in nm_lower:
        res = str(config.get("resolution", ""))
        if "1024" in res or config.get("cache_text_encoder_outputs"):
            return "kohya-sdxl"
        return "kohya-lora"

    return "kohya-lora"


def _read_tb_loss(log_dir: str) -> list:
    """Read loss scalars from TensorBoard event files using tbparse."""
    try:
        from tbparse import SummaryReader

        reader = SummaryReader(log_dir)
        scalars = reader.scalars
        if scalars.empty:
            return []

        loss_df = scalars[scalars.tag.str.contains("loss", case=False, na=False)]
        if loss_df.empty:
            return []

        rows = [
            {"step": int(row.step), "loss": round(float(row.value), 6)}
            for _, row in loss_df.iterrows()
        ]
        rows.sort(key=lambda item: item["step"])
        return rows
    except Exception:
        return []


def _build_job_from_toml(config_path: str, tool: str, process) -> dict | None:
    """Build a TrainingJob dict from a TOML config file + process info."""
    if not _is_safe_config_path(config_path):
        logger.warning("Rejected TOML path outside AI_ROOT: %s", config_path)
        return None
    try:
        with open(config_path, "rb") as f:
            config = tomllib.load(f)
    except Exception as e:
        logger.exception("Failed to parse TOML config %s: %s", config_path, e)
        return None

    training_type = _detect_training_type(config, tool)

    resolution = config.get("resolution", "unknown")
    if isinstance(resolution, (list, tuple)):
        resolution = "x".join(str(r) for r in resolution)
    resolution = str(resolution)

    model_path = str(config.get("pretrained_model_name_or_path", "") or "")
    model_name = os.path.basename(model_path) if model_path else "unknown"

    train_data = str(config.get("train_data_dir", config.get("dataset_config", "")) or "")
    dataset_name = os.path.basename(train_data) if train_data else "unknown"

    dataset_size = 0
    train_dir = str(config.get("train_data_dir", "") or "")
    if train_dir and os.path.isdir(train_dir):
        try:
            dataset_size = sum(
                1
                for file_name in os.listdir(train_dir)
                if os.path.isfile(os.path.join(train_dir, file_name))
            )
        except OSError:
            dataset_size = 0

    log_dir = str(config.get("logging_dir", "") or "")
    loss_history = []
    current_loss = 0.0
    current_step = 0

    if log_dir and os.path.exists(log_dir):
        loss_history = _read_tb_loss(log_dir)
        if loss_history:
            current_loss = float(loss_history[-1].get("loss", 0.0))
            current_step = int(loss_history[-1].get("step", 0))

    total_steps_raw = config.get("max_train_steps", 0)
    total_epochs_raw = config.get("max_train_epochs", 0)
    try:
        total_steps = int(total_steps_raw or 0)
    except (TypeError, ValueError):
        total_steps = 0
    try:
        total_epochs = int(total_epochs_raw or 0)
    except (TypeError, ValueError):
        total_epochs = 0

    progress = 0.0
    if total_steps > 0:
        progress = min(round(current_step / total_steps * 100, 1), 100.0)

    gpu = get_gpu_stats()

    eta = "calculating..."
    try:
        elapsed = time.time() - process.create_time()
        if current_step > 0 and total_steps > 0 and elapsed > 0:
            steps_remaining = max(total_steps - current_step, 0)
            sec_per_step = elapsed / current_step
            eta_seconds = int(steps_remaining * sec_per_step)
            hours, remainder = divmod(eta_seconds, 3600)
            minutes, seconds = divmod(remainder, 60)
            eta = f"{hours}h {minutes}m" if hours > 0 else f"{minutes}m {seconds}s"
    except Exception:
        pass

    lr_raw = config.get("learning_rate", 0)
    try:
        lr_float = float(lr_raw)
        # Format as scientific notation string to match TS type (e.g. "1e-4")
        learning_rate = f"{lr_float:.0e}" if lr_float > 0 else "0"
    except (TypeError, ValueError):
        learning_rate = "0"

    batch_raw = config.get("train_batch_size", 1)
    try:
        batch_size = int(batch_raw)
    except (TypeError, ValueError):
        batch_size = 1

    try:
        start_time = datetime.fromtimestamp(process.create_time()).isoformat()
    except Exception:
        start_time = ""

    # Calculate epoch from step progress and total epochs
    epoch = 0
    if total_epochs > 0 and total_steps > 0 and current_step > 0:
        epoch = min(total_epochs, int((current_step / total_steps) * total_epochs) + 1)

    return {
        "id": str(process.pid),
        "name": str(config.get("output_name", "Unknown")),
        "type": training_type,
        "tool": tool,
        "status": "running",
        "progress": progress,
        "epoch": epoch,
        "totalEpochs": total_epochs,
        "currentStep": current_step,
        "totalSteps": total_steps,
        "loss": current_loss,
        "learningRate": learning_rate,
        "batchSize": batch_size,
        "resolution": resolution,
        "model": model_name,
        "dataset": dataset_name,
        "datasetSize": dataset_size,
        "outputPath": str(config.get("output_dir", "") or ""),
        "configPath": config_path,
        "tensorboardLogDir": log_dir,
        "lossHistory": loss_history,
        "startTime": start_time,
        "eta": eta,
        "gpuUsage": gpu.get("gpuUtilization", 0),
        "vramUsage": gpu.get("vramUsed", 0),
        "pid": process.pid,
    }



@router.get("/jobs")
async def get_training_jobs():
    """Scan running processes for active training jobs."""
    jobs: List[dict] = []

    for proc in psutil.process_iter(["pid", "cmdline", "create_time"]):
        try:
            cmdline = proc.info.get("cmdline") or []
            cmd = " ".join(cmdline)
            cmd_lower = cmd.lower()
        except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
            continue

        if not cmd:
            continue

        config_path = None
        tool = None

        if "accelerate" in cmd_lower and "train_network" in cmd_lower:
            config_path = extract_arg(cmd, "--config_file")
            tool = "kohya"
        elif "musubi" in cmd_lower and "train" in cmd_lower:
            config_path = extract_arg(cmd, "--config_file")
            tool = "musubi"

        if tool and config_path and _is_safe_config_path(config_path):
            job = _build_job_from_toml(config_path, tool, proc)
            if job:
                jobs.append(job)

    return jobs


@router.get("/jobs/{job_id}/loss")
async def get_full_loss_history(job_id: str):
    """Read full TensorBoard loss history for a specific job (by PID)."""
    try:
        proc = psutil.Process(int(job_id))
        cmdline = proc.cmdline()
        cmd = " ".join(cmdline)
        config_path = extract_arg(cmd, "--config_file")

        if config_path and _is_safe_config_path(config_path):
            with open(config_path, "rb") as f:
                config = tomllib.load(f)
            log_dir = str(config.get("logging_dir", "") or "")
            if log_dir and os.path.exists(log_dir):
                return _read_tb_loss(log_dir)
    except (psutil.NoSuchProcess, psutil.AccessDenied, ValueError):
        pass
    except Exception as e:
        logger.exception("Failed to read loss history for job %s: %s", job_id, e)

    return []


@router.get("/services")
async def get_training_service_health():
    """Check if Kohya and Musubi services are reachable."""
    return [
        {
            "id": "kohya",
            "name": "Kohya SS",
            "running": check_port("127.0.0.1", KOHYA_PORT),
            "port": KOHYA_PORT,
        },
        {
            "id": "musubi",
            "name": "Musubi Tuner",
            "running": check_port("127.0.0.1", MUSUBI_PORT),
            "port": MUSUBI_PORT,
        },
    ]


@router.get("/gpu")
async def get_training_gpu():
    """Return GPU stats in the GpuStats shape expected by TrainingPage.

    Response shape matches TS GpuStats:
      {name, gpuUtilization, vramUsed, vramTotal, temperature, powerDraw, powerLimit}
    """
    return get_gpu_stats()


@router.get("/poll")
async def poll_training_updates():
    """Polling endpoint — returns the same data as /jobs.

    Frontend calls this every N seconds for real-time updates.
    """
    return await get_training_jobs()
