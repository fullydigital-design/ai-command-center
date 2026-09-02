# ============================================================
# main.py - FastAPI entry point for AI Command Center backend
# ============================================================
# Start with:
#   uvicorn main:app --host 127.0.0.1 --port 8000 --reload
#
# Health check:
#   curl http://127.0.0.1:8000/api/health
# ============================================================

import os
import sys
import threading
import time

# -- PyInstaller support --------------------------------------
# When running as a PyInstaller onefile bundle, sys._MEIPASS is the
# temp extraction directory. Add it to sys.path so local imports work.
if getattr(sys, "_MEIPASS", None):
    sys.path.insert(0, sys._MEIPASS)
    # Keep relative imports and local resource lookups consistent.
    os.chdir(sys._MEIPASS)

import logging

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import AI_ROOT, BACKEND_PORT, CORS_ORIGINS, LOG_LEVEL

# ── Logging setup ────────────────────────────────────────────
logging.basicConfig(
    level=getattr(logging, LOG_LEVEL.upper(), logging.INFO),
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("ai_command_center")
from routers import ai_proxy, services, setup, system, tensorboard, training
from routers.setup import cleanup_processes
from routers.tensorboard import shutdown as tensorboard_shutdown
from utils.gpu import shutdown as gpu_shutdown

app = FastAPI(
    title="AI Command Center Backend",
    version="0.1.0",
    description="FastAPI backend for the AI/CGI Pipeline Command Center dashboard",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(system.router, prefix="/api/system", tags=["system"])
app.include_router(training.router, prefix="/api/training", tags=["training"])
app.include_router(tensorboard.router, prefix="/api/tensorboard", tags=["tensorboard"])
app.include_router(services.router, prefix="/api/services", tags=["services"])
app.include_router(setup.router, prefix="/api/setup", tags=["setup"])
app.include_router(ai_proxy.router, prefix="/api/ai", tags=["ai"])


@app.get("/api/health")
async def health():
    """Health check endpoint used by frontend + Tauri sidecar detector."""
    return {
        "status": "ok",
        "ai_root": str(AI_ROOT),
        "version": "0.1.0",
    }


def _start_parent_watchdog() -> None:
    """Exit the sidecar when the desktop app dies, even on force-kill.

    Tauri kills the child gracefully on normal exit (RunEvent::Exit), but a
    crashed or taskkill-ed app bypasses that path. The app passes its own PID
    via --app-pid; a daemon thread watches it and hard-exits this process when
    it disappears — the sidecar must never outlive the app.
    """
    parent_pid = os.environ.get("AI_PARENT_PID", "")
    if not parent_pid.isdigit():
        return
    import psutil

    def _watch() -> None:
        try:
            parent = psutil.Process(int(parent_pid))
        except psutil.NoSuchProcess:
            return
        while parent.is_running():
            time.sleep(2)
        logger.warning("Desktop app died — stopping sidecar")
        cleanup_processes()
        os._exit(0)

    threading.Thread(target=_watch, name="ai-parent-watchdog", daemon=True).start()


@app.on_event("startup")
async def startup():
    logger.info("Backend starting on port %d", BACKEND_PORT)
    logger.info("AI_ROOT = %s", AI_ROOT)
    logger.info("Log level = %s", LOG_LEVEL)
    # Reap any zombie BAT processes from a previous unclean shutdown.
    cleanup_processes()
    _start_parent_watchdog()


@app.on_event("shutdown")
async def shutdown():
    logger.info("Backend shutting down")
    gpu_shutdown()
    tensorboard_shutdown()
    cleanup_processes()


# -- Direct execution (PyInstaller / standalone) --------------
if __name__ == "__main__":
    host = "127.0.0.1"
    port = 8000

    args = sys.argv[1:]
    for i, arg in enumerate(args):
        if arg == "--host" and i + 1 < len(args):
            host = args[i + 1]
        elif arg == "--port" and i + 1 < len(args):
            try:
                port = int(args[i + 1])
            except ValueError:
                port = BACKEND_PORT
        elif arg == "--app-pid" and i + 1 < len(args):
            os.environ["AI_PARENT_PID"] = args[i + 1]

    logger.info("Starting standalone on %s:%d", host, port)
    uvicorn.run(app, host=host, port=port)