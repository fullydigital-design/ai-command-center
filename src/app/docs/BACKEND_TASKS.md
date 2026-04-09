# AI Command Center -- Backend Implementation Tasks

> Ordered by priority. Each task is self-contained. Frontend needs ZERO changes.
> 9 tasks total. Tasks 1-3 are HIGH priority (core features). Tasks 4-8 are MEDIUM/LOW.
> Task 9 (AI Proxy) is optional -- AI features already work client-side via OpenRouter.

---

## Prerequisites

```bash
# 1. Create backend folder at AI root (next to the BAT)
mkdir C:\_AI\_test_fresh_all_AI\backend
cd C:\_AI\_test_fresh_all_AI\backend

# 2. Create venv
python -m venv venv
venv\Scripts\activate

# 3. Install dependencies
pip install -r requirements.txt

# 4. Run the server
uvicorn main:app --host 127.0.0.1 --port 8420 --reload
```

### requirements.txt

```
fastapi==0.115.0
uvicorn[standard]==0.32.0
psutil==6.1.0
pynvml==11.5.0
requests==2.32.0
aiohttp==3.11.0
aiofiles==24.1.0
sse-starlette==2.2.1
tbparse==0.0.8
tomli==2.2.1
```

### main.py skeleton

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import os

AI_ROOT = os.environ.get("AI_ROOT", r"C:\_AI\_test_fresh_all_AI")

