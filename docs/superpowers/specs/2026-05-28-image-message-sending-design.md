# 图片消息发送功能设计

## 概述

将 Flutter Web ChatPage 中 `onSendImage` 从 SnackBar 占位改为真正发送 IMAGE 消息。

## 背景

当前 Flutter Web 的图片发送功能只显示 SnackBar 占位提示，没有真正发送消息。Vue Web 已经实现了完整的图片消息发送流程。

## 设计方案

### 方案选择

采用**方案 A：扩展 sendMessage 方法签名**，与 Vue 实现保持一致。

### 修改范围

| 文件 | 改动类型 | 说明 |
|------|----------|------|
| `chat_page.dart` | 修改 | 实现 `onSendImage` 回调逻辑 |
| `chat_provider_with_outbox.dart` | 修改 | 扩展 `sendMessage`/`sendGroupMessage` 方法签名 |
| `message_api.dart` | 修改 | 扩展 `SendPrivateMessageRequest`/`SendGroupMessageRequest` 支持媒体字段 |

### 数据流

```
用户选择图片 → MessageInput 上传 → UploadResult
    ↓
chat_page.dart onSendImage 回调
    ↓
判断会话类型（私聊/群聊）
    ↓
调用 sendMessage/sendGroupMessage，传入：
  - content: '' (空字符串，与 Vue 一致)
  - messageType: 'IMAGE'
  - mediaUrl: uploadResult.url
  - mediaName: uploadResult.name
  - mediaSize: uploadResult.size
  - thumbnailUrl: uploadResult.thumbnailUrl
    ↓
MessageApi 发送到后端
```

### 字段映射

| UploadResult 字段 | 消息字段 | 说明 |
|-------------------|----------|------|
| `url` | `mediaUrl` | 图片 URL |
| `name` | `mediaName` | 文件名 |
| `size` | `mediaSize` | 文件大小（字节） |
| `thumbnailUrl` | `thumbnailUrl` | 缩略图 URL（可选） |

### 核心代码变更

#### 1. chat_page.dart - onSendImage 回调

```dart
onSendImage: (result) {
  if (session == null) return;
  if (isGroup) {
    ref.read(chatStateProvider.notifier).sendGroupMessage(
      session.targetId,
      '',  // content 为空
      messageType: 'IMAGE',
      mediaUrl: result.url,
      mediaName: result.name,
      mediaSize: result.size,
      thumbnailUrl: result.thumbnailUrl,
    );
  } else {
    ref.read(chatStateProvider.notifier).sendMessage(
      session.targetId,
      '',  // content 为空
      messageType: 'IMAGE',
      mediaUrl: result.url,
      mediaName: result.name,
      mediaSize: result.size,
      thumbnailUrl: result.thumbnailUrl,
    );
  }
},
```

#### 2. chat_provider_with_outbox.dart - 扩展方法签名

```dart
Future<Message?> sendMessage(
  String receiverId,
  String content, {
  String messageType = 'text',
  String? clientMessageId,
  String? mediaUrl,
  String? mediaName,
  int? mediaSize,
  String? thumbnailUrl,
}) async {
  // ... 现有逻辑
  // 构建请求时包含媒体字段
}
```

#### 3. message_api.dart - 扩展请求类

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
  });
  // ...
}
```

## 验证计划

1. **编译检查**：`flutter build web --debug`
2. **功能测试**：
   - 私聊发送图片 → 消息列表显示 IMAGE 消息
   - 群聊发送图片 → 消息列表显示 IMAGE 消息
   - 不再显示 SnackBar 占位

## 约束

- 不修改 FileApi 上传逻辑
- 不修改后端接口
- 不修改 Vue 代码
- 不顺手重构 ChatPage
- 不处理文件、语音消息
- 不修改 MessageInput 组件
