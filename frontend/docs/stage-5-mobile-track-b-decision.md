# Stage 5 Mobile Track B Decision

**Decision date**: 2026-05-16

**Decision owner**: Principal Security Architect

**Decision**: Track B is not allowed to start. Mobile remains on Track A. Track C may only be used for non-protocol status/display work after Codex explicitly scopes it.

This decision is based on `frontend-e2ee-strategy-boundary.md`, `stage-5-mobile-full-e2ee-readiness.md`, `frontend/apps/mobile/package.json`, `frontend/apps/mobile/src/services/storage/secureStorage.ts`, and the current Web E2EE engine/store/manager implementation under `frontend/apps/web/src/features/e2ee/`.

## 1. Track B Gate Verdict

| Gate | Verdict | Reason |
|------|---------|--------|
| RN crypto available and testable | Blocked | Mobile has no verified WebCrypto-compatible runtime for P-256 ECDH, ECDSA P-256, HKDF, AES-GCM with AAD, import/export raw/JWK, or CSPRNG. |
| Private keys safely persisted | Blocked | Current `secureStorage` has memory fallback and is scoped to auth/cookie data, not E2EE long-term keys. |
| Ratchet state safely persisted | Blocked | Mobile has no encrypted SQLite schema, wrapping key lifecycle, skipped-key storage, or transaction/rollback policy. |
| Web/Mobile payload compatibility | Blocked | No test vectors prove X3DH root key equality, Double Ratchet header/counter compatibility, media metadata wrapping, or binary/base64 parity. |
| Negotiation event semantics complete | Blocked | Mobile currently treats negotiation as deferred; request/accepted/rejected/disabled side effects for Mobile are not protocol-approved. |
| Web E2EE not broken | Blocked | No cross-platform test matrix protects existing Web WebCrypto/IndexedDB behavior from shared engine migration. |
| Test matrix exists | Blocked | Readiness identifies missing true Web/Mobile crypto, persistence, restart, counter gap, offline retry, and Keychain/Keystore tests. |
| Rollback strategy exists | Blocked | No key deletion, device revocation, failed migration rollback, or encrypted-session recovery strategy is approved. |

Track B requires all gates to be green. The current state has zero green gates for protocol implementation.

## 2. Required Decisions

### 2.1 Is Track B allowed?

No. Track B is denied for stage five. Mimo must not implement Mobile encryption, decryption, X3DH, Double Ratchet, media encryption, key bundle upload, negotiation accept/reject protocol behavior, Ratchet persistence, or key migration.

### 2.2 Are new dependencies needed?

For this task: no dependencies may be added.

For a future Track B proposal: likely yes, but only after Codex validates a concrete stack. Candidate dependencies named in the readiness report, such as `react-native-quick-crypto`, `react-native-get-random-values`, and a Buffer polyfill, are not approved for implementation yet because their P-256, ECDSA, HKDF, AES-GCM AAD, raw/JWK import-export, and test-environment behavior remain unverified.

### 2.3 Is `shared-e2ee-core` needed?

It already exists and remains limited to pure contract/guard helpers. No new package creation is required. Its current scope must not be expanded beyond status types, error codes/categories, error classification, encrypted marker detection, log sanitization, and plaintext-downgrade guards.

### 2.4 Should Web E2EE engine migrate?

No. Web E2EE engine must not migrate. Web currently relies on browser `CryptoKey`, non-extractable identity keys, IndexedDB structured clone, JWK serialization, Web Worker media encryption, and browser File/Blob APIs. Moving those into shared code before RN crypto/storage ports and test vectors are proven would increase risk and violate E12, E13, E17, E30, and E32.

### 2.5 Is backend support required?

Yes, for future full Track B. Existing key bundle and negotiation APIs may be reusable, but Track B still needs protocol-level confirmation for Mobile device bundle registration, OPK lifecycle, bundle format compatibility, multi-device selection semantics, negotiation event payload completeness, disable/reject/renegotiation behavior, and device revocation. Mimo must not assume current APIs are sufficient for full Mobile E2EE.

### 2.6 What can Mimo implement?

Mimo may continue non-protocol Track A/limited Track C tasks:

- Mobile encrypted status/capability display.
- Deferred copy and UX for encrypted sessions/messages.
- Encrypted message masking across list/detail/search/notification/cache paths.
- Pending encrypted payload blocking and tests.
- `E2EE_NEGOTIATION` deferred dispatch/logging/status tests.
- Shared normalizer tests for encrypted fields.
- Use of existing `@im/shared-e2ee-core` pure helpers.
- Documentation and readiness evidence updates.

Mimo must not add crypto dependencies as part of these tasks.

### 2.7 What remains Codex-only?

Codex retains:

- RN crypto/runtime selection and native dependency approval.
- Web/Mobile X3DH and Double Ratchet test vector design.
- Identity key extractability and storage security decision.
- Wrapping key lifecycle and Keychain/Keystore design.
- Encrypted SQLite schema and Ratchet transaction/rollback policy.
- OPK lifecycle and multi-device protocol semantics.
- Mobile device identity and bundle registration protocol behavior.
- Media key wrapping and large-file encryption strategy.
- Backend protocol changes for negotiation, device revocation, OPK, and multi-device support.
- Any migration of Web E2EE engine into shared executable code.
- Final E2EE security audit.

## 3. Blockers

1. No approved RN WebCrypto-compatible implementation.
2. No safe E2EE key storage layer without memory fallback.
3. No encrypted Ratchet state persistence and no transaction/rollback design.
4. No Web/Mobile X3DH and Double Ratchet compatibility vectors.
5. No Mobile protocol semantics for negotiation accept/reject/disable/renegotiate.
6. No backend confirmation for OPK lifecycle, Mobile device identity, and multi-device behavior.
7. No complete test matrix or rollback strategy.

## 4. Boundary Update

`frontend-e2ee-strategy-boundary.md` E4, E6, and E7 are updated to record this denial. Track A remains the active stage-five policy. Track C remains a non-protocol future transition only. Track B cannot begin until Codex replaces this report with an approval report and updates E4/E6/E7.