app = FastAPI(title="AI Command Center Backend", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173",
                   "http://localhost:1420", "http://127.0.0.1:1420"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Import routers
from routers import system, training, services, setup, tensorboard

app.include_router(system.router, prefix="/api/system", tags=["system"])
app.include_router(training.router, prefix="/api/training", tags=["training"])
app.include_router(services.router, prefix="/api/services", tags=["services"])
app.include_router(setup.router, prefix="/api/setup", tags=["setup"])
app.include_router(tensorboard.router, prefix="/api/tensorboard", tags=["tensorboard"])

@app.get("/api/health")
async def health():
    return {"status": "ok", "ai_root": AI_ROOT}
```

---

## Backend Folder Structure

```
C:\_AI\_test_fresh_all_AI\backend\
+-- main.py                  # FastAPI entry (see skeleton above)
+-- requirements.txt         # Python dependencies
+-- config.py                # AI_ROOT, port constants, paths
+-- routers/
|   +-- __init__.py
|   +-- system.py            # Tasks 1, 5, 6, 8
|   +-- training.py          # Task 2
|   +-- tensorboard.py       # Task 3
|   +-- services.py          # Task 4
|   +-- setup.py             # Task 7
|   +-- ai_proxy.py          # Task 9 (optional)
+-- utils/
    +-- __init__.py
    +-- gpu.py               # pynvml wrapper
    +-- processes.py          # psutil helpers
    +-- bat_runner.py         # BAT subprocess + SSE streaming
```

---

## TASK 1: System Stats (GPU + CPU + RAM)

**Priority:** HIGH -- Command Center Overview polls this every 2 seconds.
**File:** `routers/system.py`
**Frontend consumer:** `CommandCenter.tsx` (Overview tab)

```python
# GET /api/system/gpu
# Returns: { name, gpuUtilization, vramUsed, vramTotal, temperature, powerDraw, powerLimit }

import pynvml

pynvml.nvmlInit()
handle = pynvml.nvmlDeviceGetHandleByIndex(0)

def get_gpu_stats():
    util = pynvml.nvmlDeviceGetUtilizationRates(handle)
    mem = pynvml.nvmlDeviceGetMemoryInfo(handle)
    temp = pynvml.nvmlDeviceGetTemperature(handle, pynvml.NVML_TEMPERATURE_GPU)
    power = pynvml.nvmlDeviceGetPowerUsage(handle) / 1000  # mW -> W
    limit = pynvml.nvmlDeviceGetPowerManagementLimit(handle) / 1000
    name = pynvml.nvmlDeviceGetName(handle)

    return {
        "name": name,
        "gpuUtilization": util.gpu,
        "vramUsed": round(mem.used / 1e9, 1),
        "vramTotal": round(mem.total / 1e9, 1),
        "temperature": temp,
        "powerDraw": round(power),
        "powerLimit": round(limit),
    }
```

```python
# GET /api/system/cpu
# Returns: { usage, frequency, cores, threads, temperature }

import psutil

def get_cpu_stats():
    return {
        "usage": psutil.cpu_percent(interval=0.1),
        "frequency": psutil.cpu_freq().current if psutil.cpu_freq() else 0,
        "cores": psutil.cpu_count(logical=False),
        "threads": psutil.cpu_count(logical=True),
        "ramTotal": round(psutil.virtual_memory().total / 1e9, 1),
        "ramUsed": round(psutil.virtual_memory().used / 1e9, 1),
        "ramPercent": psutil.virtual_memory().percent,
    }
```

**Match the frontend type** (from `types.ts`):
```typescript
interface GpuStats {
  name: string;           // "NVIDIA GeForce RTX 5090"
  gpuUtilization: number; // 0-100
  vramUsed: number;       // GB
  vramTotal: number;      // GB
  temperature: number;    // Celsius
  powerDraw: number;      // W
  powerLimit: number;     // W
}
```

---

## TASK 2: Training Job Detection

**Priority:** HIGH -- Training page is the core feature.
**File:** `routers/training.py`
**Frontend consumer:** `TrainingPage.tsx`

### How to detect running training jobs:

```python
import psutil
import tomli
from tbparse import SummaryReader

def scan_training_jobs():
    jobs = []
    for proc in psutil.process_iter(['pid', 'cmdline', 'create_time']):
        try:
            cmd = ' '.join(proc.info['cmdline'] or [])
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            continue

        # Kohya SS: runs via accelerate
        if 'accelerate' in cmd and 'train_network' in cmd:
            config_path = extract_arg(cmd, '--config_file')
            if config_path:
                job = build_job_from_toml(config_path, 'kohya', proc)
                jobs.append(job)

        # Musubi Tuner: runs via python directly
        elif 'musubi' in cmd and 'train' in cmd:
            config_path = extract_arg(cmd, '--config_file')
            if config_path:
                job = build_job_from_toml(config_path, 'musubi', proc)
                jobs.append(job)

    return jobs

def build_job_from_toml(config_path, tool, process):
    """Read TOML config and TensorBoard logs to build a TrainingJob."""
    with open(config_path, 'rb') as f:
        config = tomli.load(f)

    # Read loss from TensorBoard
    log_dir = config.get('logging_dir', '')
    loss_history = []
    current_loss = 0.0
    if log_dir and os.path.exists(log_dir):
        reader = SummaryReader(log_dir)
        scalars = reader.scalars
        loss_df = scalars[scalars.tag.str.contains('loss', case=False)]
        loss_history = [
            {"step": int(row.step), "loss": float(row.value)}
            for _, row in loss_df.iterrows()
        ]
        if loss_history:
            current_loss = loss_history[-1]['loss']

    return {
        "id": str(process.pid),
        "name": config.get('output_name', 'Unknown'),
        "type": detect_type(config, tool),
        "tool": tool,
        "status": "running",
        "progress": calc_progress(config, loss_history),
        # ... fill remaining fields from config + process
        "configPath": config_path,
        "tensorboardLogDir": log_dir,
        "lossHistory": loss_history,
    }
```

### Key TOML config fields to extract:

| TOML Key | TrainingJob Field |
|----------|------------------|
| `output_name` | `name` |
| `pretrained_model_name_or_path` | `model` (basename) |
| `train_data_dir` | `dataset` (basename) |
| `resolution` | `resolution` |
| `train_batch_size` | `batchSize` |
| `max_train_epochs` | `totalEpochs` |
| `max_train_steps` | `totalSteps` |
| `learning_rate` | `learningRate` |
| `output_dir` | `outputPath` |
| `logging_dir` | `tensorboardLogDir` |

---

## TASK 3: TensorBoard Launcher

**Priority:** HIGH -- just added to the UI.
**File:** `routers/tensorboard.py`
**Frontend consumer:** `TrainingPage.tsx` (TensorBoardButton + TensorBoardPanel)

```python
import subprocess
import psutil

_tb_process = None  # Track the launched TensorBoard process

@router.get("/status")
async def tb_status():
    global _tb_process
    if _tb_process and _tb_process.poll() is None:
        return {"running": True, "pid": _tb_process.pid, "logdir": _tb_logdir}
    # Also check if TensorBoard is running from elsewhere
    for proc in psutil.process_iter(['pid', 'cmdline']):
        try:
            cmd = ' '.join(proc.info['cmdline'] or [])
            if 'tensorboard' in cmd and '--logdir' in cmd:
                logdir = extract_arg(cmd, '--logdir')
                return {"running": True, "pid": proc.pid, "logdir": logdir}
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            continue
    return {"running": False}

@router.post("/launch")
async def tb_launch(body: dict):
    global _tb_process, _tb_logdir
    logdir = body["logdir"]
    port = body.get("port", 6006)

    # Kill existing if any
    if _tb_process and _tb_process.poll() is None:
        _tb_process.terminate()

    _tb_logdir = logdir
    _tb_process = subprocess.Popen(
        f'tensorboard --logdir "{logdir}" --port {port} --bind_all',
        shell=True,
        creationflags=subprocess.CREATE_NEW_PROCESS_GROUP,
    )
    return {"message": f"TensorBoard launched on port {port}", "pid": _tb_process.pid}

@router.post("/stop")
async def tb_stop():
    global _tb_process
    if _tb_process and _tb_process.poll() is None:
        _tb_process.terminate()
        _tb_process = None
        return {"message": "TensorBoard stopped"}
    # Try to find and kill any TensorBoard process
    for proc in psutil.process_iter(['pid', 'cmdline']):
        try:
            cmd = ' '.join(proc.info['cmdline'] or [])
            if 'tensorboard' in cmd:
                proc.terminate()
                return {"message": f"TensorBoard (PID {proc.pid}) stopped"}
        except:
            pass
    return {"message": "No TensorBoard process found"}
```

---

## TASK 4: Service Health + Start/Stop

**Priority:** MEDIUM -- Command Center Services tab already does browser-native health checks.
**File:** `routers/services.py`
**Frontend consumer:** `ServicesPanel.tsx` (embedded in CommandCenter Services tab)

The Services tab already pings services directly from the browser. The backend adds:
- **Start:** Launch service via `subprocess.Popen()` using the LAUNCH_*.bat scripts
- **Stop:** Kill process by PID (`taskkill /F /PID <pid> /T`)
- **Status:** More reliable port scanning + process name detection

### Service launch commands (from BAT):

```python
SERVICE_CONFIGS = {
    "comfyui": {
        "launch_bat": os.path.join(AI_ROOT, "ComfyUI", "LAUNCH_ComfyUI.bat"),
        "port": 8188,
        "detect_file": "main.py",
    },
    "swarmui": {
        "launch_bat": os.path.join(AI_ROOT, "SwarmUI", "LAUNCH_SwarmUI.bat"),
        "port": 7801,
        "detect_file": "launchtools",
    },
    "kohya": {
        "launch_bat": os.path.join(AI_ROOT, "kohya_ss", "LAUNCH_Kohya.bat"),
        "port": 7860,
        "detect_file": "sdxl_train_network.py",
    },
    "ollama": {
        "cmd": "ollama serve",
        "port": 11434,
    },
    "musubi": {
        # CLI-only, no web UI -- launched via training commands
        "port": None,
        "detect_file": "train_network.py",
    },
}
```

**Important:** The LAUNCH_*.bat files are auto-generated by RTX5090_FULL_SETUP.bat.
They include VRAM-optimized launch args. Always use these launchers, not raw python commands.

---

## TASK 5: System Cleanup

**Priority:** MEDIUM -- Command Center Cleanup tab.
**File:** `routers/system.py` (or `routers/cleanup.py`)
**Frontend consumer:** `CommandCenter.tsx` (Cleanup tab)

### What the BAT cleans (phase_cleanup, line 2810):

```python
CLEANUP_TARGETS = [
    # From the BAT's :phase_cleanup
    {"id": "pip_cache", "name": "pip Cache", "cmd": "pip cache purge"},
    {"id": "pycache", "name": "__pycache__ dirs", "scan": "recursive __pycache__ in AI_ROOT"},
    {"id": "temp_files", "name": "Temp Files", "path": os.environ.get("TEMP")},
    {"id": "pyc_files", "name": "Stale .pyc files", "scan": "recursive *.pyc in AI_ROOT"},

    # Additional targets from SystemPage UI
    {"id": "hf_cache", "name": "HuggingFace Cache", "path": "~/.cache/huggingface"},
    {"id": "torch_cache", "name": "PyTorch Hub Cache", "path": "~/.cache/torch"},
    {"id": "nvidia_shader", "name": "NVIDIA Shader Cache", "path": "~/AppData/Local/NVIDIA/GLCache"},
    {"id": "comfyui_temp", "name": "ComfyUI Temp", "path": os.path.join(AI_ROOT, "ComfyUI", "temp")},
]
```

### Duplicate model detection (SystemPage Cleanup tab):

```python
import hashlib

def find_duplicate_models():
    """Scan models/ for files with identical SHA256 hashes."""
    hashes = {}
    for root, dirs, files in os.walk(os.path.join(AI_ROOT, "models")):
        for f in files:
            if f.endswith(('.safetensors', '.ckpt', '.pt', '.bin', '.gguf')):
                path = os.path.join(root, f)
                h = hash_file(path)
                hashes.setdefault(h, []).append(path)
    return {h: paths for h, paths in hashes.items() if len(paths) > 1}

def hash_file(path, chunk_size=65536):
    """SHA256 hash of first 64KB (fast approximate check for large models)."""
    sha = hashlib.sha256()
    with open(path, 'rb') as f:
        sha.update(f.read(chunk_size))
    return sha.hexdigest()
```

---

## TASK 6: Software Update Tracking

**Priority:** LOW -- Command Center Updates tab.
**File:** `routers/system.py`
**Frontend consumer:** `CommandCenter.tsx` (Updates tab)

```python
import subprocess

def check_repo_update(path):
    """Compare local HEAD vs remote HEAD."""
    try:
        # Fetch remote without merging
        subprocess.run(["git", "fetch", "--quiet"], cwd=path, timeout=10)
        local = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=path, text=True).strip()
        remote = subprocess.check_output(["git", "rev-parse", "@{u}"], cwd=path, text=True).strip()
        behind = subprocess.check_output(
            ["git", "rev-list", "--count", f"HEAD..@{{u}}"], cwd=path, text=True
        ).strip()
        return {
            "hasUpdate": local != remote,
            "commitsBehind": int(behind),
            "localHash": local[:8],
            "remoteHash": remote[:8],
        }
    except Exception as e:
        return {"hasUpdate": False, "error": str(e)}

