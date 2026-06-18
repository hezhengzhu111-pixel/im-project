# Gray Gate

The gray release gate is driven by `scripts/gray_gate.py`.

Modes:

- `pr-fast`: Rust fmt/check/unit/clippy, Flutter analyze/test, manifest checks,
  known-failure policy checks.
- `main-full`: `pr-fast`, api-server integration tests, Rust/Flutter coverage
  generation, and coverage threshold checks.
- `gray-release`: `main-full`, Docker-backed SIT, migrations through the SIT
  compose flow, P0/P1 E2EE acceptance, DB plaintext scan, and backend full API
  SIT when the local or CI environment supports it.

Critical gray-release steps must not be silently skipped. If Docker, MySQL,
Redis, or required test environment variables are missing, the result is `FAIL`
or `NOT RUN`, not pass.
