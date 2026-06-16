# P1 PR6: SIT / CI Automation

## Goal

Provide a repeatable manual SIT path for P1 E2EE hardening without making every PR wait for full live middleware. PR gates remain unit/analyze/smoke; full P1 SIT runs through `workflow_dispatch` or locally.

## Local Entry Point

```bash
python scripts/p1_sit_gate.py \
  --base-url http://localhost:8082 \
  --db-url mysql://root:root123@127.0.0.1:3306/service_message_service_db
```

The gate verifies Docker, Flutter, Rust, and Cargo, starts `docker-compose.sit.yml` unless `--skip-compose` is set, waits for `/health`, runs migrations, builds Rust E2EE FFI, runs `scripts/p0_gate.py`, and then runs P1 staged SIT scripts when present.

Artifacts are written under `artifacts/p1-sit/<timestamp>/`:

- `summary.md`;
- per-step logs;
- `plaintext-scan.txt`.

`artifacts/` is ignored by Git.

## Compose Topology

`docker-compose.sit.yml` starts:

- MySQL 8 with `sql/mysql8/init_all.sql`;
- Redis 7;
- migration job for `sql/mysql8/e2ee_migration.sql`;
- Rust `api-server`.

All hot/event/cache Redis URLs point at the SIT Redis instance so local runs need only one Redis container.

## P1 Stages

The gate stages are:

- private single-device E2EE via existing P0 acceptance script;
- OPK lifecycle;
- private multi-device fan-out;
- group E2EE;
- DB plaintext scan.

Missing P1 stage scripts are reported as `pending`, not `pass`, so reviewers can distinguish infrastructure readiness from complete SIT coverage.

## CI Policy

`.github/workflows/p1-sit.yml` is manual-only via `workflow_dispatch`. It installs Rust, Flutter, and Python dependencies, runs the P1 gate, and uploads artifacts regardless of pass/fail.

Pull request gates stay focused on Rust/Flutter unit, analyze, and smoke coverage. Full SIT remains an explicit release-hardening gate.
