# P1 Acceptance Report

## Current PR

P1-1: Mobile sent-message cache hardening.

## Implemented

- Mobile self-sent E2EE plaintext recovery cache now writes plaintext payloads through `SecureStoragePort`.
- SharedPreferences stores only non-sensitive index metadata for lookup, TTL cleanup, and max-entry cleanup.
- Legacy `e2ee_sent_*` SharedPreferences plaintext entries migrate on first cache access and are deleted after secure storage write.
- `SentMessageCachePort` was moved to shared chat data layer so auth and chat can share the same platform adapter without importing notifier code.
- Mobile startup injects the same `MobileSentMessageCache` into both chat recovery and logout cleanup paths.
- Shared auth logout now accepts an optional `SentMessageCachePort` and clears it even when server logout fails.
- Existing disable-E2EE session flow already calls `clearSession`; the hardened cache keeps that behavior.

## Not In Scope For This PR

- Web / Mobile `ChatNotifier` convergence.
- OPK lifecycle changes.
- Private multi-device fan-out.
- Group E2EE.
- SIT / CI orchestration.
- Encrypted media or plaintext fallback.

## Verification Status

- P0 final gate pending live DB credentials and running backend dependencies.
- Full P1 SIT is pending `scripts/p1_sit_gate.py` in PR 6.
- Executed local Flutter verification for this PR:

```bash
cd flutter/apps/mobile
flutter analyze
flutter test test/features/chat/mobile_sent_message_cache_test.dart
flutter test

cd flutter/packages/shared_features
flutter analyze
flutter test
```

Results:

- `flutter/apps/mobile`: targeted sent cache test passed.
- `flutter/apps/mobile`: full `flutter test` passed.
- `flutter/apps/mobile`: `flutter analyze` reported one pre-existing info in `test/smoke/provider_smoke_test.dart` for a dangling library doc comment.
- `flutter/packages/shared_features`: `flutter analyze` passed.
- `flutter/packages/shared_features`: `flutter test` passed.

## Known Risks

- Secure storage implementations generally do not support key enumeration, so `clearAll` removes keys known through the SharedPreferences metadata index.
- If a legacy plaintext entry cannot be parsed or securely migrated, it is removed without logging the plaintext.
