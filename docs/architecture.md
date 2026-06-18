# Architecture

This repository is organized around four source areas and one generated work area.

## Root Layout

- `flutter/`: Flutter applications and shared packages.
- `rust/`: Rust backend services, shared crates, E2EE crates, and Flutter bridge crates.
- `spring-ai/`: Spring AI service.
- `sql/`: SQL initialization and migration scripts.
- `scripts/`: lifecycle commands and compatibility helpers.
- `tests/`: the unified test entry point and test suites.
- `docs/`: final project documentation.
- `build/`: the only writable workspace for generated local state.

## Writable Workspace

`build/` is the only place where generated build products, runtime data, reports, and local caches should be written.

- `build/work/`: isolated build workspaces copied from source directories.
- `build/cache/`: dependency and tool caches such as Cargo, Flutter pub, Maven, and Docker config.
- `build/dist/`: final build outputs and exported images.
- `build/runtime/`: local runtime configuration, Docker Compose output, middleware data, file storage, and logs.
- `build/reports/`: test, coverage, gate, and manifest reports.
- `build/logs/`: build and script logs.

Source directories must not receive build products, dependency caches, runtime data, coverage output, or test reports.

## Isolated Build

`python scripts/build.py` builds from `build/work/` and keeps dependencies in `build/cache/`.

- Rust builds use `build/cache/rust-target` instead of `rust/target`.
- Flutter builds use isolated work paths and `build/cache/pub-cache`.
- Spring AI builds use isolated work paths and `build/cache/maven-repo`.
- Final artifacts go to `build/dist/`.
- The build manifest is `build/manifest.json`.

## Runtime

`python scripts/init.py` prepares runtime state under `build/runtime/`.

- Env: `build/runtime/env/local.env`
- Generated Compose: `build/runtime/compose/docker-compose.generated.yml`
- MySQL data: `build/runtime/mysql`
- Redis data: `build/runtime/redis`
- File storage: `build/runtime/files`
- Runtime logs: `build/runtime/logs`

`deploy/sit/docker-compose.yml` remains a template/source file. The default runtime Compose file is the generated file under `build/runtime/compose/`.

## Lifecycle Entrypoints

Use these commands as the public lifecycle interface:

- `python scripts/init.py`
- `python scripts/build.py`
- `python scripts/start.py`
- `python tests/test.py`

Lower-level helpers such as `scripts/deploy_services.py`, `scripts/deploy_middleware.py`, `scripts/init_db.py`, `scripts/deploy_utils.py`, and `scripts/gate_common.py` may remain because the lifecycle entrypoints and gates use them, but they are not the recommended user-facing commands.