REPOS_TO_TRACK = {
    "comfyui": os.path.join(AI_ROOT, "ComfyUI"),
    "swarmui": os.path.join(AI_ROOT, "SwarmUI"),
    "kohya": os.path.join(AI_ROOT, "kohya_ss"),
    "musubi": os.path.join(AI_ROOT, "musubi-tuner"),
}
```

---

## TASK 7: BAT Wrapper (SSE Streaming)

**Priority:** LOW -- Setup/install terminal output.
**File:** `routers/setup.py`
**Frontend consumer:** `ServicesPanel.tsx` + `CommandCenter.tsx` (via `TerminalOutput` component)

See `BAT_INTEGRATION.md` for detailed implementation.

---

## TASK 8: Optimization Tweaks

**Priority:** LOW -- Command Center Optimization tab.
**File:** `routers/system.py`
**Frontend consumer:** `CommandCenter.tsx` (Optimization tab)

```python
OPTIMIZATIONS = [
    {
        "id": "tf32",
        "group": "GPU",
        "name": "Enable TF32 for RTX 5090",
        "check": lambda: os.environ.get("NVIDIA_TF32_OVERRIDE") == "1",
        "apply": 'setx NVIDIA_TF32_OVERRIDE "1" /M',
    },
    {
        "id": "cuda_malloc",
        "group": "GPU",
        "name": "CUDA Memory Allocator",
        "check": lambda: "expandable_segments" in os.environ.get("PYTORCH_CUDA_ALLOC_CONF", ""),
        "apply": 'setx PYTORCH_CUDA_ALLOC_CONF "expandable_segments:True,garbage_collection_threshold:0.8" /M',
    },
    {
        "id": "hf_transfer",
        "group": "AI Stack",
        "name": "Fast HuggingFace Downloads",
        "check": lambda: os.environ.get("HF_HUB_ENABLE_HF_TRANSFER") == "1",
        "apply": 'setx HF_HUB_ENABLE_HF_TRANSFER "1" /M',
    },
    # ... see CommandCenter.tsx for the full list
]
```

---

## TASK 9: AI Proxy (Optional)

**Priority:** LOW -- AI features already work client-side via direct OpenRouter API calls.
**File:** `routers/ai_proxy.py`
**Frontend consumer:** `aiService.ts` -> all AI components (TrainingConfigOptimizer, ScriptLab)

The frontend AI subsystem already works without a backend -- it calls OpenRouter directly from the browser using the user's API key stored in Settings. This task adds a backend proxy so the API key stays server-side (better security for Tauri distribution).

```python
# routers/ai_proxy.py

