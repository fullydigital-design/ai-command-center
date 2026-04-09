# AI Command Center

**Local AI workstation dashboard for RTX setups**

![React](https://img.shields.io/badge/React-18-61DAFB?style=flat-square&logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-6-646CFF?style=flat-square&logo=vite&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688?style=flat-square&logo=fastapi&logoColor=white)
![Tauri](https://img.shields.io/badge/Tauri-v2-FFC131?style=flat-square&logo=tauri&logoColor=white)

---

A local dashboard for managing AI/ML workstation workflows on RTX hardware. Monitors GPU and system resources in real time, tracks active training jobs across Kohya SS and Musubi Tuner, controls local AI services (ComfyUI, SwarmUI, Ollama), and aggregates model discovery from GitHub, HuggingFace, and CivitAI — all without sending data anywhere.

Built for setups where you run your own stack and need a single interface to see what is happening across the machine.

---

<table>
<tr>
<td><img src="doc/screenshot _01.png" width="100%"/><br/><sub>Command Center overview</sub></td>
<td><img src="doc/screenshot _02.png" width="100%"/><br/><sub>GPU Live Monitor</sub></td>
</tr>
<tr>
<td><img src="doc/screenshot _03.png" width="100%"/><br/><sub>Training Jobs</sub></td>
<td><img src="doc/screenshot _04.png" width="100%"/><br/><sub>Community Hub</sub></td>
</tr>
</table>

---

## Features

- **Real-time GPU monitoring** — VRAM, utilization, temperature, power draw with 30-second rolling charts
- **Training job auto-detection** — scans running processes, parses TOML configs, reads TensorBoard loss curves (Kohya SS, Musubi Tuner)
- **Service control** — health check, launch, and stop for ComfyUI, SwarmUI, and Ollama
- **Community Hub** — GitHub trending repos, HuggingFace models, and CivitAI checkpoints in a single view
- **Script Package system** — drag-drop `.zip` packages with `manifest.json`, AI-generated BAT scripts, SSE-streamed execution

## Stack

**Frontend**
![React](https://img.shields.io/badge/React_18-61DAFB?style=flat-square&logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite_6-646CFF?style=flat-square&logo=vite&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_v4-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white)
![Radix UI](https://img.shields.io/badge/Radix_UI-161618?style=flat-square&logo=radix-ui&logoColor=white)

**Backend**
![FastAPI](https://img.shields.io/badge/FastAPI-009688?style=flat-square&logo=fastapi&logoColor=white)
![Python](https://img.shields.io/badge/Python-3776AB?style=flat-square&logo=python&logoColor=white)
![psutil](https://img.shields.io/badge/psutil-grey?style=flat-square)
![pynvml](https://img.shields.io/badge/pynvml-76B900?style=flat-square&logo=nvidia&logoColor=white)

**Desktop**
![Tauri](https://img.shields.io/badge/Tauri_v2-FFC131?style=flat-square&logo=tauri&logoColor=white)

## Status

| Layer | Status |
|---|---|
| Frontend | Complete — fully functional on mock data |
| Backend | ~20% stubbed — FastAPI routing scaffolded, endpoints ready to wire up |
| Desktop | Tauri wrapper scaffolded, inactive |

The frontend degrades gracefully through three tiers: live backend → direct browser API calls → mock data. It works out of the box without a running backend.

## Setup

```bash
pnpm install
cp .env.example .env   # fill in API keys (all optional)
pnpm dev
```

Runs at `http://localhost:5173`. Backend not required for the UI to function.

To build the backend sidecar:

```bash
cd src/app/backend/fastapi
pip install -r requirements.txt
uvicorn main:app --host 127.0.0.1 --port 8420 --reload
```

## License

See [ATTRIBUTIONS.md](ATTRIBUTIONS.md).
