# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased] / v1.0.0

### Changed
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