import aiohttp
from fastapi import APIRouter, Request
from sse_starlette.sse import EventSourceResponse

router = APIRouter()

# Read key from environment or config file
OPENROUTER_KEY = os.environ.get("OPENROUTER_API_KEY", "")

@router.post("/chat")
async def ai_chat(request: Request):
    """Proxy chat to OpenRouter. Supports streaming."""
    body = await request.json()
    messages = body["messages"]
    model = body.get("model", "anthropic/claude-sonnet-4-20250514")
    stream = body.get("stream", False)

    headers = {
        "Authorization": f"Bearer {OPENROUTER_KEY}",
        "Content-Type": "application/json",
        "HTTP-Referer": "http://localhost:5173",
        "X-Title": "AI Command Center",
    }

    payload = {
        "model": model,
        "messages": messages,
        "stream": stream,
    }

    if not stream:
        async with aiohttp.ClientSession() as session:
            async with session.post(
                "https://openrouter.ai/api/v1/chat/completions",
                json=payload, headers=headers
            ) as resp:
                return await resp.json()

    # Streaming mode: proxy SSE chunks
    async def stream_generator():
        async with aiohttp.ClientSession() as session:
            async with session.post(
                "https://openrouter.ai/api/v1/chat/completions",
                json=payload, headers=headers
            ) as resp:
                async for line in resp.content:
                    text = line.decode("utf-8").strip()
                    if text.startswith("data: "):
                        yield {"data": text[6:]}

    return EventSourceResponse(stream_generator())
```

### How the frontend detects this:

`aiService.ts` already has the 3-tier pattern:
1. If `isTauriEnv()` or backend reachable -> `POST /api/ai/chat` (this endpoint)
2. Else -> Direct `fetch("https://openrouter.ai/api/v1/...")` with browser-stored key
3. No key -> Graceful error message

**No frontend changes needed.** The proxy is a transparent upgrade.

### Add to main.py:

```python
from routers import ai_proxy
app.include_router(ai_proxy.router, prefix="/api/ai", tags=["ai"])
```