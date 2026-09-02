# Contributing to AI Command Center

Thank you for your interest in contributing to AI Command Center! This document provides guidance for setting up the development environment and running tests.

## Setup

### Prerequisites

- Node.js 18+ and pnpm
- Python 3.10+

### Development Setup

1. **Install frontend dependencies:**

   ```bash
   pnpm install
   ```

2. **Set up backend environment:**

   ```bash
   cd src/app/backend/fastapi
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   pip install -r requirements.txt
   ```

3. **Configure environment (optional):**

   ```bash
   cp .env.example .env
   # Edit .env to add your API keys (all optional)
   ```

## Development

### Ports

- **Frontend dev server**: `http://localhost:5173`
- **Backend API**: `http://127.0.0.1:8000`

### Running the frontend

```bash
pnpm dev
```

### Running the backend

```bash
cd src/app/backend/fastapi
uvicorn main:app --host 127.0.0.1 --port 8000 --reload
```

### Testing

**Frontend tests:**

```bash
pnpm test
```

**Backend tests:**

```bash
python -m pytest src/app/backend/tests/ -q
```

## Code Conventions

- Follow the TypeScript contract in `src/app/services/types.ts` exactly when implementing backend endpoints
- Backend routes mount under `/api/` prefix
- Use import path helpers from `backend/fastapi/config.py` — never hardcode absolute paths
- All backend endpoints must be async (`async def`)
- SSE endpoints use `sse-starlette`'s `EventSourceResponse`

For detailed project conventions, see [AGENTS.md](AGENTS.md).

## Submitting Changes

1. Make your changes
2. Run tests (`pnpm test` and `pytest`)
3. Update documentation if needed
4. Submit a pull request
