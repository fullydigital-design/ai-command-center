# AI Command Center -- BAT File Integration Guide

> How the FastAPI backend wraps RTX5090_FULL_SETUP.bat for the web UI.

---

## Overview

The `RTX5090_FULL_SETUP.bat` is a 3000+ line interactive script with 16 menu options.
The backend wraps it so the React UI can trigger actions and stream output.

**The BAT stays untouched.** The backend sends keystrokes to its stdin and reads stdout.

---

## BAT Menu Options -> Backend Actions

| Menu | BAT Label | Backend Action ID | What It Does |
|------|-----------|-------------------|-------------- |
| `1` | Full Setup | `full_setup` | System + all apps + cleanup |
| `2` | ComfyUI | `install_comfyui` | Clone/update ComfyUI |
| `3` | SwarmUI | `install_swarmui` | Clone/update SwarmUI |
| `4` | Kohya SS | `install_kohya` | Clone/update Kohya SS |
| `5` | Musubi Tuner | `install_musubi` | Clone/update Musubi Tuner |
| `6` | System Only | `system_setup` | Drivers, Python, packages |
| `7` | Custom Nodes | `nodes_models` | ComfyUI custom nodes + models |
| `8` | Update ALL | `update_all` | Quick git pull all repos |
| `9` | Cleanup | `cleanup` | Temp files, caches, __pycache__ |
| `0` | Diagnostics | `diagnostics` | System summary |
| `C` | ComfyUI Reset | `comfy_reset` | Clean custom nodes |
| `S` | Model Audit | `model_audit` | Verify shared model links |
| `R` | Full Reset | `full_reset` | Remove apps (soft/hard/nuclear) |
| `P` | PATH Cleanup | `path_cleanup` | Fix PATH + env vars |

---

## Implementation: SSE Streaming from BAT

```python
# routers/setup.py

import asyncio
import subprocess
from fastapi import APIRouter
from sse_starlette.sse import EventSourceResponse

router = APIRouter()

# Track running processes
_running_processes = {}

@router.post("/run")
async def run_setup(body: dict):
    """Start a BAT action. Returns a stream_id for SSE."""
    action = body["action"]  # e.g. "cleanup", "update_all"
    menu_key = ACTION_TO_KEY[action]
    stream_id = f"setup-{action}-{int(time.time())}"

    bat_path = os.path.join(AI_ROOT, "RTX5090_FULL_SETUP.bat")

    # Launch BAT with stdin piped so we can send menu choices
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

    # Send the menu choice
    proc.stdin.write(f"{menu_key}\n")
    proc.stdin.flush()

    _running_processes[stream_id] = proc
    return {"stream_id": stream_id}


@router.get("/stream")
async def stream_output(stream_id: str):
    """SSE endpoint — streams BAT stdout line by line."""

    async def event_generator():
        proc = _running_processes.get(stream_id)
        if not proc:
            yield {"event": "error", "data": "No such process"}
            return

        while True:
            line = await asyncio.to_thread(proc.stdout.readline)
            if not line and proc.poll() is not None:
                break
            if line:
                yield {
                    "event": "output",
                    "data": json.dumps({
                        "text": line.rstrip(),
                        "timestamp": datetime.now().isoformat(),
                    })
                }

        exit_code = proc.returncode
        yield {
            "event": "done",
            "data": json.dumps({"exitCode": exit_code})
        }
        _running_processes.pop(stream_id, None)

    return EventSourceResponse(event_generator())


ACTION_TO_KEY = {
    "full_setup": "1",
    "install_comfyui": "2",
    "install_swarmui": "3",
    "install_kohya": "4",
    "install_musubi": "5",
    "system_setup": "6",
    "nodes_models": "7",
    "update_all": "8",
    "cleanup": "9",
    "diagnostics": "0",
    "comfy_reset": "C",
    "model_audit": "S",
    "full_reset": "R",
    "path_cleanup": "P",
}
```

---

## Frontend SSE Consumer (already built)

The `TerminalOutput` component at `src/app/components/ui/TerminalOutput.tsx` accepts:

```typescript
interface TerminalOutputProps {
  lines: TerminalLine[];       // Array of { text, type, timestamp }
  title?: string;              // Terminal header
  running?: boolean;           // Show spinner
  onClose?: () => void;        // Dismiss button
  onStop?: () => void;         // Stop button
  maxHeight?: number;          // Scroll height (default 400)
  variant?: "inline" | "panel"; // Display mode
  animated?: boolean;          // Animate lines appearing
}
```

The `setupService.ts` already has:

```typescript
export function connectToSetupStream(
  streamId: string,
  onLine: (line: TerminalLine) => void,
  onDone: (exitCode: number) => void
): () => void {
  const es = new EventSource(`${getApiBase()}/setup/stream?stream_id=${streamId}`);
  es.addEventListener("output", (e) => {
    const data = JSON.parse(e.data);
    onLine(classifyLine(data.text));
  });
  es.addEventListener("done", (e) => {
    const data = JSON.parse(e.data);
    onDone(data.exitCode);
    es.close();
  });
  return () => es.close();
}
```

