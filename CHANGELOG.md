# Changelog

All notable changes to this project will be documented in this file.

## [1.0.0] - 2026-09-02

### Added
- Production v1 build pipeline: Tauri desktop app (MSI + NSIS installers)
- Backend sidecar packaging via PyInstaller
- Full TypeScript type checking with all errors resolved
- Backend/ frontend contract validation (cleanup, optimizations endpoints)

### Changed
- Fixed TypeScript errors in civitaiService.ts, githubService.ts, env.ts
- Aligned backend API responses with TypeScript type contracts
- Updated PyInstaller build output name to match Tauri externalBin config
- Removed unused dependencies: date-fns, motion, tw-animate-css
- Updated CHANGELOG.md with v1.0.0 release notes

### Fixed
- Backend cleanup endpoints now return correct shape (size_bytes, size_display, category)
- Backend optimizations endpoint now returns correct shape (group, name, description, applied, command)
- Added CORS_ORIGINS to .env.example
- Updated BACKEND_TASKS.md to remove deleted bat_runner.py reference
- Cleaned up orphan __pycache__ directories and log files
- Removed dead code (`utils/bat_runner.py`) — logic already implemented in `routers/setup.py`
- Updated documentation (`AGENTS.md`, `README.md`) to reflect actual implementation status

### Added
- Frontend unit tests for `env.ts` and `createService.ts` (W2)
- Backend pytest-compatible tests for TOML config parsing (W1)
- `CONTRIBUTING.md` with setup and development guidance

### Fixed
- Backend test suite (`test_toml_parsing.py`) now passes under pytest while maintaining standalone execution

### Removed
- `utils/bat_runner.py` — dead code, functionality preserved in `routers/setup.py`
