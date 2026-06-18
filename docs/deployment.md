# Deployment

The local/SIT deployment flow is driven by Docker Compose and the Python scripts in
`scripts/`.

## Prerequisites

- Docker daemon is running.
- `.env` exists in the repository root. Start from `.env.example` and replace all
  generated passwords and secrets.
- Run commands from the repository root.

## Lifecycle Entry Points

The project provides three main lifecycle entry points:

### 1. Initialize Environment and Infrastructure

```sh
python scripts/init.py
```

This script handles:
- Environment checks (Docker, Docker Compose)
- Build/ directory structure initialization
- Middleware preparation (MySQL, Redis, etc.)
- Database initialization or checks

Common options:
```sh
python scripts/init.py --check-only           # Check environment only
python scripts/init.py --skip-middleware      # Skip middleware initialization
python scripts/init.py --skip-db             # Skip database check
python scripts/init.py --skip-build-dirs     # Skip build/ directory creation
python scripts/init.py --pull                # Pull images before starting middleware
python scripts/init.py --force-recreate      # Force recreate middleware containers
```

### 2. Build and Package

```sh
python scripts/build.py
```

This script handles:
- Compiling Flutter Web application
- Building Rust backend services
- Creating Docker images
- Generating build manifest

Common options:
```sh
python scripts/build.py all                  # Build all components
python scripts/build.py rust                 # Build Rust services only
python scripts/build.py web                  # Build Flutter Web only
python scripts/build.py docker-images        # Build Docker images
python scripts/build.py clean                # Clean build directory
```

### 3. Manage Services

```sh
python scripts/start.py
```

This script handles:
- Starting all or specific services
- Viewing service status
- Stopping services
- Restarting services
- Viewing service logs

Common commands:
```sh
python scripts/start.py start                # Start all services
python scripts/start.py start im-server      # Start specific service
python scripts/start.py status               # View service status
python scripts/start.py stop                 # Stop all services
python scripts/start.py restart              # Restart all services
python scripts/start.py logs im-server       # View service logs
python scripts/start.py logs im-server -f    # Follow service logs
```

**Note:** To rebuild services before starting, run `python scripts/build.py` first.
The `start.py` script does not trigger builds.

## Recommended Workflow

### First-Time Setup
```sh
# 1. Initialize environment and infrastructure
python scripts/init.py

# 2. Build the project
python scripts/build.py all

# 3. Start services
python scripts/start.py start
```

### Daily Development
```sh
# View service status
python scripts/start.py status

# Restart specific service (after code changes)
python scripts/start.py restart im-server

# View logs for debugging
python scripts/start.py logs im-server --follow

# Stop all services
python scripts/start.py stop
```

### Rebuild and Restart
```sh
# Clean and rebuild
python scripts/build.py clean
python scripts/build.py all

# Restart services
python scripts/start.py restart
```

## Service Targets

Supported service aliases:

- `all`: `im-server`, `im-api-server`, `im-frontend`
- `backend` or `core`: `im-server`, `im-api-server`
- `api`, `api-server`, or `gateway`: `im-api-server`
- `im` or `chat`: `im-server`
- `frontend`, `front`, or `web`: `im-frontend`
- `ai` or `spring-ai`: `im-spring-ai`

`im-spring-ai` is optional. It is not included in the default full workflow unless
`--include-ai` is passed or `ai` is selected explicitly.

## Safety Notes

- Deployment scripts require `.env` by default instead of silently falling back to
  `.env.example`.
- Commands printed by the scripts redact password, token, secret, and key values.
- Service startup waits include recent Docker Compose logs when a container exits,
  restarts repeatedly, or times out.
- `scripts/deploy_services.py` checks middleware readiness before deploying app
  services unless `--skip-middleware-check` is passed.
- `python init.py --skip-middleware` skips starting middleware, but still checks
  middleware readiness before services unless `--skip-middleware-check` is also passed.
- `scripts/deploy_services.py` applies `sql/mysql8/e2ee_migration.sql` before
  deploying `im-api-server` unless `--skip-migrations` is passed.

## Legacy Commands (Deprecated)

The following root-level wrapper scripts have been removed in Batch 2:

- `deploy.py` → Use `python scripts/start.py` instead
- `1_deploy_middleware.py` → Use `python scripts/init.py` instead
- `2_init_db.py` → Use `python scripts/init.py` instead
- `3_deploy_services.py` → Use `python scripts/start.py` instead

The underlying scripts are still available in `scripts/` for advanced use cases:
- `scripts/deploy_middleware.py`
- `scripts/init_db.py`
- `scripts/deploy_services.py`

But the recommended entry points are `init.py`, `build.py`, and `start.py`.
