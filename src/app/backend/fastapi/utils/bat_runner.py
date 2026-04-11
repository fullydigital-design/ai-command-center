# ============================================================
# utils/bat_runner.py — BAT subprocess + SSE streaming helpers
# ============================================================
# Wraps RTX5090_FULL_SETUP.bat execution with stdin piping
# and stdout streaming for the TerminalOutput component.
#
# See /src/app/docs/BAT_INTEGRATION.md for full details.
# ============================================================

import subprocess
import time
from datetime import datetime
from pathlib import Path


def classify_line(text: str) -> dict:
    """
    Classify a BAT output line for terminal colorization.
    Matches the frontend's classifyLine() in setupService.ts.

    Returns: {"text": str, "type": str, "timestamp": str}
    """
    text = text.rstrip()
    ts = datetime.now().isoformat()

    if "[OK]" in text or "[SUCCESS]" in text:
        return {"text": text, "type": "success", "timestamp": ts}
    elif "[WARN]" in text or "[WARNING]" in text:
        return {"text": text, "type": "warning", "timestamp": ts}
    elif "[ERROR]" in text or "[FAIL]" in text:
        return {"text": text, "type": "error", "timestamp": ts}
    elif "[INSTALL]" in text or "[AUTO-INSTALL]" in text:
        return {"text": text, "type": "info", "timestamp": ts}
    elif text.startswith("====") or text.startswith("----"):
        return {"text": text, "type": "separator", "timestamp": ts}
    else:
        return {"text": text, "type": "output", "timestamp": ts}


def launch_bat(bat_path: Path, menu_key: str):
    """
    Launch the BAT file and send a menu keystroke.
    Returns the subprocess.Popen handle.
    """
    proc = subprocess.Popen(
        f'cmd /c "{bat_path}"',
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        shell=True,
        creationflags=subprocess.CREATE_NEW_PROCESS_GROUP,
        text=True,
        bufsize=1,
    )
    proc.stdin.write(f"{menu_key}\n")
    proc.stdin.flush()
    return proc


def launch_bat_multistep(bat_path: Path, keystrokes: list[tuple[str, float]]):
    """
    Launch BAT and send multiple keystrokes with delays.
    Used for multi-step actions (e.g., Full Reset -> confirmation).

    Args:
        bat_path: Path to the BAT file
        keystrokes: List of (key, delay_seconds) tuples

    Example:
        launch_bat_multistep(bat, [("R", 1.0), ("1", 0.5), ("RESET", 0)])
    """
    proc = subprocess.Popen(
        f'cmd /c "{bat_path}"',
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        shell=True,
        creationflags=subprocess.CREATE_NEW_PROCESS_GROUP,
        text=True,
        bufsize=1,
    )
    for key, delay in keystrokes:
        proc.stdin.write(f"{key}\n")
        proc.stdin.flush()
        if delay > 0:
            time.sleep(delay)
    return proc
