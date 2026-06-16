# P1 PR4: Private Multi-Device Fan-Out

## Goal

Private E2EE sends must support one encrypted envelope per recipient device while preserving the P0 rule: encrypted sends never fall back to plaintext and the server never decrypts or reconstructs message content.

## API Contract

`POST /api/messages/send/private` accepts:

- `e2eeEnvelope`: legacy single-device compatibility path.
- `e2eeEnvelopes`: batch path, shaped as `[{ recipientUserId, recipientDeviceId, envelope }]`.

When `e2eeEnvelopes` is present, `e2eeEnvelope` must be absent. The single-envelope compatibility path is normalized as a one-device batch and is rejected if it names multiple recipient devices.

Encrypted private sends reject:

- plaintext `content`;
- legacy E2EE header fields;
- duplicate recipient devices;
- recipient users outside the private conversation participants;
- sender devices that are missing, inactive, or not owned by the sender;
- recipient devices that are missing, inactive, revoked, or owned by the wrong user.

Sender-sync envelopes are represented by batch items whose `recipientUserId` is the sender user ID. Recipient fan-out uses batch items whose `recipientUserId` is the peer user ID.

## Persistence

The existing `service_message_service_db.message_deliveries` table is the per-device envelope store. Each accepted batch item writes one row:

- `message_id`: server message ID;
- `device_id`: target recipient device ID;
- `ciphertext`: Rust `wire` payload for operational lookup;
- `header`: full serialized Rust v2 envelope JSON.

The table now has a unique `(message_id, device_id)` key so writer replays update the existing device envelope instead of producing duplicates.

The `messages.e2ee_envelope_json` column remains as a compatibility field for old clients and API responses. It is not the source of truth for multi-device history.

## History Recovery

Private history accepts optional `deviceId` / `device_id`. When present, encrypted messages are overlaid with only the matching per-device envelope from `message_deliveries`; if no envelope exists for that device, the response clears `e2eeEnvelope` rather than exposing another device envelope.

Clients should send the active local device ID when loading encrypted history. Older clients that omit `deviceId` continue receiving the compatibility envelope.

## Client Orchestration

Clients obtain active device lists through the existing device APIs:

- `GET /api/keys/devices?userId=<recipient>`;
- `GET /api/keys/devices` for the current sender user.

For every target device, clients reuse the current single-recipient Rust envelope creation. PR4 does not rewrite Rust crypto.

## Real-Time Delivery Boundary

The message writer persists per-device envelopes and DB history filters them. The current push dispatcher still plans private pushes at user granularity, so device-specific WebSocket payload selection requires the gateway/device routing layer to pass a connected device ID into payload rendering. Until that lands, encrypted clients should recover authoritative per-device envelopes from history with `deviceId`.

## Regression Notes

- Plaintext fallback remains forbidden for encrypted private sends.
- The server stores public device metadata and ciphertext envelopes only.
- Revoked or inactive devices are rejected during send validation and receive no new device envelope rows.
