# P1 Acceptance Report — E2EE Production Hardening

Generated: 2026-06-16

## Overview

P1 covers six production-hardening tracks to make E2EE ready for real multi-device
and group communication, enforced by an automated SIT gate that cannot be bypassed
by missing test scripts (`pending ≠ pass`).

---

## P1 Status Table

| # | Track | Status | Test Script | Needs Backend | Needs DB |
|---|---|---|---|---|---|
| P1-1 | Mobile sent-message cache security | PASS | `flutter/apps/mobile flutter test` | No | No |
| P1-2 | ChatNotifier convergence (Web/Mobile) | PASS | `flutter analyze && flutter test` | No | No |
| P1-3 | Private multi-device fan-out | REQUIRES SIT | `tests/p1_private_multidevice_fanout.py` | Yes | Yes |
| P1-4 | OPK lifecycle | REQUIRES SIT | `tests/p1_opk_lifecycle.py` | Yes | Yes |
| P1-5 | Group E2EE | REQUIRES SIT | `tests/p1_group_e2ee.py` | Yes | Yes |
| P1-6 | SIT/CI gate automation | IMPLEMENTED | `scripts/p1_sit_gate.py` | Yes | Option |

**Key:** PASS = verified, REQUIRES SIT = script exists but needs real backend run, PARTIAL = work started.

---

## Per-Track Details

### P1-1: Mobile Sent-Message Cache Security

**Status:** PASS

- Mobile self-sent E2EE plaintext recovery cache writes plaintext through `SecureStoragePort`.
- SharedPreferences stores only non-sensitive index metadata.
- Legacy `e2ee_sent_*` entries are migrated and deleted on first access.
- `SentMessageCachePort` moved to shared data layer for cross-module sharing.
- Auth logout clears sent-message cache securely.

**Verification:**
```bash
cd flutter/apps/mobile
flutter analyze
flutter test test/features/chat/mobile_sent_message_cache_test.dart
flutter test
```
Results: All tests pass. One pre-existing info-level warning in `provider_smoke_test.dart`.

### P1-2: ChatNotifier Convergence (Web/Mobile)

**Status:** PASS

- Web and Mobile share the same `ChatNotifier` core logic.
- Web notifier uses shared message-handling pipeline.
- Mobile notifier integrates with shared `SentMessageCachePort`.

**Verification:**
```bash
cd flutter/packages/shared_features
flutter analyze && flutter test
cd flutter/apps/web
flutter analyze && flutter test
cd flutter/apps/mobile
flutter analyze && flutter test
```
Results: All pass.

### P1-3: Private Multi-Device Fan-Out

**Status:** SIT script implemented — awaiting real backend run

**Test script:** `tests/p1_private_multidevice_fanout.py`

**Coverage:**
1. Alice 1 device → Bob 2 devices (batch e2eeEnvelopes)
2. Envelope isolation (device-b1 cannot decrypt device-b2 envelope)
3. Revoked device receives no new envelopes
4. Alice 2 devices → Bob 1 device (sender-side sync)
5. HTTP response plaintext scan
6. DB plaintext scan (messages, message_deliveries)

**Run:**
```bash
python tests/p1_private_multidevice_fanout.py \
  --base-url http://localhost:8082 \
  --db-url mysql://root:root123@127.0.0.1:3306/service_message_service_db
```

**Requirements:** Real Rust E2EE FFI, running api-server, MySQL with full E2EE schema.

### P1-4: OPK Lifecycle

**Status:** SIT script implemented — awaiting real backend run

**Test script:** `tests/p1_opk_lifecycle.py`

**Coverage:**
1. Upload OPK pool → count verification
2. Consume once + idempotent re-claim
3. Concurrent consume (unique requesters get distinct OTKs)
4. Exhausted fallback to signed pre-key (opkFallback=true)
5. Refill → count increases, new OTK fetchable
6. Delete expired → consumed OPKs cleaned, active retained
7. Revoked device → bundle fetch fails
8. HTTP + DB OPK private-key scan

**Run:**
```bash
python tests/p1_opk_lifecycle.py \
  --base-url http://localhost:8082 \
  --db-url mysql://root:root123@127.0.0.1:3306/service_message_service_db
```

### P1-5: Group E2EE

**Status:** SIT script implemented — awaiting real backend run

**Test script:** `tests/p1_group_e2ee.py`

**Coverage:**
1. Enable group E2EE + distribute sender keys
2. Members fetch encrypted sender keys
3. Send encrypted group message
4. Plaintext blocked in E2EE group
5. Encrypted media blocked in E2EE group
6. Stale epoch rejected
7. Epoch rotation on re-enable
8. HTTP + DB plaintext scan

**Run:**
```bash
python tests/p1_group_e2ee.py \
  --base-url http://localhost:8082 \
  --db-url mysql://root:root123@127.0.0.1:3306/service_message_service_db
```

### P1-6: SIT/CI Gate Automation

**Status:** IMPLEMENTED

**Gate script:** `scripts/p1_sit_gate.py`

