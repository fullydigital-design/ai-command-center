"""
build_backend.py - Build the FastAPI backend into a standalone .exe
using PyInstaller, for Tauri sidecar distribution.

Run from: C:\\_AI\\_AI_Console
Command:  python build_backend.py

Output:   src-tauri\\binaries\\fastapi-backend-x86_64-pc-windows-msvc.exe
"""

import importlib.util
import subprocess
import sys
from pathlib import Path

# -- Paths ----------------------------------------------------
PROJECT_ROOT = Path(__file__).parent
BACKEND_DIR = PROJECT_ROOT / "src" / "app" / "backend" / "fastapi"
TAURI_BIN = PROJECT_ROOT / "src-tauri" / "binaries"
OUTPUT_NAME = "fastapi-backend"
TARGET_TRIPLE = "x86_64-pc-windows-msvc"
FINAL_NAME = f"{OUTPUT_NAME}-{TARGET_TRIPLE}.exe"

# -- Ensure output dir exists --------------------------------
TAURI_BIN.mkdir(parents=True, exist_ok=True)

# -- Collect hidden imports ----------------------------------
# PyInstaller cannot auto-detect some imports used by FastAPI/uvicorn.
HIDDEN_IMPORTS = [
    "uvicorn",
    "uvicorn.logging",
    "uvicorn.loops",
    "uvicorn.loops.auto",
    "uvicorn.protocols",
    "uvicorn.protocols.http",
    "uvicorn.protocols.http.auto",
    "uvicorn.protocols.websockets",
    "uvicorn.protocols.websockets.auto",
    "uvicorn.lifespan",
    "uvicorn.lifespan.on",
    "fastapi",
    "pydantic",
    "starlette",
    "starlette.routing",
    "starlette.responses",
    "starlette.middleware",
    "starlette.middleware.cors",
    "pynvml",
    "psutil",
    "dotenv",
    "tbparse",
    "toml",
    "httpx",
]

hidden_args = []
for imp in HIDDEN_IMPORTS:
    if importlib.util.find_spec(imp) is not None:
        hidden_args.extend(["--hidden-import", imp])
    else:
        print(f"[build_backend] Skipping missing hidden import: {imp}")

# Include local packages/files used by main.py
data_args = [
    "--add-data",
    f"{BACKEND_DIR / 'routers'};routers",
    "--add-data",
    f"{BACKEND_DIR / 'utils'};utils",
    "--add-data",
    f"{BACKEND_DIR / 'config.py'};.",
]

cmd = [
    sys.executable,
    "-m",
    "PyInstaller",
    "--onefile",
    "--name",
    OUTPUT_NAME,
    "--distpath",
    str(TAURI_BIN),
    "--workpath",
    str(PROJECT_ROOT / "build" / "pyinstaller"),
    "--specpath",
    str(PROJECT_ROOT / "build"),
    "--paths",
    str(BACKEND_DIR),
    "--clean",
    "--noconfirm",
    *hidden_args,
    *data_args,
    str(BACKEND_DIR / "main.py"),
]

# Remove stale output and failed temporary resource files before building.
for stale in TAURI_BIN.glob("RCX*.tmp"):
    try:
        stale.unlink()
    except OSError:
        pass

stale_output = TAURI_BIN / f"{OUTPUT_NAME}.exe"
if stale_output.exists():
    try:
        stale_output.unlink()
    except OSError:
        print(f"[build_backend] WARNING: Could not remove stale output: {stale_output}")

print("[build_backend] Running PyInstaller...")
print(f"[build_backend] Command: {' '.join(cmd[:10])}...")
result = subprocess.run(cmd, cwd=str(PROJECT_ROOT))

if result.returncode != 0:
    print(f"[build_backend] FAILED with code {result.returncode}")
    sys.exit(1)

src = TAURI_BIN / f"{OUTPUT_NAME}.exe"
dst = TAURI_BIN / FINAL_NAME

if src.exists():
    if dst.exists():
        dst.unlink()
    src.rename(dst)
    print(f"[build_backend] SUCCESS: {dst}")
    print(f"[build_backend] Size: {dst.stat().st_size / 1024 / 1024:.1f} MB")
else:
    print(f"[build_backend] ERROR: Expected output not found at {src}")
    sys.exit(1)
