# Android Debug Diagnostics

## Scope

This document explains the lightweight Android debug diagnostics panel for `frontend/apps/mobile`.

Goals:

- help real-device IM debugging without adding complex third-party monitoring
- expose runtime and delivery health quickly
- keep tokens, cookies, passwords, API keys, and authorization headers out of diagnostics
- keep diagnostics hidden from release users

## Visibility

The diagnostics entry is debug-only.

- shown only when the app runs in dev mode
- hidden for release runtime builds
- added under `Settings -> Debug Diagnostics`

## What The Panel Shows

The screen aggregates local-only diagnostics:

- `appEnv`
- `API_BASE_URL`
- `WS_BASE_URL`
- current user id only
- WebSocket status
- reconnect attempts
- pending count
- SQLite mode: `sqlite` or `memory`
- SQLite persistence availability
- FCM token available: `true` or `false`
- last API error
- last WS error
- recent local warn/error logs

Sensitive values are never shown:

- token
- cookie
- password
- api key
- authorization

## Logger Enhancements

The local logger now supports:

- recent log ring buffer
- automatic sensitive-field redaction
- export as plain text
- subscriber updates for debug screens

The exported log text is already redacted and safe to copy into bug reports, as long as normal engineering judgment is still applied.

## Supported Actions

The diagnostics screen supports these debug actions:

- refresh current snapshot
- copy redacted logs to clipboard
- reconnect WebSocket
- retry pending uploads/messages through the existing retry chain
- clear local cache with double confirmation

`Clear local cache` removes local message cache, notification event cache, upload task cache, pending queue cache, volatile KV cache, and recent diagnostics state. It does not intentionally log the user out.

## Typical Real-Device Workflow

1. Start the mobile app in debug mode on a real device.
2. Log in with a test account.
3. Open `Profile -> Settings -> Debug Diagnostics`.
4. Confirm:
   - environment points at the expected gateway
   - user id is loaded
   - WebSocket is connected
   - SQLite mode is `sqlite` when native storage is available
   - FCM availability matches the current test setup
5. If delivery looks stuck:
   - tap `Reconnect WebSocket`
   - tap `Retry pending`
   - inspect recent API / WS errors
   - copy redacted logs for issue reporting

## Notes

- This panel is intentionally local and lightweight; no paid or complex hosted monitoring is introduced.
- The implementation does not modify backend behavior.
- The implementation does not alter business logic or message semantics.
- Existing logger behavior is preserved and only extended with buffering, redaction, export, and subscription support.
