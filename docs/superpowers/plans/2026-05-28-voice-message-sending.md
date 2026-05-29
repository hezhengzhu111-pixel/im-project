# Voice Message Sending Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the SnackBar placeholder in `onSendVoice` with actual VOICE message sending.

**Architecture:** Follow the existing IMAGE/FILE sending pattern — upload audio via FileApi, then call `sendMessage`/`sendGroupMessage` with `messageType: 'VOICE'` and media metadata. Add `duration` field to request classes since the `Message` model already supports it.

**Tech Stack:** Flutter/Dart, Riverpod

---

## Files to Modify

| File | Change |
|------|--------|
| `flutter/apps/web/lib/features/chat/data/message_api.dart` | Add `duration` to `SendPrivateMessageRequest` and `SendGroupMessageRequest` |
| `flutter/apps/web/lib/features/chat/presentation/chat_provider_with_outbox.dart` | Add `duration` parameter to `sendMessage` and `sendGroupMessage` |
| `flutter/apps/web/lib/features/chat/presentation/chat_page.dart` | Replace `onSendVoice` SnackBar with actual VOICE message sending |

---

### Task 1: Add `duration` field to message request classes

**Files:**
- Modify: `flutter/apps/web/lib/features/chat/data/message_api.dart:3-34, 36-67`

- [ ] **Step 1: Add `duration` to `SendPrivateMessageRequest`**

Add `this.duration` to the constructor and `duration` to `toJson()`:

```dart
class SendPrivateMessageRequest {
  const SendPrivateMessageRequest({
    required this.receiverId,
    required this.content,
    this.messageType = 'text',
    this.clientMessageId,
    this.mediaUrl,
    this.mediaName,
    this.mediaSize,
    this.thumbnailUrl,
    this.duration,
  });

  final String receiverId;
  final String content;
  final String messageType;
  final String? clientMessageId;
  final String? mediaUrl;
  final String? mediaName;
  final int? mediaSize;
  final String? thumbnailUrl;
  final int? duration;

  Map<String, dynamic> toJson() => {
        'receiverId': receiverId,
        'content': content,
        'messageType': messageType,
        if (clientMessageId != null) 'clientMessageId': clientMessageId,
        if (mediaUrl != null) 'mediaUrl': mediaUrl,
        if (mediaName != null) 'mediaName': mediaName,
        if (mediaSize != null) 'mediaSize': mediaSize,
        if (thumbnailUrl != null) 'thumbnailUrl': thumbnailUrl,
        if (duration != null) 'duration': duration,
      };
}
```

- [ ] **Step 2: Add `duration` to `SendGroupMessageRequest`**

Same pattern:

```dart
class SendGroupMessageRequest {
  const SendGroupMessageRequest({
    required this.groupId,
    required this.content,
    this.messageType = 'text',
    this.clientMessageId,
    this.mediaUrl,
    this.mediaName,
    this.mediaSize,
    this.thumbnailUrl,
    this.duration,
  });

  final String groupId;
  final String content;
  final String messageType;
  final String? clientMessageId;
  final String? mediaUrl;
  final String? mediaName;
  final int? mediaSize;
  final String? thumbnailUrl;
  final int? duration;

  Map<String, dynamic> toJson() => {
        'groupId': groupId,
        'content': content,
        'messageType': messageType,
        if (clientMessageId != null) 'clientMessageId': clientMessageId,
        if (mediaUrl != null) 'mediaUrl': mediaUrl,
        if (mediaName != null) 'mediaName': mediaName,
        if (mediaSize != null) 'mediaSize': mediaSize,
        if (thumbnailUrl != null) 'thumbnailUrl': thumbnailUrl,
        if (duration != null) 'duration': duration,
      };
}
```

- [ ] **Step 3: Commit**

```bash
git add flutter/apps/web/lib/features/chat/data/message_api.dart
git commit -m "feat(chat): add duration field to message request classes"
```

---

### Task 2: Add `duration` parameter to notifier methods

**Files:**
- Modify: `flutter/apps/web/lib/features/chat/presentation/chat_provider_with_outbox.dart:464-577, 579-642`

