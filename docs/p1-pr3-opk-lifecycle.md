# P1 PR3: OPK Lifecycle

## Goal

Make one-time pre-key handling observable and safe enough for P1 production hardening.

## Policy

- Device registration keeps `POST /api/keys/bundle` as a full public bundle rotation.
- Low-watermark replenishment uses `POST /api/keys/opk/refill`, which appends public OPKs and does not delete existing unconsumed keys.
- `GET /api/keys/bundle` atomically claims one OPK when available.
- OPK exhaustion returns signed-pre-key fallback with `opkFallback: true`.
- Server accepts only public key material. Unknown fields on OPK entries are rejected so private-key-shaped data is not silently accepted.

## API

- `GET /api/keys/opk/status?deviceId=<device>` returns device OPK count, low-watermark status, threshold, target count, and fallback policy.
- `POST /api/keys/opk/refill` accepts `{ deviceId, oneTimePreKeys }` for the current active device.
- `DELETE /api/keys/opk/expired` deletes consumed OPKs older than the retention window for the current user.

## Client Behavior

Web and Mobile call OPK status after device heartbeat. When the server reports low watermark, the client generates fresh OPKs through the existing Rust bridge, stores the private key pairs locally, and uploads only public OPKs through refill.

## Verification

Run:

```bash
cd rust
cargo fmt --check
cargo check -p api-server
cargo test -p api-server e2ee::key_tests

cd flutter/packages/shared_features
flutter analyze
flutter test
```