**CI workflow:** `.github/workflows/p1-sit.yml`

**Key changes in this release:**
- `pending` status now defaults to **FAIL** — missing scripts block P1 sign-off.
- `--allow-pending` flag allows continuation but outputs `NOT VALID FOR P1 SIGN-OFF`.
- `summary.md` distinguishes `pass`, `fail`, `pending`, `allowed-pending`, `allowed-fail`.
- Required scripts check runs before compose up — catches missing files early.
- Exit code logic:
  - `fail_count > 0` → exit 1
  - `pending_count > 0` without `--allow-pending` → exit 1
  - `allowed_pending_count > 0` → exit 1 (NOT VALID)
  - all pass → exit 0

**Required P1 scripts that must exist:**
- `tests/p1_opk_lifecycle.py`
- `tests/p1_private_multidevice_fanout.py`
- `tests/p1_group_e2ee.py`
- `tests/p1_db_plaintext_scan.py`

---

## P1 SIT Summary

To run the full P1 gate:

```bash
python scripts/p1_sit_gate.py \
  --base-url http://localhost:8082 \
  --db-url mysql://root:root123@127.0.0.1:3306/service_message_service_db
```

This orchestrates:
1. Prerequisites check (docker, flutter, cargo, rustc)
2. Required script existence check
3. `docker-compose.sit.yml up` (mysql, redis, migrate, api-server)
4. Wait for health
5. Run migrations
6. Build Rust E2EE FFI (`cargo build -p im-e2ee-ffi --release`)
7. P0 gate (`scripts/p0_gate.py`)
8. P0 E2EE SIT (`tests/p0_e2ee_private_text_acceptance.py`)
9. P1 OPK lifecycle (`tests/p1_opk_lifecycle.py`)
10. P1 Multi-device fan-out (`tests/p1_private_multidevice_fanout.py`)
11. P1 Group E2EE (`tests/p1_group_e2ee.py`)
12. P1 DB plaintext scan (`tests/p1_db_plaintext_scan.py`)

### Full Validation Commands

```bash
cd rust
cargo fmt --check
cargo check --workspace
cargo test --workspace

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

---

## Out of Scope for P1

These items are explicitly excluded from P1 and will NOT be accepted as P1 deliverables:

| Item | Reason |
|---|---|
| Encrypted media (image/video/voice) | P0-4 disabled; P1 blocks encrypted media in E2EE groups |
| Full audio/video/file playback | Requires media pipeline; out of scope |
| Enterprise compliance audit | Future work |
| Advanced key backup (cloud sync) | Basic key backup is P0; advanced is future |
| MLS (Messaging Layer Security) | Current protocol is X3DH + Double Ratchet + Sender Key |
| Admin force-decrypt | Server-side decryption is architecturally impossible by design |

---

## Known Risks

1. **Sender-side multi-device sync**: The backend supports device envelope fan-out, but
   if Alice has two active devices, the sender-side sync envelope for device-a2 depends
   on the client-side implementation. The SIT script `p1_private_multidevice_fanout.py`
   tests this path and will FAIL if the backend doesn't store sender-side sync data.
2. **Group sender key decryption**: The Rust E2EE FFI (`im-e2ee-ffi`) primary mode is
   X3DH pairwise. Group E2EE uses sender keys which may require additional FFI support.
   The group SIT tests API enforcement (epoch, plaintext blocking, media blocking) and
   will be enhanced when sender key FFI is available.
3. **Secure storage key enumeration**: Not all platforms support enumerating secure
   storage keys. The mobile sent-message cache uses SharedPreferences metadata to track
   what to clean up.

---

## Sign-Off Requirements

For P1 to be marked **PASS**:

- [ ] All P1 SIT scripts exist and run without pending/skip
- [ ] `scripts/p1_sit_gate.py` exits 0 WITHOUT `--allow-pending`
- [ ] Zero DB plaintext violations
- [ ] Zero HTTP plaintext violations
- [ ] Rust: `cargo fmt --check && cargo check --workspace && cargo test --workspace` passes
- [ ] Flutter: `flutter analyze && flutter test` passes for all packages/apps
- [ ] P0 gate regression passes

If any of these cannot be satisfied, P1 is **PARTIAL** or **FAIL** — never PASS.

---

## Changelog

| Date | Change |
|---|---|
| 2026-06-16 | Initial P1-1 report (mobile sent cache). |
| 2026-06-16 | Added P1 SIT gate hardening: pending → fail, `--allow-pending`, `check_required_scripts`. |
| 2026-06-16 | Added `tests/p1_opk_lifecycle.py` (8 scenarios). |
| 2026-06-16 | Added `tests/p1_private_multidevice_fanout.py` (6 scenarios). |
| 2026-06-16 | Added `tests/p1_group_e2ee.py` (9 scenarios). |
| 2026-06-16 | Added `tests/p1_db_plaintext_scan.py` (unified scan across 6 tables). |
| 2026-06-16 | Converted report from P1-1 single-PR to full P1 acceptance report. |
