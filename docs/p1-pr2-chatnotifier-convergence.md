# P1 PR2: Web / Mobile ChatNotifier Convergence

## Goal

Web and Mobile now use the shared `ChatNotifier` from `im_shared_features`. Platform-specific persistence remains behind adapters:

- Web IndexedDB outbox is exposed as shared `OutboxPort`.
- Web IndexedDB sent-message cache is exposed as shared `SentMessageCachePort`.
- Mobile keeps its SharedPreferences/secure-storage adapters from PR1.

## Behavior Alignment

| Capability | Previous Web `ChatNotifierWithOutbox` | Shared `ChatNotifier` after PR2 |
| --- | --- | --- |
| Send private text | Web notifier directly called Web `MessageApi` | Shared notifier calls shared `MessageApi` |
| Encrypted private send | Web notifier encrypted and sent one envelope | Shared notifier keeps same single-envelope behavior |
| Decrypt incoming | Web notifier decrypted WS/history messages | Shared notifier owns decrypt path |
| Own history recovery | Web `E2eeSentMessageCache` | Shared `SentMessageCachePort` adapter wraps the Web cache |
| Outbox enqueue/retry | Web `MessageOutbox` implementation | Web `WebOutboxPort` implements shared `OutboxPort` |
| Read receipt | Web notifier marked normalized conversation id | Shared notifier owns mark-read behavior |
| E2EE negotiation | Web notifier maintained pending negotiation map | Shared notifier exposes equivalent lookup helpers |
| Session status sync | Web notifier synced through E2EE manager | Shared notifier owns sync path |

## Implementation Notes

- Web `chatStateProvider` now returns `StateNotifierProvider<ChatNotifier, ChatState>`.
- UI imports remain pointed at Web provider barrels, so page layout and call sites stay stable.
- The old Web notifier file is retained for characterization tests and rollback comparison during P1. It should be deleted only after PR2 regression coverage is fully ported.
- Web network state stays Web-local. It updates shared chat state's `isOffline` and triggers retry through `retryPendingOutboxIfNeeded`.

## Non-Goals

- No multi-device E2EE fan-out.
- No OPK lifecycle changes.
- No group E2EE enablement.
- No encrypted media.
- No plaintext fallback for encrypted messages.

## Verification

Run:

```bash
cd flutter/packages/shared_features
flutter analyze
flutter test

cd flutter/apps/web
flutter analyze
flutter test test/features/chat/presentation/message_input_test.dart
flutter test test/widgets/message_input_test.dart
flutter test test/a11y/semantics_test.dart
flutter test test/core/debug/debug_panel_test.dart
```
