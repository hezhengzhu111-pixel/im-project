# P1 E2EE Production Hardening Plan

## Scope

P1 starts from the P0 private-text E2EE baseline and hardens it for production use. It does not add encrypted media, audio/video playback, social features, AI features, or plaintext fallback for encrypted messages.

## PR Plan

### PR 1: Mobile Sent-Message Cache Hardening

- Move self-sent plaintext recovery cache out of bare SharedPreferences.
- Store plaintext through platform secure storage, with SharedPreferences limited to non-sensitive index metadata.
- Keep `SentMessageCachePort` compatible with existing `ChatNotifier` usage.
- Preserve `put`, `getPlaintextByClientId`, `getPlaintextByServerId`, `updateServerId`, `clearSession`, `clearAll`, TTL cleanup, and max-entry cleanup.
- Migrate legacy `e2ee_sent_*` SharedPreferences plaintext entries on first access and delete the legacy value after migration.
- Clear cache on logout and when an E2EE session is disabled.

### PR 2: Web / Mobile ChatNotifier Convergence

- Document current Web `ChatNotifierWithOutbox` behavior versus shared `ChatNotifier`.
- Move shared behavior into `flutter/packages/shared_features`.
- Keep Web IndexedDB outbox and sent cache as adapters.
- Keep Mobile outbox and secure sent cache as adapters.
- Add regression tests as each behavior is migrated.

### PR 3: OPK Lifecycle

- Atomically consume one OPK when serving a device bundle.
- Add status/refill/expiry paths for OPK inventory.
- Define exhausted-OPK behavior in docs.
- Verify concurrent consume does not return duplicate OPKs.

### PR 4: Private Multi-Device E2EE Fan-Out

- Return active recipient devices for private sends.
- Require clients to submit one independent envelope per recipient device.
- Persist device envelopes separately from message rows.
- Deliver and load history with only the current device envelope.
- Include sender-device sync without server plaintext.

### PR 5: Group E2EE Minimum Chain

- Use a group epoch / sender-key model.
- Increment epoch on membership changes.
- Prevent new members reading old epochs and removed members reading new epochs.
- Keep group media explicitly unsupported in P1.

### PR 6: SIT / CI Automation

- Add local and workflow-dispatch SIT orchestration for MySQL, Redis, api-server, migrations, and E2EE tests.
- Produce test summary, SIT logs, DB plaintext scan result, and failure reason artifacts.
- Keep PR gate lightweight while manual gate runs full SIT.

## P2 Boundary

- Encrypted media.
- Full file/audio/video playback.
- Advanced key backup.
- Enterprise compliance audit.

## Required Verification

Each PR should run the relevant subset of:

```bash
cd rust
cargo fmt --check
cargo check --workspace
cargo test --workspace

cd flutter/packages/core_flutter
flutter analyze
flutter test

cd flutter/packages/shared_features
flutter analyze
flutter test

cd flutter/apps/web
flutter analyze
flutter test

cd flutter/apps/mobile
flutter analyze
flutter test
```

Full P0/P1 SIT additionally requires a live api-server, MySQL, Redis, migrations, and the Rust E2EE FFI artifacts.
