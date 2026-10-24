# Decisions

Why this project is built the way it is, oldest first. One entry per decision that changes a
contract, a dependency, a data format or the architecture; IDs are consecutive and never reused.

### ADR-001: Architecture of Crypt-Crawler Web Game and Visual Inspection Suite
- **Date**: 2026-10-24
- **Status**: Accepted
- **Context**: Need a responsive, tactical web-based dungeon crawler with high UI fidelity and automated visual verification capability using headless browser technology.
- **Decision**: Adopt a zero-external-dependency Python runtime (`http.server` with custom JSON dispatch) paired with a modern Vanilla ES6 Canvas + CSS3 frontend. For automated visual verification and UI auditing, provide a Playwright-driven headless Edge inspection harness (`tools/inspect_ui.py`) and standard unittest suite (`tests/`).
- **Consequences**: Zero frontend compile/bundle step enables instant live-reloading and cold starts; headless Edge runs natively on Windows without requiring separate browser binary downloads; unit tests and visual screenshots provide comprehensive coverage.

### ADR-002: One-Click Launchers and Seamless Floor Descent State Persistence
- **Date**: 2026-10-24
- **Status**: Accepted
- **Context**: Users need immediate zero-friction launching with automated browser opening; furthermore, descending dungeon stairs must preserve character level, equipment, and backpack inventory.
- **Decision**: Provide `PLAY.bat` and `play.sh` with automatic Python detection and `--open` browser integration. In `engine.js`, implement `descendFloor()` to regenerate the deeper dungeon while preserving all player progression attributes.
- **Consequences**: Players can start playing with a single click, and RPG progression smoothly persists across dungeon depths.
