# ============================================================
# utils/gpu.py - pynvml wrapper for GPU stats
# ============================================================

import logging

import pynvml

logger = logging.getLogger("ai_command_center.gpu")

_initialized = False
_handle = None


def _fallback_stats() -> dict:
    return {
        "name": "GPU not detected",
        "gpuUtilization": 0,
        "vramUsed": 0.0,
        "vramTotal": 0.0,
        "temperature": 0,
        "powerDraw": 0,
        "powerLimit": 0,
    }


def _ensure_init():
    """Initialize pynvml once. Call before any GPU query."""
    global _initialized, _handle
    if _initialized:
        return
    try:
        pynvml.nvmlInit()
        _handle = pynvml.nvmlDeviceGetHandleByIndex(0)
        _initialized = True
    except pynvml.NVMLError as e:
        logger.warning("pynvml init failed: %s", e)
        _initialized = False
        _handle = None


def get_gpu_stats() -> dict:
    """
    Get GPU utilization, VRAM, temperature, and power stats.

    Returns dict matching GpuStats type from src/app/services/types.ts.
    """
    _ensure_init()

    if not _initialized or not _handle:
        return _fallback_stats()

    try:
        util = pynvml.nvmlDeviceGetUtilizationRates(_handle)
        mem = pynvml.nvmlDeviceGetMemoryInfo(_handle)
        temp = pynvml.nvmlDeviceGetTemperature(_handle, pynvml.NVML_TEMPERATURE_GPU)
        power = pynvml.nvmlDeviceGetPowerUsage(_handle) / 1000  # mW -> W
        limit = pynvml.nvmlDeviceGetPowerManagementLimit(_handle) / 1000  # mW -> W
        name = pynvml.nvmlDeviceGetName(_handle)
        if isinstance(name, bytes):
            name = name.decode("utf-8", errors="replace")

        return {
            "name": str(name),
            "gpuUtilization": int(util.gpu),
            "vramUsed": round(mem.used / 1e9, 1),
            "vramTotal": round(mem.total / 1e9, 1),
            "temperature": int(temp),
            "powerDraw": round(power),
            "powerLimit": round(limit),
        }
    except pynvml.NVMLError as e:
        logger.warning("nvml query failed: %s", e)
        return _fallback_stats()


def shutdown():
    """Call on app shutdown to clean up pynvml."""
    global _initialized, _handle
    if _initialized:
        try:
            pynvml.nvmlShutdown()
        except pynvml.NVMLError as e:
            logger.warning("nvml shutdown failed: %s", e)
        finally:
            _initialized = False
            _handle = None