And `classifyLine()` parses BAT output to colorize it:
- `[OK]` -> green
- `[WARN]` -> yellow
- `[ERROR]` -> red
- `[INSTALL]` / `[AUTO-INSTALL]` -> cyan
- Progress bars -> dimmed

---

## Install Detection (no BAT needed)

The `detectInstalls()` function can be implemented purely in Python:

```python
@router.get("/detect")
async def detect_installs():
    return {
        "comfyui": os.path.exists(os.path.join(AI_ROOT, "ComfyUI", "main.py")),
        "swarmui": os.path.exists(os.path.join(AI_ROOT, "SwarmUI", "launchtools")),
        "kohya": (
            os.path.exists(os.path.join(AI_ROOT, "kohya_ss", "sdxl_train_network.py"))
            or os.path.exists(os.path.join(AI_ROOT, "kohya_ss", "sd-scripts", "sdxl_train_network.py"))
        ),
        "musubi": (
            os.path.exists(os.path.join(AI_ROOT, "musubi-tuner", "train_network.py"))
            or os.path.exists(os.path.join(AI_ROOT, "musubi-tuner", ".git"))
        ),
    }
```

This mirrors the BAT's `:detect_installs` subroutine (line 135-146).

---

## PATH Audit (Python script wrapper)

The `RTX5090_PATH_AUDIT.py` can be called directly:

```python
@router.get("/audit/path")
async def path_audit():
    """Run PATH audit and return structured results."""
    script = os.path.join(AI_ROOT, "RTX5090_PATH_AUDIT.py")
    result = subprocess.run(
        [sys.executable, script, "3.12", "--json"],  # Add --json flag to the script
        capture_output=True, text=True, timeout=30
    )
    return json.loads(result.stdout)
```

> **Note:** You'll need to add a `--json` flag to `RTX5090_PATH_AUDIT.py` that outputs
> structured JSON instead of colored terminal text. The script already has all the logic;
> it just needs a JSON output mode.

---

## Launcher BAT Files

The main BAT generates launcher scripts for each app:

| Launcher | Location | Generated By |
|----------|----------|-------------|
| `LAUNCH_ComfyUI.bat` | `ComfyUI/LAUNCH_ComfyUI.bat` | `:create_comfyui_launcher` (line 1379) |
| `LAUNCH_SwarmUI.bat` | `SwarmUI/LAUNCH_SwarmUI.bat` | `:create_swarmui_launcher` |
| `LAUNCH_Kohya.bat` | `kohya_ss/LAUNCH_Kohya.bat` | `:create_kohya_launcher` (line 2383) |
| `LAUNCH_Musubi.bat` | `musubi-tuner/LAUNCH_Musubi.bat` | `:create_musubi_launcher` |

These launchers include:
- VRAM-optimized environment variables
- Performance flags auto-selected by VRAM profile (Low/Medium/High/Ultra)
- Update options (launch, update+launch, update only)

**The backend should use these launchers** for starting services, not raw python commands,
because they set critical env vars like `PYTORCH_CUDA_ALLOC_CONF` and performance flags.

---

## Multi-Step BAT Actions

Some BAT actions need multiple menu inputs (e.g., Full Reset asks for confirmation):

```python
# For multi-step actions, send inputs sequentially:
async def run_full_reset(level="soft"):
    proc = start_bat()
    proc.stdin.write("R\n")  # Menu: Full Reset
    proc.stdin.flush()
    await asyncio.sleep(1)

    if level == "soft":
        proc.stdin.write("1\n")  # Sub-menu: Soft Reset
        proc.stdin.flush()
        await asyncio.sleep(0.5)
        proc.stdin.write("RESET\n")  # Confirmation
    elif level == "hard":
        proc.stdin.write("2\n")
        proc.stdin.flush()
        await asyncio.sleep(0.5)
        proc.stdin.write("HARDRESET\n")

    proc.stdin.flush()
```

---

## Environment Variables Set by BAT

The BAT sets these system-wide (via `setx /M`):

| Variable | Value | Purpose |
|----------|-------|---------|
| `CUDA_HOME` | `C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA\v12.8` | CUDA toolkit path |
| `CUDA_PATH` | Same as CUDA_HOME | Alias |
| `NVIDIA_TF32_OVERRIDE` | `1` | Enable TF32 for Blackwell |
| `PYTORCH_CUDA_ALLOC_CONF` | `expandable_segments:True,garbage_collection_threshold:0.8` | Prevent CUDA OOM |

The launchers set these per-session (via `set`):

| Variable | Value | Purpose |
|----------|-------|---------|
| `CUDA_MODULE_LOADING` | `LAZY` | Faster cold startup |
| `HF_HUB_ENABLE_HF_TRANSFER` | `1` | Fast HuggingFace downloads |
| `TORCH_CUDNN_V8_API_ENABLED` | `1` | Newer cuDNN API |
