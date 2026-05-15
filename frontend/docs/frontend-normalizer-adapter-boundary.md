# Frontend Normalizer and Adapter Boundary

This document is the phase 2 boundary contract for DTO normalization and
platform adaptation. It is the engineering rule set for later Mimo batch
changes.

## Boundary Summary

| Layer | Direction | Allowed responsibility | Forbidden responsibility |
| --- | --- | --- | --- |
| `frontend/packages/shared-normalizers/src` | raw API DTO to shared domain model | Accept backend and legacy raw DTO shapes, resolve field aliases, coerce primitive values, build `@im/shared-types` models | Add mobile-only fields or web-only fields |
| `frontend/apps/web/src/normalizers` | shared export surface for web | Re-export functions from `@im/shared-normalizers` and shared pure helpers | Re-implement raw field compatibility, duplicate alias fallbacks, parse raw DTO fields |
| `frontend/apps/mobile/src/adapters` | shared domain model to mobile platform model, and mobile local model back to shared | Map shared models to React Native cache, route, storage, and display models | Re-implement backend raw DTO compatibility for shared fields |
| `frontend/apps/mobile/src/utils/normalizers.ts` | mobile barrel | Re-export adapter functions and shared primitive helpers | Add normalization logic |
| stores, services, screens | business flow | Call the correct normalizer or adapter | Inline DTO compatibility, platform mapping, type-shape repair |

## Shared Normalizers

`@im/shared-normalizers` is the only entry point for raw API DTO to shared
domain model conversion.

Shared normalizers must:

- Own backend field compatibility such as camelCase, snake_case, nested objects,
  and legacy raw response shapes.
- Return canonical shared models from `@im/shared-types`.
- Normalize primitive values with shared helpers such as `asString`, `asNumber`,
  `asBoolean`, and `isRecord`.
- Keep all message, chat, user, group, friend request, and moments raw DTO
  compatibility in package-level normalizers, except the explicitly mobile-only
  friend request aliases listed below.
- Keep `Message` free of `serverId`.
- Keep shared `User` free of `region`; use `User.location` as the canonical
  shared field.

Shared normalizers must not:

- Emit mobile cache fields such as `serverId`, message-level `conversationId`,
  or `rawJson`.
- Encode React Native navigation, SQLite, storage, or local routing concerns.
- Add web-only aliases.

## Web Normalizers

Web normalizers are re-export files only.

Allowed examples:

```ts
export { normalizeMessage } from '@im/shared-normalizers';
export { buildSessionId } from '@im/shared-im-core';
```

Web normalizers must not:

- Import raw DTO types to implement compatibility logic.
- Call `asString`, `asNumber`, `asBoolean`, or `isRecord` for DTO repair.
- Read aliases such as `message_id`, `sender_id`, `created_at`, or `media_url`.
- Introduce web-specific defaults that differ from shared normalizers.

## Mobile Adapters

Mobile adapters map shared domain models to mobile platform models.

Mobile adapters may:

- Map shared `Message.messageId` to mobile `MobileMessage.serverId` as a local
  platform alias.
- Preserve message-level `conversationId` only for local cache buckets,
  navigation, and route resolution.
- Preserve `rawJson` only for debugging or local persistence.
- Map mobile-only legacy user `region` into shared `User.location`.
- Map mobile-only legacy friend request fields into the shared canonical model:
  `requestId` to `id`, `fromUserId` to `applicantId`, and `createdAt` to
  `createTime`.

Mobile adapters must not:

- Re-resolve raw backend aliases for shared fields after a shared normalizer
  already exists.
- Add `serverId` to shared `Message`.
- Add `region` to shared `User`.
- Treat `rawJson` as a source for domain normalization.
- Push adapter fields into stores, services, or screens.

## Forbidden Locations

Raw DTO compatibility is forbidden in:

- `frontend/apps/web/src/normalizers/**`, except direct re-exports.
- `frontend/apps/mobile/src/adapters/**`, except mobile-only platform metadata
  and mobile local model to shared model conversion.
- `frontend/apps/mobile/src/utils/normalizers.ts`, except barrel exports.
- `frontend/apps/**/src/stores/**`.
- `frontend/apps/**/src/services/**`.
- `frontend/apps/**/src/screens/**`.
- `frontend/apps/**/src/components/**`.

Platform-only fields are forbidden in:

- `frontend/packages/shared-types/src/message.ts`: no `serverId`.
- `frontend/packages/shared-types/src/user.ts`: no shared `User.region`.
- `frontend/packages/shared-normalizers/src/**`: no mobile cache or route
  fields.

## Field Mapping Rules

