# 文件消息发送设计

**日期**: 2026-05-28
**状态**: 已批准

## 目标

将 Flutter Web `ChatPage` 中 `onSendFile` 从 SnackBar 占位改为真正发送 FILE 消息，与 Vue Web 行为一致。

## 现状

- `onSendImage` 已完整实现，调用 `sendMessage`/`sendGroupMessage` 发送 IMAGE 消息
- `onSendFile` 仅显示 "文件发送中" SnackBar，未实际发送消息
- `onSendVoice` 同样是占位（不在本任务范围内）

## 改动

**唯一改动文件**: `flutter/apps/web/lib/features/chat/presentation/chat_page.dart`

将 `onSendFile` 回调从 SnackBar 占位改为复用 `onSendImage` 的发送模式：

```dart
onSendFile: (result) {
  if (session == null) return;
  if (isGroup) {
    ref.read(chatStateProvider.notifier).sendGroupMessage(
      session.targetId,
      '',
      messageType: 'FILE',
      mediaUrl: result.url,
      mediaName: result.name,
      mediaSize: result.size,
      thumbnailUrl: result.thumbnailUrl,
    );
  } else {
    ref.read(chatStateProvider.notifier).sendMessage(
      session.targetId,
      '',
      messageType: 'FILE',
      mediaUrl: result.url,
      mediaName: result.name,
      mediaSize: result.size,
      thumbnailUrl: result.thumbnailUrl,
    );
  }
},
```

## 字段映射

| UploadResult | sendMessage 参数 | 说明 |
|---|---|---|
| `result.url` | `mediaUrl` | 文件上传后的 URL |
| `result.name` | `mediaName` | 文件名 |
| `result.size` | `mediaSize` | 文件大小（字节） |
| `result.thumbnailUrl` | `thumbnailUrl` | 缩略图（文件通常为 null） |
| — | `messageType: 'FILE'` | 文件消息类型（与 Vue 一致） |
| — | `content: ''` | 非文本消息内容为空 |

## 不改动

- MessageInput（文件选择和上传逻辑不变）
- FileApi（上传接口不变）
- chatStateProvider（已支持所有需要的参数）
- 后端接口

## 验证

1. 上传普通文件后当前会话出现 FILE 消息
2. 私聊文件可发送
3. 群聊文件可发送
4. 不破坏图片发送
