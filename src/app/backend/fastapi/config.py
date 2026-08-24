# ============================================================
# config.py — Central configuration for the FastAPI backend
# ============================================================
# Reads from environment variables (see /.env.example).
# All path helpers and port constants live here.
# ============================================================

import os
import sys
from pathlib import Path
from dotenv import load_dotenv

# Load .env if present (dev convenience)
load_dotenv()

# PyInstaller detection
IS_FROZEN = getattr(sys, "_MEIPASS", None) is not None

# ── Core Paths ────────────────────────────────────────────────

AI_ROOT = Path(os.environ.get("AI_ROOT", r"C:\_AI\_test_fresh_all_AI"))

# Tool installation directories (auto-detected from AI_ROOT)
COMFYUI_PATH = Path(os.environ.get("COMFYUI_PATH", AI_ROOT / "ComfyUI"))
SWARMUI_PATH = Path(os.environ.get("SWARMUI_PATH", AI_ROOT / "SwarmUI"))
KOHYA_PATH = Path(os.environ.get("KOHYA_PATH", AI_ROOT / "kohya_ss"))
MUSUBI_PATH = Path(os.environ.get("MUSUBI_PATH", AI_ROOT / "musubi-tuner"))
MODELS_PATH = AI_ROOT / "models"
TRAINING_DATA_PATH = AI_ROOT / "training_data"

# ── Server Config ─────────────────────────────────────────────

BACKEND_HOST = os.environ.get("BACKEND_HOST", "127.0.0.1")
BACKEND_PORT = int(os.environ.get("BACKEND_PORT", "8000"))

# CORS origins (frontend dev + Tauri dev). Override with CORS_ORIGINS env var
# as a comma-separated list. In frozen/PyInstaller builds the default is
# locked down to Tauri webviews only.
_DEFAULT_CORS_DEV = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:1420",
    "http://127.0.0.1:1420",
    "tauri://localhost",
    "https://tauri.localhost",
]
_DEFAULT_CORS_PROD = [
    "tauri://localhost",
    "https://tauri.localhost",
]
_cors_env = os.environ.get("CORS_ORIGINS", "").strip()
if _cors_env:
    CORS_ORIGINS = [o.strip() for o in _cors_env.split(",") if o.strip()]
else:
    CORS_ORIGINS = _DEFAULT_CORS_PROD if IS_FROZEN else _DEFAULT_CORS_DEV

# ── Service Ports (never change — hardcoded in frontend) ──────

COMFYUI_PORT = 8188
SWARMUI_PORT = 7801
KOHYA_PORT = 7860
MUSUBI_PORT = 7870  # CLI, no web UI
OLLAMA_PORT = 11434
TENSORBOARD_PORT = 6006

# ── API Keys (optional — for AI proxy & backend-proxied APIs) ─

OPENROUTER_API_KEY = os.environ.get("OPENROUTER_API_KEY", "")
GITHUB_TOKEN = os.environ.get("GITHUB_TOKEN", "")
HUGGINGFACE_TOKEN = os.environ.get("HUGGINGFACE_TOKEN", "")
CIVITAI_API_KEY = os.environ.get("CIVITAI_API_KEY", "")

# ── AI Model Default ─────────────────────────────────────────

DEFAULT_AI_MODEL = os.environ.get(
    "DEFAULT_AI_MODEL", "anthropic/claude-sonnet-4-20250514"
)

# ── Logging ───────────────────────────────────────────────────

LOG_LEVEL = os.environ.get("LOG_LEVEL", "info")

# ── BAT File Paths ────────────────────────────────────────────

SETUP_BAT = AI_ROOT / "RTX5090_FULL_SETUP.bat"
PATH_AUDIT_PY = AI_ROOT / "RTX5090_PATH_AUDIT.py"

# ── Service Launch Config ─────────────────────────────────────

SERVICE_CONFIGS = {
    "comfyui": {
        "launch_bat": COMFYUI_PATH / "LAUNCH_ComfyUI.bat",
        "port": COMFYUI_PORT,
        "detect_file": "main.py",
        "path": COMFYUI_PATH,
    },
    "swarmui": {
        "launch_bat": SWARMUI_PATH / "LAUNCH_SwarmUI.bat",
        "port": SWARMUI_PORT,
        "detect_file": "launchtools",
        "path": SWARMUI_PATH,
    },
    "kohya": {
        "launch_bat": KOHYA_PATH / "LAUNCH_Kohya.bat",
        "port": KOHYA_PORT,
        "detect_file": "sdxl_train_network.py",
        "path": KOHYA_PATH,
    },
    "ollama": {
        "cmd": "ollama serve",
        "port": OLLAMA_PORT,
        "path": None,
    },
    "musubi": {
        "port": None,  # CLI-only, no web UI
        "detect_file": "train_network.py",
        "path": MUSUBI_PATH,
    },
}

# ── Cleanup Targets ───────────────────────────────────────────

CLEANUP_TARGETS = [
    {"id": "pip_cache", "name": "pip Cache", "cmd": "pip cache purge"},
    {"id": "pycache", "name": "__pycache__ dirs", "scan_root": AI_ROOT, "pattern": "__pycache__"},
    {"id": "pyc_files", "name": "Stale .pyc files", "scan_root": AI_ROOT, "pattern": "*.pyc"},
    {"id": "hf_cache", "name": "HuggingFace Cache", "path": Path.home() / ".cache" / "huggingface"},
    {"id": "torch_cache", "name": "PyTorch Hub Cache", "path": Path.home() / ".cache" / "torch"},
    {"id": "nvidia_shader", "name": "NVIDIA Shader Cache", "path": Path.home() / "AppData" / "Local" / "NVIDIA" / "GLCache"},
    {"id": "comfyui_temp", "name": "ComfyUI Temp", "path": COMFYUI_PATH / "temp"},
]

# ── Git Repos to Track for Updates ────────────────────────────

REPOS_TO_TRACK = {
    "comfyui": COMFYUI_PATH,
    "swarmui": SWARMUI_PATH,
    "kohya": KOHYA_PATH,
    "musubi": MUSUBI_PATH,
}
