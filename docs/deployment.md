# Deployment

The local/SIT deployment flow is driven by Docker Compose and the Python scripts in
`scripts/`. The repository root also contains compatibility entry points for the
three-step workflow.

## Prerequisites

- Docker daemon is running.
- `.env` exists in the repository root. Start from `.env.example` and replace all
  generated passwords and secrets.
- Run commands from the repository root.

## Full Workflow

```sh
python deploy.py
```

Default phases:

1. Check Docker and `.env`.
2. Start middleware: MySQL, Redis shards, and file volume initialization.
3. Check MySQL and `sql/mysql8/init_all.sql` without dropping data.
4. Build and start core application services: `im-server`, `im-api-server`, and
   `im-frontend`.
5. Print the final Docker Compose status.

To run a destructive full database import:

```sh
python deploy.py --init-db full --yes
```

Without `--yes`, the database script asks for an explicit `RESET` confirmation
when stdin is interactive, and fails closed in non-interactive terminals.

## Common Commands

```sh
python deploy.py --status-only
python deploy.py --middleware-only
python deploy.py --services-only api
python deploy.py --skip-middleware frontend
python deploy.py backend
python deploy.py frontend --no-build
python deploy.py --include-ai
python deploy.py ai
```

Compatibility commands:

```sh
python 1_deploy_middleware.py
python 2_init_db.py check
python 2_init_db.py full --yes
python 3_deploy_services.py api frontend
```

Direct script commands:

```sh
python scripts/deploy_middleware.py --status-only
python scripts/init_db.py check
python scripts/deploy_services.py all
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
- `python deploy.py --skip-middleware ...` skips starting middleware, but still
  checks middleware readiness before services unless `--skip-middleware-check` is
  also passed.
- `scripts/deploy_services.py` applies `sql/mysql8/e2ee_migration.sql` before
  deploying `im-api-server` unless `--skip-migrations` is passed.
