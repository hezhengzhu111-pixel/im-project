# Gray Release Issues

This document tracks issues discovered during Step 6 gray release verification.

## ISSUE-001: MySQL Core Table Names Mismatch

- **First seen:** 2026-06-18
- **Candidate commit:** 05001b9ac17639b6c005ae4b3659560cd3d3cbcb
- **Gate step:** Environment check
- **Report file:** build/reports/gray-env-check.json
- **Status:** WARN
- **Critical:** No
- **Category:** environment
- **Symptom:** gray_env_check.py expects tables: users, user_profiles, auth_sessions, private_messages, group_messages, groups, group_members, e2ee_device_keys, e2ee_sessions, files, moments, push_devices, ai_keys
- **Evidence:** Actual tables: accepted_message, group_read_cursor, message_deliveries, message_outbox, message_read_status, message_state_outbox, messages, messages_archive, moments_comment, moments_like, moments_media, moments_notification, moments_post, pending_status_event, private_read_cursor
- **Root cause:** Database schema uses different naming convention than expected by environment check script
- **Minimal fix:** Update gray_env_check.py to match actual table names, or verify current table structure is correct for application
- **Files changed:** (pending investigation)
- **Tests added/updated:** (pending)
- **Re-run command:** `python scripts/gray_env_check.py --env local-gray --api-base "http://localhost:8082" --ws-base "ws://localhost:8083/ws" --db-url "mysql://root:***@localhost:3306/service_message_service_db" --redis-url "redis://:***@localhost:6379/0"`
- **Re-run result:** (pending)
- **Decision impact:** Non-blocking, may indicate incomplete migration

## ISSUE-002: WebSocket Ticket Registration Fails

- **First seen:** 2026-06-18
- **Candidate commit:** 05001b9ac17639b6c005ae4b3659560cd3d3cbcb
- **Gate step:** Environment check
- **Report file:** build/reports/gray-env-check.json
- **Status:** WARN
- **Critical:** No
- **Category:** environment
- **Symptom:** Can construct WebSocket URL but cannot get ticket
- **Evidence:** User registration returns 400 error
- **Root cause:** Test user registration fails, preventing WS ticket retrieval test
- **Minimal fix:** Verify user registration endpoint accepts test payload, or adjust test to create valid user first
- **Files changed:** (pending investigation)
- **Tests added/updated:** (pending)
- **Re-run command:** (same as above)
- **Re-run result:** (pending)
- **Decision impact:** Non-blocking, may indicate registration validation issue

## ISSUE-003: Redis Deprecated API Usage

- **First seen:** 2026-06-18
- **Candidate commit:** 05001b9ac17639b6c005ae4b3659560cd3d3cbcb
- **Gate step:** Environment check
- **Report file:** stderr output
- **Status:** PASS
- **Critical:** No
- **Category:** test-script
- **Symptom:** DeprecationWarning: Call to deprecated setex
- **Evidence:** Redis 8.x deprecated setex in favor of set
- **Root cause:** gray_env_check.py uses deprecated Redis API
- **Minimal fix:** Update r.setex() to r.set() with ex parameter
- **Files changed:** scripts/gray_env_check.py
- **Tests added/updated:** (pending)
- **Re-run command:** (same as above)
- **Re-run result:** (pending)
- **Decision impact:** None - warning only


## ISSUE-004: User Registration Returns 400 Error

- **First seen:** 2026-06-18
- **Candidate commit:** 05001b9ac17639b6c005ae4b3659560cd3d3cbcb
- **Gate step:** Smoke tests (A1. Register users)
- **Report file:** build/reports/gray-smoke.json
- **Status:** FAIL
- **Critical:** yes
- **Category:** backend-api
- **Symptom:** POST /api/user/register returns HTTP 400
- **Evidence:** "Failed to register gray_1781762891_A_efbdba: Register failed: 400"
- **Root cause:** (pending investigation) - Registration endpoint validation may be too strict, or test payload format doesn't match expected schema
- **Minimal fix:** Investigate registration endpoint validation, check test payload format, verify required fields
- **Files changed:** (pending investigation)
- **Tests added/updated:** (pending)
- **Re-run command:** `python scripts/gray_smoke.py --env local-gray --api-base "http://localhost:8082" --ws-base "ws://localhost:8083/ws"`
- **Re-run result:** (pending)
- **Decision impact:** **CRITICAL** - Blocks all user-dependent tests, P1 SIT, DB plaintext scan, and gray release

