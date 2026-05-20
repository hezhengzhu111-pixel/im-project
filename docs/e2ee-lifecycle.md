# Mobile E2EE Lifecycle

This document describes the React Native E2EE key/session lifecycle and the
recovery rules around Rust ratchet state.

## Startup Readiness Gate

After `login` or `restoreSession` succeeds, mobile side effects run in this
order:

1. `useChatStore.getState().bootstrap()`
2. `ensureE2eeReadyForCurrentUser()`
3. `useWebsocketStore.getState().connect()`

`ensureE2eeReadyForCurrentUser()` is scoped by both `currentUser.id` and
`authStore.sessionGeneration`. A promise from a previous user or previous auth
generation is never reused. If there is no current user, readiness fails
explicitly.

Readiness failures are logged with `logger.warn`; login/restore continues and
WebSocket may still connect. Encrypted messages received before readiness is
fully healthy must remain pending/retryable, not permanently failed.

`websocketStore.onopen` keeps a compensation readiness call, but it is no longer
the only initialization path. Compensation failures are warned instead of being
silently swallowed.

## Keychain, MMKV, And Memory Cache

The storage roles are:

- Keychain: durable secure storage for device id, local key material, encrypted
  session metadata, and encrypted Rust session state envelopes.
- MMKV: non-secret index metadata used to find account-scoped encrypted entries
  for cleanup.
- Memory maps: process-local cache only. Memory must not report success before
  Keychain writes succeed.

`setSecure()` writes Keychain first and updates memory only after a successful
Keychain result. `removeEncrypted()` is async and propagates Keychain deletion
failures to callers. Account cleanup uses best-effort all-settled deletion and
logs sanitized warnings for partial failures.

## Rust Session State Commit Order

Rust ratchet memory state advances during `encrypt()` and `decrypt()`. Mobile
therefore treats export and secure storage persistence as a hard commit boundary:

1. Restore or create the Rust session.
2. Encrypt/decrypt.
3. `exportSession(sessionId)`.
4. `e2eeSessionStore.saveSessionState(...)`.
5. Only then return the envelope/plaintext and mark local status encrypted.

If export or save fails, the error message includes `storage persist`, so
`classifyE2eeError()` treats it as storage and retryable. `encryptToEnvelope()`
does not return an envelope on commit failure. `decryptEnvelope()` does not
return plaintext on commit failure; `messageProcessor` keeps the raw encrypted
message pending for retry.

## Pending Encrypted Message Recovery

`pendingDecryptStore` is runtime acceleration. It does not own durable encrypted
message bodies.

The durable source is `messageRepository`, which stores encrypted messages with
sanitized display fields and the raw encrypted `e2eeEnvelope` in `rawJson`.
Startup, foreground reconciliation, WebSocket open, and session open scan
`messageRepository.listPendingEncryptedMessages()` and refill the runtime
pending queue.

Pending queue rules:

- Store only encrypted envelope/raw JSON, never decrypted plaintext.
- On successful retry, remove the runtime pending entry.
- On negotiation rejected/disabled/reset, clear the session runtime pending
  entries.
- On logout/session clear, clear all runtime pending entries for the current
  account along with the local message cache.

## Negotiation Status vs Ratchet Readiness

`status = "encrypted"` means the negotiation has been accepted. It does not
guarantee Rust ratchet state exists.

Use:

- `hasSessionState(sessionId)` for a boolean state check.
- `getSessionCryptoReadiness(sessionId)` for one of:
  - `"none"`: no accepted negotiation and no Rust session state.
  - `"accepted"`: negotiation accepted, but no persisted ratchet state yet.
  - `"ratchet_ready"`: persisted Rust session state exists.

Inbound sessions may be `"accepted"` until the first encrypted message with a
handshake arrives. `decryptEnvelope()` can create the inbound session from that
handshake and then persist ratchet state. Messages with no state and no
handshake remain pending rather than becoming permanently failed.

Outbound sessions may create and persist ratchet state during the first
`encryptToEnvelope()` call if no session state exists yet.

## Verification Commands

Run Rust checks from `backend/`:

```bash
cargo fmt --check
cargo test -p e2ee-core
cargo test -p e2ee-ffi
cargo clippy -p e2ee-core --all-targets -- -D warnings
cargo clippy -p e2ee-ffi --all-targets -- -D warnings
```

Run mobile checks from `frontend/apps/mobile/`:

```bash
npx jest --runInBand --testPathPattern="mobileRustE2eeRuntime"
npx jest --runInBand --testPathPattern="mobileE2ee"
npx jest --runInBand --testPathPattern="messageProcessor.e2ee"
```

Run TypeScript checks from `frontend/`:

```bash
npm run mobile:typecheck
```

Do not use `npm run mobile:test -- --testPathPattern=...`; that path does not
reliably forward Jest arguments through the workspace script chain.
