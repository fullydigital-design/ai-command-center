"""
Build script - packages the FastAPI backend into a single .exe
for Tauri sidecar bundling.

Usage:
    cd C:\_AI\_AI_Console\src\app\backend\fastapi
    .\venv\Scripts\python.exe build_backend.py
"""

import platform

import PyInstaller.__main__


TARGET_TRIPLE = {
    ("Windows", "AMD64"): "x86_64-pc-windows-msvc",
    ("Windows", "x86"): "i686-pc-windows-msvc",
}.get((platform.system(), platform.machine()), "x86_64-pc-windows-msvc")


PyInstaller.__main__.run(
    [
        "main.py",
        "--onefile",
        "--name",
        f"fastapi-backend-{TARGET_TRIPLE}",
        "--add-data",
        "config.py;.",
        "--add-data",
        "routers;routers",
        "--add-data",
        "utils;utils",
        "--hidden-import",
        "uvicorn.logging",
        "--hidden-import",
        "uvicorn.protocols.http",
        "--hidden-import",
        "uvicorn.protocols.http.auto",
        "--hidden-import",
        "uvicorn.protocols.websockets",
        "--hidden-import",
        "uvicorn.protocols.websockets.auto",
        "--hidden-import",
        "uvicorn.lifespan",
        "--hidden-import",
        "uvicorn.lifespan.on",
        "--hidden-import",
        "pynvml",
        "--hidden-import",
        "psutil",
        "--hidden-import",
        "aiohttp",
        "--hidden-import",
        "aiofiles",
        "--hidden-import",
        "sse_starlette",
        "--hidden-import",
        "tbparse",
        "--hidden-import",
        "tomli",
        "--hidden-import",
        "dotenv",
        "--console",
        "--noconfirm",
    ]
)