- [ ] **Step 1: Add `duration` to `sendMessage`**

Update the method signature and pass `duration` to the request and pending message:

In `sendMessage` (line 464), add `int? duration` parameter:

```dart
Future<Message?> sendMessage(String receiverId, String content,
    {String messageType = 'text',
    String? clientMessageId,
    String? mediaUrl,
    String? mediaName,
    int? mediaSize,
    String? thumbnailUrl,
    int? duration}) async {
```

Add `duration: duration` to the `pendingMessage` constructor (around line 493):

```dart
final pendingMessage = Message(
  // ... existing fields ...
  duration: duration,
);
```

Add `duration: duration` to the `SendPrivateMessageRequest` call (around line 537):

```dart
serverMessage = await _messageApi.sendPrivateMessage(
  SendPrivateMessageRequest(
    receiverId: receiverId,
    content: content,
    messageType: messageType,
    clientMessageId: cid,
    mediaUrl: mediaUrl,
    mediaName: mediaName,
    mediaSize: mediaSize,
    thumbnailUrl: thumbnailUrl,
    duration: duration,
  ),
);
```

- [ ] **Step 2: Add `duration` to `sendGroupMessage`**

Same pattern for `sendGroupMessage` (line 579):

```dart
Future<Message?> sendGroupMessage(String groupId, String content,
    {String messageType = 'text',
    String? clientMessageId,
    String? mediaUrl,
    String? mediaName,
    int? mediaSize,
    String? thumbnailUrl,
    int? duration}) async {
```

Add `duration: duration` to the `pendingMessage` constructor and `SendGroupMessageRequest` call.

- [ ] **Step 3: Commit**

```bash
git add flutter/apps/web/lib/features/chat/presentation/chat_provider_with_outbox.dart
git commit -m "feat(chat): add duration parameter to sendMessage and sendGroupMessage"
```

---

### Task 3: Implement `onSendVoice` in ChatPage

**Files:**
- Modify: `flutter/apps/web/lib/features/chat/presentation/chat_page.dart:379-383`

- [ ] **Step 1: Replace SnackBar with VOICE message sending**

Replace the `onSendVoice` callback to follow the same pattern as `onSendImage` and `onSendFile`:

```dart
onSendVoice: (result) {
  if (session == null) return;
  if (isGroup) {
    ref.read(chatStateProvider.notifier).sendGroupMessage(
          session.targetId,
          '',
          messageType: 'VOICE',
          mediaUrl: result.url,
          mediaName: result.name,
          mediaSize: result.size,
        );
  } else {
    ref.read(chatStateProvider.notifier).sendMessage(
          session.targetId,
          '',
          messageType: 'VOICE',
          mediaUrl: result.url,
          mediaName: result.name,
          mediaSize: result.size,
        );
  }
},
```

Note: `duration` is intentionally omitted because `UploadResult` does not have a `duration` field and the task explicitly says not to fabricate it. The `Message` model's `duration` will be `null`, which the `VoiceBubble` already handles (displays `0.0s`).

- [ ] **Step 2: Commit**

```bash
git add flutter/apps/web/lib/features/chat/presentation/chat_page.dart
git commit -m "feat(chat): implement voice message sending"
```

---

## Field Mapping

| Field | Source | Value |
|-------|--------|-------|
| `messageType` | Constant | `'VOICE'` |
| `content` | Empty string | `''` |
| `mediaUrl` | `UploadResult.url` | Audio file URL from server |
| `mediaName` | `UploadResult.name` | Original filename |
| `mediaSize` | `UploadResult.size` | File size in bytes |
| `duration` | Not available | `null` (not fabricated per task rules) |
| `thumbnailUrl` | `UploadResult.thumbnailUrl` | `null` for audio |

---

## Verification

```bash
cd flutter/apps/web
flutter analyze
flutter test
```

Manual verification:
1. Open a private chat, record and send a voice message → VOICE message appears
2. Open a group chat, record and send a voice message → VOICE message appears
3. Send an image and a file → still works (no regression)
