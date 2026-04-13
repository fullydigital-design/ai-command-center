# AI Command Center — task runner
# Requires: https://github.com/casey/just
# Shell: PowerShell (Windows)

set shell := ["powershell.exe", "-NoProfile", "-NonInteractive", "-Command"]

# List available tasks
default:
    @just --list

# Start the Vite dev server
dev:
    pnpm dev

# Start the FastAPI backend (dev mode, auto-reload)
backend:
    Set-Location src/app/backend/fastapi; `
    uvicorn main:app --host 127.0.0.1 --port 8000 --reload

# Install all dependencies (frontend + backend)
install:
    pnpm install
    Set-Location src/app/backend/fastapi; `
    pip install -r requirements.txt

# Clean and reinstall everything from scratch
fresh:
    Remove-Item -Recurse -Force node_modules -ErrorAction SilentlyContinue
    Remove-Item -Recurse -Force src/app/backend/fastapi/venv -ErrorAction SilentlyContinue
    Remove-Item -Recurse -Force src/app/backend/fastapi/__pycache__ -ErrorAction SilentlyContinue
    pnpm install
    Set-Location src/app/backend/fastapi; `
    python -m venv venv; `
    ./venv/Scripts/pip install -r requirements.txt

# Run frontend tests (single pass)
test:
    pnpm vitest run

# Audit frontend + backend dependencies for known vulnerabilities
security:
    Write-Host "--- Frontend audit ---" -ForegroundColor Cyan
    pnpm audit
    Write-Host "--- Backend audit ---" -ForegroundColor Cyan
    pip-audit -r src/app/backend/fastapi/requirements.txt

# Print current project status and what remains
plan:
    Write-Host ""
    Write-Host "=== AI Command Center — Project Status ===" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  Frontend   " -NoNewline; Write-Host "Complete (React 18 + Vite 6 + Tailwind v4)" -ForegroundColor Green
    Write-Host "  Backend    " -NoNewline; Write-Host "~80% — training enrichment + BAT runner stubbed" -ForegroundColor Yellow
    Write-Host "  Desktop    " -NoNewline; Write-Host "Tauri v2 scaffolded, not active" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "  Remaining work:" -ForegroundColor White
    Write-Host "    routers/training.py  — TOML config parsing + TensorBoard loss curve reading"
    Write-Host "    utils/bat_runner.py  — subprocess execution + SSE line streaming"
    Write-Host ""
    Write-Host "  Ports: Backend 8000 | ComfyUI 8188 | SwarmUI 7801 | Kohya 7860 | TensorBoard 6006"
    Write-Host ""
