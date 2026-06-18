# Test Manifest Policy

`python scripts/check_test_manifest.py` generates the authoritative manifest at
`build/reports/test-manifest.md` and `build/reports/test-manifest.json`.

The manifest covers backend REST routes, frontend endpoints, Web/Mobile/Desktop
business routes, and public API/function inventory. Backend route, endpoint, and
page route entries with `missing` status fail the gate. `allowed_missing` is
reserved for explicitly documented internal routes or public-symbol baseline
items and must include a reason.

Rules:

- Business REST routes must have route-level test evidence.
- Frontend REST endpoints must start with `/api/`; WebSocket paths are the only
  endpoint contract exception.
- Dynamic endpoint builders must use `Uri.encodeComponent` and have encode test
  evidence.
- Business app routes must not render `PlaceholderPage`.
- Legacy non-`/api` business paths, placeholder business routes, and hardcoded
  secret/token snapshots fail the manifest gate.
