# E2EE browser E2E tests

Install dependencies:

```bash
pip install -r requirements-e2e.txt
playwright install chromium
```

Run against a live frontend/backend stack:

```bash
FRONTEND_BASE_URL=http://localhost:5173 python -m pytest tests/e2e/e2ee -v
```

Environment variables:

- `FRONTEND_BASE_URL` (default `http://localhost:5173`)
- `HEADLESS` (default `true`)
- `TEST_TIMEOUT` (default `30000`)
- `TEST_PASSWORD` (default `TestPassword123!`)
- `E2E_CLEANUP` (default `true`)