| Incoming or platform field | Canonical shared field | Owner | Notes |
| --- | --- | --- | --- |
| `id`, `messageId`, `message_id` | `Message.id`, `Message.messageId` | shared-normalizers | `serverId` is not part of shared `Message`. |
| `clientMessageId`, `client_message_id` | `Message.clientMessageId` | shared-normalizers | Used for optimistic send merge. |
| `senderId`, `sender_id`, `sender.id` | `Message.senderId` | shared-normalizers | Adapter consumes the resolved shared value. |
| `receiverId`, `receiver_id`, `receiver.id` | `Message.receiverId` | shared-normalizers | Adapter consumes the resolved shared value. |
| `groupId`, `group_id`, `group.id` | `Message.groupId` | shared-normalizers | Also drives `Message.isGroupChat`. |
| `sendTime`, `send_time`, `createdAt`, `created_at` | `Message.sendTime` | shared-normalizers | Fractional seconds are normalized in shared code. |
| `mediaUrl`, `media_url`, `extra.url` | `Message.mediaUrl` | shared-normalizers | Media fallback stays centralized. |
| `readByCount`, `read_by_count` | `Message.readByCount` | shared-normalizers | Numeric coercion stays centralized. |
| `encrypted`, `e2ee_header`, `e2eeHeader` | `Message.encrypted`, `Message.e2eeHeader` | shared-normalizers | E2EE DTO compatibility stays centralized. |
| `conversationId`, `conversation_id` for sessions | `ChatSession.conversationId` | shared-normalizers | Server conversation identity for shared sessions. |
| message-level `conversationId` | `MobileMessage.conversationId` | Mobile adapter | Local cache, navigation, and route field only. |
| `serverId`, `server_id` | `MobileMessage.serverId` | Mobile adapter | Local alias for `Message.messageId`; never add to shared `Message`. |
| `rawJson` | `MobileMessage.rawJson` | Mobile adapter | Debug or storage payload only. |
| `region` from mobile local user shape | `User.location` | Mobile adapter | Do not add `User.region`. |
| `region` from raw API user DTO | `User.location` | shared-normalizers | Raw DTO alias only; shared output remains `location`. |
| `requestId` from mobile local friend request shape | `FriendRequest.id` | Mobile adapter | Mobile local alias only. |
| `fromUserId` from mobile local friend request shape | `FriendRequest.applicantId` | Mobile adapter | Mobile local alias only. |
| `createdAt` from mobile local friend request shape | `FriendRequest.createTime` | Mobile adapter | Mobile local alias only. |
| other friend request raw API fields | `FriendRequest` canonical fields | shared-normalizers | Do not use this row for mobile-only `requestId`, `fromUserId`, or `createdAt`. |

## Ownership Decision Table

| Field family | Belongs to shared-normalizers | Belongs to Mobile adapter |
| --- | --- | --- |
| Backend message id aliases | Yes: `id`, `messageId`, `message_id` to shared `Message` | No, except exposing `messageId` as `serverId` |
| Backend sender, receiver, and group aliases | Yes | No |
| Backend send time aliases | Yes | No |
| Backend media aliases | Yes | No |
| Backend read receipt aliases | Yes | No |
| Backend E2EE aliases | Yes | No |
| Web normalizer aliases | No | No |
| Mobile `serverId` | No | Yes, platform alias for `Message.messageId` |
| Mobile message `conversationId` | No | Yes, local cache and route field |
| Mobile `rawJson` | No | Yes, debug or local storage field |
| Mobile user `region` | No shared field | Yes, map to `User.location` |
| Mobile friend request `requestId` | No shared field | Yes, map to `FriendRequest.id` |
| Mobile friend request `fromUserId` | No shared field | Yes, map to `FriendRequest.applicantId` |
| Mobile friend request `createdAt` | No shared field | Yes, map to `FriendRequest.createTime` |

## Mimo Task Execution Constraints

For later Mimo batch changes:

1. Classify the source and target before editing:
   raw DTO to shared model goes to `shared-normalizers`; shared model to mobile
   model goes to mobile adapters; web normalizers stay re-exports.
2. Add a backend compatibility alias in exactly one shared normalizer and cover
   it with the matching shared-normalizer test.
3. Add a mobile-only platform field only in the mobile adapter and keep it out
   of shared types.
4. Do not modify stores, services, screens, or components to repair DTO shape.
   Those layers call the boundary function.
5. Do not add TypeScript `any`, do not weaken type checks, and do not relax
   `tsconfig`.
6. Do not edit generated files such as `auto-imports.d.ts`, `components.d.ts`,
   or build output.
7. When touching web normalizer files, the expected diff is a re-export change
   only.
8. When touching mobile adapters, the expected diff is platform mapping only;
   repeated raw aliases for shared fields must be moved to shared-normalizers.
