# Deployment

The local and CI lifecycle is driven by Python entrypoints and Docker Compose. Run commands from the repository root.

## Requirements

- Python 3.12 or newer.
- Docker and Docker Compose for runtime and SIT workflows.
- Rust toolchain for Rust builds and tests.
- Flutter SDK for Flutter builds and tests.
- Maven or Docker JDK fallback for Spring AI builds.
- Optional coverage tools such as `cargo-llvm-cov` for coverage gates.

## Runtime Files

Default runtime files live under `build/runtime/`:

- Env file: `build/runtime/env/local.env`
- Generated Compose file: `build/runtime/compose/docker-compose.generated.yml`
- MySQL data: `build/runtime/mysql`
- Redis data: `build/runtime/redis`
- File storage: `build/runtime/files`
- Runtime logs: `build/runtime/logs`

`build/runtime/env/local.env` is generated from `.env.example` when missing. The repository root `.env` is not the recommended default runtime env. `deploy/sit/docker-compose.yml` remains a source template; it is not the default runtime Compose file.

## Workflow

Initialize runtime directories, env, generated Compose, middleware, and database checks:

```sh
python scripts/init.py
```

Create only runtime directories, env, and generated Compose:

```sh
python scripts/init.py --runtime-only
```

Build artifacts:

```sh
python scripts/build.py all
```

Start, inspect, and stop services:

```sh
python scripts/start.py start
python scripts/start.py status
python scripts/start.py stop
```

Run tests through the unified test entrypoint:

```sh
python tests/test.py manifest
python tests/test.py pr-fast
python tests/test.py main-full
python tests/test.py coverage
python tests/test.py sit
```

`scripts/start.py` uses existing images and does not trigger builds. Rebuild explicitly with `python scripts/build.py`.

## Reports

Generated reports belong under `build/reports/`:

- Test entrypoint summaries: `build/reports/test`
- Coverage output: `build/reports/coverage`
- Gate summaries: `build/reports/gates`
- Manifest reports: `build/reports/manifest`

Do not commit `build/reports/` contents.

## Cleanup Risk

Deleting `build/runtime/` resets local runtime state and removes local MySQL data, Redis data, uploaded files, runtime logs, generated Compose, and local env configuration. Ordinary init/start/test commands do not delete runtime data.

## Troubleshooting

- If runtime env or Compose is missing, run `python scripts/init.py --runtime-only`.
- If services fail to start after code changes, run `python scripts/build.py all` and then `python scripts/start.py restart`.
- If Docker commands fail, confirm Docker Desktop or the Docker daemon is running and `python scripts/init.py --check-only` passes.
- If tests cannot find reports, check `build/reports/` rather than root-level legacy report directories.
- If a lower-level script is needed for debugging, prefer invoking it through `python scripts/init.py`, `python scripts/start.py`, or `python tests/test.py` first.
