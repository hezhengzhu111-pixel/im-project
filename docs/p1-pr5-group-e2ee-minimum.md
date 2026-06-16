# P1 PR5: Group E2EE Minimum Link

## Goal

Ship the smallest production-safe group E2EE path around the existing sender-key design. The server remains ciphertext-only and never decrypts, reconstructs, or falls back to plaintext for encrypted group messages.

## Epoch Policy

`service_user_service_db.e2ee_group_epochs` is the source of the current group E2EE epoch.

- Enabling group E2EE creates the next epoch and stores sender keys for that epoch.
- Disabling group E2EE advances the epoch, clears active sender keys, and marks the group plaintext.
- Membership add/remove advances the epoch when the group is currently encrypted.
- Sender key rows include `epoch`; clients must fetch keys matching the message epoch.

Group message envelopes use the Rust v2 `keyVersion` field as the explicit group epoch in this minimum implementation.

## Send Validation

Encrypted group sends require:

- `encrypted=true` or an existing encrypted group status;
- a Rust v2 `e2eeEnvelope`;
- blank plaintext `content`;
- `messageType` of `TEXT` or `SYSTEM`;
- envelope `keyVersion` equal to the current group epoch.

Group media in encrypted mode is unsupported and fails closed.

## Sender Keys

`e2ee_sender_keys` stores one encrypted sender-key record per group/sender device/recipient/epoch. The server stores only ciphertext key material and public routing metadata.

`GET /api/e2ee/groups/:group_id/sender-keys` returns `epoch` with each key so clients can choose the key that matches message history.

## Disable / Reuse Guard

Disabling group E2EE deletes active sender key rows and advances the epoch. Old keys are no longer returned by the active sender-key API and cannot satisfy future encrypted group sends because the message envelope epoch must equal the current epoch.

## Regression Notes

- No plaintext fallback is introduced.
- Group encrypted media remains unsupported.
- The current implementation keeps the message DTO shape unchanged and carries epoch in `e2eeEnvelope.keyVersion`.
