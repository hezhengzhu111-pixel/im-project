# i18n 补全实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 消除 Flutter Web 项目中 16 个文件的 ~60 处硬编码中文文案，保证语言切换后所有 UI 文案立即刷新。

**Architecture:** 所有 UI 文案通过 `AppLocalizations.of(context)` 获取。adapter/provider 层返回错误码字符串，由 UI 层翻译。时间格式化提取为共享工具函数。

**Tech Stack:** Flutter, flutter_localizations, gen-l10n, ARB files, Riverpod

---

## File Structure

### Create
- `lib/core/utils/time_formatter.dart` — 共享相对时间格式化函数
- `test/features/i18n/hardcoded_strings_test.dart` — 扫描 lib/ 确保无新增中文硬编码
- `test/features/i18n/not_found_page_i18n_test.dart` — 404 页面中英切换测试
- `test/features/i18n/deferred_route_page_i18n_test.dart` — DeferredRoutePage 中英切换测试
- `test/features/i18n/encryption_dialog_i18n_test.dart` — EncryptionDialog 中英切换测试

### Modify
- `lib/l10n/app_en.arb` — 添加 ~47 个新 key
- `lib/l10n/app_zh.arb` — 添加 ~47 个新 key
- `lib/features/e2ee/presentation/encryption_badge.dart` — 替换 4 处硬编码
- `lib/features/chat/presentation/widgets/network_status_banner.dart` — 替换 5+ 处硬编码
- `lib/features/chat/presentation/chat_provider_with_outbox.dart` — 错误消息改为 key
- `lib/features/chat/presentation/widgets/session_tile.dart` — 修复 fallback 字符串
- `lib/adapters/web_audio_recorder_adapter.dart` — 错误消息改为错误码
- `lib/features/moments/presentation/widgets/moments_topbar.dart` — 替换硬编码
- `lib/features/moments/presentation/widgets/moments_sidebar.dart` — 替换 8 处硬编码
- `lib/features/moments/presentation/moments_main_page.dart` — 替换硬编码
- `lib/features/moments/presentation/notifications/moments_notifications_page.dart` — 替换 8+ 处
- `lib/features/moments/presentation/feed/moments_feed_page.dart` — 替换硬编码
- `lib/features/moments/presentation/composer/widgets/visibility_picker.dart` — 替换 3 处
- `lib/features/moments/presentation/composer/moments_composer_page.dart` — 替换硬编码
- `lib/features/moments/presentation/composer/widgets/media_upload_grid.dart` — 替换硬编码
- `lib/features/moments/presentation/feed/widgets/like_bar.dart` — 替换硬编码
- `lib/features/moments/presentation/feed/widgets/comment_section.dart` — 替换 5+ 处
- `lib/features/moments/presentation/feed/widgets/post_card.dart` — 替换 5+ 处
- `lib/features/auth/presentation/widgets/brand_showcase.dart` — 替换 5 处描述文案
- `test/core/router/not_found_page_test.dart` — 更新现有测试以支持中英双语

---

## Task 1: 添加 Arb Keys

**Files:**
- Modify: `lib/l10n/app_en.arb`
- Modify: `lib/l10n/app_zh.arb`

- [ ] **Step 1: 在 app_en.arb 末尾（最后一个 key 的逗号后）添加新 key**

在 `app_en.arb` 的 `"formErrorRateLimit"` 行之后、闭合 `}` 之前添加：

```json
  "e2eeEncryptedBadge": "End-to-end encryption enabled",
  "e2eeNegotiatingBadge": "Negotiating encryption",
  "e2eeFailedBadge": "Encryption error",
  "e2eePlaintextBadge": "Encryption not enabled",
  "networkDisconnected": "Network disconnected, messages will be sent when restored",
  "chatMessagesFailed": "{count} messages failed to send",
  "chatMessagesPending": "{count} messages waiting to send",
  "chatRetrying": "Retrying to send messages...",
  "chatRetry": "Retry",
  "errorE2eeNotReady": "E2EE negotiation not complete, waiting for peer confirmation",
  "errorAlreadyRecording": "Already recording",
  "errorNotRecording": "Not recording",
  "errorRecordingNotImplemented": "Voice recording not yet implemented",
  "momentsTitle": "Moments",
  "momentsUserFallback": "User",
  "momentsPublishButton": "Publish Moment",
  "momentsDailyOverview": "Daily Overview",
  "momentsInteractions": "Interactions",
  "momentsPhotos": "Photos",
  "momentsComments": "Comments",
  "momentsRecentInteractions": "Recent Interactions",
  "momentsNoRecentInteractions": "No recent interactions",
  "momentsSharePrompt": "Share your life moments",
  "momentsShareDesc": "Photos, text, videos can all be published to Moments",
  "momentsNoPosts": "No moments yet",
  "momentsNotifications": "Notifications",
  "momentsMarkAllRead": "Mark all as read",
  "momentsNoNotifications": "No notifications",
  "momentsNotificationLiked": "{name} liked your moment",
  "momentsNotificationCommented": "{name} commented on your moment",
  "momentsNotificationReplied": "{name} replied to your comment",
  "momentsNotificationInteracted": "{name} interacted with you",
  "momentsVisibilityPublic": "Public",
  "momentsVisibilityFriends": "Friends only",
  "momentsVisibilitySelf": "Only me",
  "momentsAddMedia": "Add photos/videos, max {count}",
  "momentsShowFull": "Show full",
  "timeJustNow": "just now",
  "timeMinutesAgo": "{minutes} min ago",
  "timeHoursAgo": "{hours} h ago",
  "timeDaysAgo": "{days} d ago",
  "brandSubtitle": "End-to-end encrypted instant messaging,\nyour messages are only decrypted on your device.",
  "brandFeatureE2ee": "End-to-end encryption",
  "brandFeatureRealtime": "Realtime sync",
  "brandFeatureDeviceTrust": "Multi-device secure login",
  "brandFeatureAi": "AI assistant"
```

- [ ] **Step 2: 在 app_zh.arb 末尾添加对应的中文 key**

在 `app_zh.arb` 的 `"formErrorRateLimit"` 行之后、闭合 `}` 之前添加：

```json
  "e2eeEncryptedBadge": "端到端加密已启用",
  "e2eeNegotiatingBadge": "正在协商加密",
  "e2eeFailedBadge": "端到端加密异常",
  "e2eePlaintextBadge": "未启用端到端加密",
  "networkDisconnected": "网络已断开，消息将在恢复后自动发送",
  "chatMessagesFailed": "{count} 条消息发送失败",
  "chatMessagesPending": "{count} 条消息等待发送",
  "chatRetrying": "正在重试发送消息...",
  "chatRetry": "重试",
  "errorE2eeNotReady": "端到端加密协商尚未完成，请等待对方确认。",
  "errorAlreadyRecording": "已在录音中",
  "errorNotRecording": "未在录音中",
  "errorRecordingNotImplemented": "录音功能待实现",
  "momentsTitle": "朋友圈",
  "momentsUserFallback": "用户",
  "momentsPublishButton": "发布动态",
  "momentsDailyOverview": "今日概览",
  "momentsInteractions": "互动",
  "momentsPhotos": "照片",
  "momentsComments": "评论",
  "momentsRecentInteractions": "最近互动",
  "momentsNoRecentInteractions": "暂无最近互动",
  "momentsSharePrompt": "分享你的生活瞬间",
  "momentsShareDesc": "照片、文字、视频都可以发布到朋友圈",
  "momentsNoPosts": "暂无动态",
  "momentsNotifications": "通知",
  "momentsMarkAllRead": "全部已读",
  "momentsNoNotifications": "暂无通知",
  "momentsNotificationLiked": "{name} 赞了你的动态",
  "momentsNotificationCommented": "{name} 评论了你的动态",
  "momentsNotificationReplied": "{name} 回复了你的评论",
  "momentsNotificationInteracted": "{name} 与你互动",
  "momentsVisibilityPublic": "公开",
  "momentsVisibilityFriends": "好友可见",
  "momentsVisibilitySelf": "仅自己",
  "momentsAddMedia": "添加图片/视频，最多 {count} 张",
  "momentsShowFull": "全文",
  "timeJustNow": "刚刚",
  "timeMinutesAgo": "{minutes}分钟前",
  "timeHoursAgo": "{hours}小时前",
  "timeDaysAgo": "{days}天前",
  "brandSubtitle": "端对端加密即时通信系统，\n您的消息仅在设备上解密。",
  "brandFeatureE2ee": "端对端加密",
  "brandFeatureRealtime": "实时消息同步",
  "brandFeatureDeviceTrust": "多设备安全登录",
  "brandFeatureAi": "AI 助手接入"
```

- [ ] **Step 3: 验证 JSON 格式**

Run: `cd flutter/apps/web && python -c "import json; json.load(open('lib/l10n/app_en.arb')); json.load(open('lib/l10n/app_zh.arb')); print('Both ARB files are valid JSON')"`

Expected: `Both ARB files are valid JSON`

- [ ] **Step 4: Commit**

```bash
git add flutter/apps/web/lib/l10n/app_en.arb flutter/apps/web/lib/l10n/app_zh.arb
git commit -m "feat(i18n): add 47 new arb keys for hardcoded string completion"
```

---

## Task 2: 运行 gen-l10n 生成 AppLocalizations

**Files:**
- Generated: `lib/l10n/app_localizations.dart`、`app_localizations_en.dart`、`app_localizations_zh.dart`

- [ ] **Step 1: 运行 gen-l10n**

Run: `cd flutter/apps/web && flutter gen-l10n`

Expected: 成功生成，无错误。新 key 应出现在 `AppLocalizations` 类中。

- [ ] **Step 2: 验证新 getter 存在**

Run: `cd flutter/apps/web && grep -c "String get e2eeEncryptedBadge" lib/l10n/app_localizations.dart`

Expected: 输出 `1`

- [ ] **Step 3: Commit**

```bash
git add flutter/apps/web/lib/l10n/
git commit -m "chore(i18n): regenerate AppLocalizations with new keys"
```

---

## Task 3: 创建共享时间格式化工具

**Files:**
- Create: `lib/core/utils/time_formatter.dart`

- [ ] **Step 1: 创建 time_formatter.dart**

```dart
import 'package:flutter/widgets.dart';
import 'package:im_web/l10n/app_localizations.dart';

String formatRelativeTime(BuildContext context, DateTime time) {
  final loc = AppLocalizations.of(context)!;
  final diff = DateTime.now().difference(time);
  if (diff.inMinutes < 1) return loc.timeJustNow;
  if (diff.inHours < 1) return loc.timeMinutesAgo(diff.inMinutes);
  if (diff.inDays < 1) return loc.timeHoursAgo(diff.inHours);
  if (diff.inDays < 30) return loc.timeDaysAgo(diff.inDays);
  return '${time.month}/${time.day}';
}
```

- [ ] **Step 2: Commit**

```bash
git add flutter/apps/web/lib/core/utils/time_formatter.dart
git commit -m "feat(i18n): add shared relative time formatter"
```

---

## Task 4: 修复 EncryptionBadge

**Files:**
- Modify: `lib/features/e2ee/presentation/encryption_badge.dart`

- [ ] **Step 1: 修改 build 方法中 switch 的 label 值**

将 `lib/features/e2ee/presentation/encryption_badge.dart` 第 10-15 行的 switch 表达式从：

```dart
final (color, icon, label) = switch (status) {
  E2eeSessionStatus.encrypted => (Colors.green, Icons.lock, '端到端加密已启用'),
  E2eeSessionStatus.negotiating => (Colors.amber, Icons.sync, '正在协商加密'),
  E2eeSessionStatus.failed => (Colors.red, Icons.lock_outline, '端到端加密异常'),
  E2eeSessionStatus.plaintext => (Colors.grey, Icons.lock_open, '未启用端到端加密'),
};
```

改为：

```dart
final loc = AppLocalizations.of(context)!;
final (color, icon, label) = switch (status) {
  E2eeSessionStatus.encrypted => (Colors.green, Icons.lock, loc.e2eeEncryptedBadge),
  E2eeSessionStatus.negotiating => (Colors.amber, Icons.sync, loc.e2eeNegotiatingBadge),
  E2eeSessionStatus.failed => (Colors.red, Icons.lock_outline, loc.e2eeFailedBadge),
  E2eeSessionStatus.plaintext => (Colors.grey, Icons.lock_open, loc.e2eePlaintextBadge),
};
```

注意：需要在文件顶部添加 `import 'package:im_web/l10n/app_localizations.dart';`

- [ ] **Step 2: Commit**

```bash
git add flutter/apps/web/lib/features/e2ee/presentation/encryption_badge.dart
git commit -m "refactor(e2ee): replace hardcoded badge labels with AppLocalizations"
```

---

## Task 5: 修复 NetworkStatusBanner

**Files:**
- Modify: `lib/features/chat/presentation/widgets/network_status_banner.dart`

- [ ] **Step 1: 修改 _buildBanner 方法中的硬编码字符串**

在 `_buildBanner` 方法开头（第 35 行 `final colorScheme` 之后）添加：

```dart
final loc = AppLocalizations.of(context)!;
```

然后将第 44-63 行的 if/else 链从：

```dart
if (networkState.isOffline) {
  backgroundColor = colorScheme.error;
  message = '网络已断开，消息将在恢复后自动发送';
  icon = Icons.cloud_off;
} else if (chatState.failedCount > 0) {
  backgroundColor = colorScheme.error;
  message = '${chatState.failedCount} 条消息发送失败';
  icon = Icons.error_outline;
  action = () => ref.read(chatStateProvider.notifier).retryAllFailed();
  actionLabel = '重试';
} else if (chatState.isRetrying) {
  backgroundColor = colorScheme.tertiary;
  message = '正在重试发送消息...';
  icon = Icons.sync;
} else if (chatState.pendingCount > 0) {
  backgroundColor = colorScheme.secondary;
  message = '${chatState.pendingCount} 条消息等待发送';
  icon = Icons.schedule;
}
```

改为：

```dart
if (networkState.isOffline) {
  backgroundColor = colorScheme.error;
  message = loc.networkDisconnected;
  icon = Icons.cloud_off;
} else if (chatState.failedCount > 0) {
  backgroundColor = colorScheme.error;
  message = loc.chatMessagesFailed(chatState.failedCount);
  icon = Icons.error_outline;
  action = () => ref.read(chatStateProvider.notifier).retryAllFailed();
  actionLabel = loc.chatRetry;
} else if (chatState.isRetrying) {
  backgroundColor = colorScheme.tertiary;
  message = loc.chatRetrying;
  icon = Icons.sync;
} else if (chatState.pendingCount > 0) {
  backgroundColor = colorScheme.secondary;
  message = loc.chatMessagesPending(chatState.pendingCount);
  icon = Icons.schedule;
}
```

- [ ] **Step 2: 修改 OutboxIndicator 中的硬编码字符串**

将第 129-134 行的 Tooltip message 从：

```dart
message: networkState.isOffline
    ? (l10n?.a11yNetworkDisconnected ?? '网络已断开')
    : chatState.failedCount > 0
        ? '${chatState.failedCount} 条消息发送失败'
        : '${chatState.pendingCount} 条消息等待发送',
```

改为：

```dart
message: networkState.isOffline
    ? loc.a11yNetworkDisconnected
    : chatState.failedCount > 0
        ? loc.chatMessagesFailed(chatState.failedCount)
        : loc.chatMessagesPending(chatState.pendingCount),
```

注意：需要将 `final l10n = AppLocalizations.of(context);` 改为 `final loc = AppLocalizations.of(context)!;` 并更新所有引用。

- [ ] **Step 3: Commit**

```bash
git add flutter/apps/web/lib/features/chat/presentation/widgets/network_status_banner.dart
git commit -m "refactor(chat): replace hardcoded network status banner strings with AppLocalizations"
```

---

## Task 6: 修复 ChatProvider 错误消息

**Files:**
- Modify: `lib/features/chat/presentation/chat_provider_with_outbox.dart:441-443`

- [ ] **Step 1: 将硬编码错误消息改为错误 key**

将第 442 行从：

```dart
state = state.copyWith(error: '端到端加密协商尚未完成，请等待对方确认。');
```

改为：

```dart
state = state.copyWith(error: 'e2ee_not_ready');
```

- [ ] **Step 2: 找到消费 error 的 UI 位置并翻译**

搜索 `chatState.error` 或 `state.error` 在 UI 层的使用位置，将直接显示改为通过 AppLocalizations 翻译：

Run: `cd flutter/apps/web && grep -rn "\.error" lib/features/chat/presentation/ --include="*.dart" | grep -v "test\|provider_with_outbox"`

找到显示 error 的 widget 后，在该位置添加翻译逻辑：

```dart
// 在显示 error 的 widget 中
final loc = AppLocalizations.of(context)!;
final errorMessage = switch (chatState.error) {
  'e2ee_not_ready' => loc.errorE2eeNotReady,
  final e? => e,
  null => null,
};
```

- [ ] **Step 3: Commit**

```bash
git add flutter/apps/web/lib/features/chat/presentation/
git commit -m "refactor(chat): replace hardcoded E2EE error message with i18n key"
```

---

## Task 7: 修复 WebAudioRecorderAdapter 错误码

**Files:**
- Modify: `lib/adapters/web_audio_recorder_adapter.dart`

- [ ] **Step 1: 将中文错误消息替换为错误码**

将 `lib/adapters/web_audio_recorder_adapter.dart` 中的三处中文错误消息替换：

第 10 行 `'已在录音中'` → `'already_recording'`
第 23 行 `'未在录音中'` → `'not_recording'`
第 28 行 `'录音功能待实现'` → `'not_implemented'`
第 39 行 `'未在录音中'` → `'not_recording'`

修改后完整文件：

```dart
import 'package:im_core/core.dart';

class WebAudioRecorderAdapter implements AudioRecorderPort {
  bool _isRecording = false;

  @override
  Future<Result<void>> startRecording() async {
    try {
      if (_isRecording) {
        return const Failure(UnknownError('already_recording'));
      }

      // 实际实现需要通过 dart:js_interop 使用 MediaRecorder API
      _isRecording = true;
      return const Success(null);
    } catch (e) {
      return Failure(UnknownError(e.toString()));
    }
  }

  @override
  Future<Result<PickedFile>> stopRecording() async {
    try {
      if (!_isRecording) {
        return const Failure(UnknownError('not_recording'));
      }

      // 实际实现需要通过 dart:js_interop 停止 MediaRecorder 并获取音频数据
      _isRecording = false;
      return const Failure(UnknownError('not_implemented'));
    } catch (e) {
      return Failure(UnknownError(e.toString()));
    }
  }

  @override
  Future<Result<void>> cancelRecording() async {
    try {
      if (!_isRecording) {
        return const Failure(UnknownError('not_recording'));
      }

      _isRecording = false;
      return const Success(null);
    } catch (e) {
      return Failure(UnknownError(e.toString()));
    }
  }

  @override
  Future<Result<bool>> isRecording() async {
    return Success(_isRecording);
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add flutter/apps/web/lib/adapters/web_audio_recorder_adapter.dart
git commit -m "refactor(adapter): replace hardcoded Chinese error messages with error codes"
```

---

## Task 8: 修复 Moments 模块（批量）

本任务处理 moments 模块中所有子组件的硬编码。每个子任务独立可提交。

### Task 8a: moments_topbar.dart

**Files:**
- Modify: `lib/features/moments/presentation/widgets/moments_topbar.dart`

- [ ] **Step 1: 添加 import 并替换硬编码**

在文件顶部添加 `import 'package:im_web/l10n/app_localizations.dart';`

将第 36 行的 `'朋友圈'` 替换为 `AppLocalizations.of(context)!.momentsTitle`

- [ ] **Step 2: Commit**

```bash
git add flutter/apps/web/lib/features/moments/presentation/widgets/moments_topbar.dart
git commit -m "refactor(moments): i18n topbar title"
```

### Task 8b: moments_sidebar.dart

**Files:**
- Modify: `lib/features/moments/presentation/widgets/moments_sidebar.dart`

- [ ] **Step 1: 添加 import 并替换所有硬编码**

在文件顶部添加 `import 'package:im_web/l10n/app_localizations.dart';`

在 build 方法中获取 `final loc = AppLocalizations.of(context)!;`

替换以下字符串：
- 第 63 行 `'用户'` → `loc.momentsUserFallback`
- 第 70 行 `'发布动态'` → `loc.momentsPublishButton`
- 第 92 行 `'今日概览'` → `loc.momentsDailyOverview`
- 第 103 行 `'互动'` → `loc.momentsInteractions`
- 第 104 行 `'照片'` → `loc.momentsPhotos`
- 第 105 行 `'评论'` → `loc.momentsComments`
- 第 146 行 `'最近互动'` → `loc.momentsRecentInteractions`
- 第 167 行 `'暂无最近互动'` → `loc.momentsNoRecentInteractions`
- 第 188 行 `'分享你的生活瞬间'` → `loc.momentsSharePrompt`
- 第 193 行 `'照片、文字、视频都可以发布到朋友圈'` → `loc.momentsShareDesc`

- [ ] **Step 2: Commit**

```bash
git add flutter/apps/web/lib/features/moments/presentation/widgets/moments_sidebar.dart
git commit -m "refactor(moments): i18n sidebar strings"
```

### Task 8c: moments_main_page.dart

**Files:**
- Modify: `lib/features/moments/presentation/moments_main_page.dart`

- [ ] **Step 1: 添加 import 并替换硬编码**

在文件顶部添加 `import 'package:im_web/l10n/app_localizations.dart';`

将第 85 行的 `nickname: '用户'` 替换为 `nickname: AppLocalizations.of(context)!.momentsUserFallback`

- [ ] **Step 2: Commit**

```bash
git add flutter/apps/web/lib/features/moments/presentation/moments_main_page.dart
git commit -m "refactor(moments): i18n main page user fallback"
```

### Task 8d: moments_notifications_page.dart

**Files:**
- Modify: `lib/features/moments/presentation/notifications/moments_notifications_page.dart`

- [ ] **Step 1: 添加 import 并替换所有硬编码**

在文件顶部添加 `import 'package:im_web/l10n/app_localizations.dart';`

替换以下字符串：
- 第 29 行 `'通知'` → `loc.momentsNotifications`
- 第 37 行 `'全部已读'` → `loc.momentsMarkAllRead`
- 第 51 行 `'暂无通知'` → `loc.momentsNoNotifications`
- 第 119 行 `'用户'` → `loc.momentsUserFallback`
- 第 122 行 `'$userName 赞了你的动态'` → `loc.momentsNotificationLiked(userName)`
- 第 124 行 `'$userName 评论了你的动态'` → `loc.momentsNotificationCommented(userName)`
- 第 126 行 `'$userName 回复了你的评论'` → `loc.momentsNotificationReplied(userName)`
- 第 128 行 `'$userName 与你互动'` → `loc.momentsNotificationInteracted(userName)`

将 `_formatTime` 方法（第 136-140 行）替换为使用共享工具：

```dart
import 'package:im_web/core/utils/time_formatter.dart';

// 替换 _formatTime 方法调用为：
String _formatTime(DateTime time) => formatRelativeTime(context, time);
```

注意：`_formatTime` 需要 `BuildContext`，如果该方法在 notification data 类中（无 context），则需要将 formatRelativeTime 的调用移到 build 方法中。

- [ ] **Step 2: Commit**

```bash
git add flutter/apps/web/lib/features/moments/presentation/notifications/moments_notifications_page.dart
git commit -m "refactor(moments): i18n notifications page"
```

### Task 8e: moments_feed_page.dart

**Files:**
- Modify: `lib/features/moments/presentation/feed/moments_feed_page.dart`

- [ ] **Step 1: 添加 import 并替换硬编码**

在文件顶部添加 `import 'package:im_web/l10n/app_localizations.dart';`

将第 60 行的 `'暂无动态'` 替换为 `AppLocalizations.of(context)!.momentsNoPosts`

- [ ] **Step 2: Commit**

```bash
git add flutter/apps/web/lib/features/moments/presentation/feed/moments_feed_page.dart
git commit -m "refactor(moments): i18n feed empty state"
```

### Task 8f: visibility_picker.dart

**Files:**
- Modify: `lib/features/moments/presentation/composer/widgets/visibility_picker.dart`

- [ ] **Step 1: 将硬编码字符串改为 key**

将枚举值中的中文字符串替换为 key 常量。由于枚举构造函数不能接受 BuildContext，改为存储 key 字符串，在 UI 层翻译：

```dart
import 'package:flutter/material.dart';

enum VisibilityLevel {
  public(0, Icons.public),
  friends(1, Icons.person),
  self(2, Icons.lock);

  const VisibilityLevel(this.value, this.icon);
  final int value;
  final IconData icon;
}
```

然后在使用 `VisibilityLevel` 的 widget 中通过 switch 翻译：

```dart
String visibilityLabel(BuildContext context, VisibilityLevel level) {
  final loc = AppLocalizations.of(context)!;
  return switch (level) {
    VisibilityLevel.public => loc.momentsVisibilityPublic,
    VisibilityLevel.friends => loc.momentsVisibilityFriends,
    VisibilityLevel.self => loc.momentsVisibilitySelf,
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add flutter/apps/web/lib/features/moments/presentation/composer/widgets/visibility_picker.dart
git commit -m "refactor(moments): i18n visibility picker"
```

### Task 8g: moments_composer_page.dart

**Files:**
- Modify: `lib/features/moments/presentation/composer/moments_composer_page.dart`

- [ ] **Step 1: 添加 import 并替换硬编码**

在文件顶部添加 `import 'package:im_web/l10n/app_localizations.dart';`

将第 69 行的 `nickname: '用户'` 替换为 `nickname: AppLocalizations.of(context)!.momentsUserFallback`

- [ ] **Step 2: Commit**

```bash
git add flutter/apps/web/lib/features/moments/presentation/composer/moments_composer_page.dart
git commit -m "refactor(moments): i18n composer user fallback"
```

### Task 8h: media_upload_grid.dart

**Files:**
- Modify: `lib/features/moments/presentation/composer/widgets/media_upload_grid.dart`

- [ ] **Step 1: 添加 import 并替换硬编码**

在文件顶部添加 `import 'package:im_web/l10n/app_localizations.dart';`

将第 83 行的 `'添加图片/视频，最多 $maxFiles 张'` 替换为 `AppLocalizations.of(context)!.momentsAddMedia(maxFiles)`

- [ ] **Step 2: Commit**

```bash
git add flutter/apps/web/lib/features/moments/presentation/composer/widgets/media_upload_grid.dart
git commit -m "refactor(moments): i18n media upload hint"
```

### Task 8i: like_bar.dart

**Files:**
- Modify: `lib/features/moments/presentation/feed/widgets/like_bar.dart`

- [ ] **Step 1: 添加 import 并替换硬编码**

在文件顶部添加 `import 'package:im_web/l10n/app_localizations.dart';`

将第 53 行的 `"用户"` fallback 替换为 `AppLocalizations.of(context)!.momentsUserFallback`

- [ ] **Step 2: Commit**

```bash
git add flutter/apps/web/lib/features/moments/presentation/feed/widgets/like_bar.dart
git commit -m "refactor(moments): i18n like bar user fallback"
```

### Task 8j: comment_section.dart

**Files:**
- Modify: `lib/features/moments/presentation/feed/widgets/comment_section.dart`

- [ ] **Step 1: 添加 import 并替换所有硬编码**

在文件顶部添加 `import 'package:im_web/l10n/app_localizations.dart';`
添加 `import 'package:im_web/core/utils/time_formatter.dart';`

替换以下字符串：
- 第 208 行 `'用户'` → `loc.momentsUserFallback`
- 第 231 行 `'用户'` → `loc.momentsUserFallback`

将 `_formatTime` 方法（第 262-265 行）替换为调用 `formatRelativeTime(context, time)`

- [ ] **Step 2: Commit**

```bash
git add flutter/apps/web/lib/features/moments/presentation/feed/widgets/comment_section.dart
git commit -m "refactor(moments): i18n comment section"
```

### Task 8k: post_card.dart

**Files:**
- Modify: `lib/features/moments/presentation/feed/widgets/post_card.dart`

- [ ] **Step 1: 添加 import 并替换所有硬编码**

在文件顶部添加 `import 'package:im_web/l10n/app_localizations.dart';`
添加 `import 'package:im_web/core/utils/time_formatter.dart';`

替换以下字符串：
- 第 66 行 `'用户'` → `loc.momentsUserFallback`
- 第 171 行 `'全文'` → `loc.momentsShowFull`

将 `_formatTime` 方法（第 320-323 行）替换为调用 `formatRelativeTime(context, time)`

- [ ] **Step 2: Commit**

```bash
git add flutter/apps/web/lib/features/moments/presentation/feed/widgets/post_card.dart
git commit -m "refactor(moments): i18n post card"
```

---

## Task 9: 修复 BrandShowcase

**Files:**
- Modify: `lib/features/auth/presentation/widgets/brand_showcase.dart`

- [ ] **Step 1: 添加 import 并替换中文描述**

在文件顶部添加 `import 'package:im_web/l10n/app_localizations.dart';`

在 build 方法中获取 `final loc = AppLocalizations.of(context)!;`

替换以下字符串（品牌标语 'Secure. Private. Instant.'、'End-to-End Encrypted' 和 feature labels 保持英文不变）：
- 第 62 行 `'端对端加密即时通信系统，\n您的消息仅在设备上解密。'` → `loc.brandSubtitle`
- 第 77 行 `desc: '端对端加密'` → `desc: loc.brandFeatureE2ee`
- 第 83 行 `desc: '实时消息同步'` → `desc: loc.brandFeatureRealtime`
- 第 89 行 `desc: '多设备安全登录'` → `desc: loc.brandFeatureDeviceTrust`
- 第 95 行 `desc: 'AI 助手接入'` → `desc: loc.brandFeatureAi`

注意：`_buildFeatureItem` 方法需要接收 `BuildContext` 参数以便访问 `loc`，或者在调用处传入已翻译的字符串。推荐在调用处直接传入 `loc.brandFeatureE2ee` 等。

- [ ] **Step 2: Commit**

```bash
git add flutter/apps/web/lib/features/auth/presentation/widgets/brand_showcase.dart
git commit -m "refactor(auth): i18n brand showcase descriptions"
```

---

## Task 10: 修复 SessionTile fallback

**Files:**
- Modify: `lib/features/chat/presentation/widgets/session_tile.dart`

- [ ] **Step 1: 修改 fallback 字符串**

将第 23 行从：

```dart
label: session.targetName.isNotEmpty ? session.targetName : (AppLocalizations.of(context)?.chatSelectSession ?? '会话'),
```

改为：

```dart
label: session.targetName.isNotEmpty ? session.targetName : AppLocalizations.of(context)!.chatSelectSession,
```

- [ ] **Step 2: Commit**

```bash
git add flutter/apps/web/lib/features/chat/presentation/widgets/session_tile.dart
git commit -m "refactor(chat): remove hardcoded fallback in session tile"
```

---

## Task 11: 添加 i18n 测试

**Files:**
- Create: `test/features/i18n/hardcoded_strings_test.dart`
- Create: `test/features/i18n/not_found_page_i18n_test.dart`
- Create: `test/features/i18n/deferred_route_page_i18n_test.dart`
- Create: `test/features/i18n/encryption_dialog_i18n_test.dart`

- [ ] **Step 1: 创建 hardcoded_strings_test.dart**

```dart
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  group('Hardcoded Chinese strings', () {
    test('should not contain hardcoded Chinese in lib/ dart files', () {
      final libDir = Directory('lib');
      final chineseRegex = RegExp(r"[一-鿿]+");
      final commentRegex = RegExp(r'//.*|/\*[\s\S]*?\*/');
      final excludedFiles = [
        'app_en.arb',
        'app_zh.arb',
      ];

      final violations = <String>[];

      for (final entity in libDir.listSync(recursive: true)) {
        if (entity is! File) continue;
        if (!entity.path.endsWith('.dart')) continue;

        final relativePath = entity.path.replaceFirst('lib${Platform.pathSeparator}', '');
        if (excludedFiles.any((f) => relativePath.contains(f))) continue;

        final content = entity.readAsStringSync();
        // Remove comments
        final cleaned = content.replaceAll(commentRegex, '');
        // Remove strings in AppLocalizations calls (already i18n'd)
        final i18nCleaned = cleaned.replaceAll(RegExp(r'loc\.\w+\([^)]*\)'), '');

        final matches = chineseRegex.allMatches(i18nCleaned);
        if (matches.isNotEmpty) {
          violations.add('${entity.path}: ${matches.map((m) => m.group(0)).join(", ")}');
        }
      }

      if (violations.isNotEmpty) {
        fail('Found hardcoded Chinese strings:\n${violations.join('\n')}');
      }
    });
  });
}
```

- [ ] **Step 2: 创建 not_found_page_i18n_test.dart**

```dart
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:im_web/core/router/not_found_page.dart';
import 'package:im_web/l10n/app_localizations.dart';

void main() {
  Widget buildTestApp({Locale locale = const Locale('zh')}) {
    return MaterialApp(
      locale: locale,
      localizationsDelegates: AppLocalizations.localizationsDelegates,
      supportedLocales: AppLocalizations.supportedLocales,
      home: const NotFoundPage(),
    );
  }

  group('NotFoundPage i18n', () {
    testWidgets('displays Chinese text when locale is zh', (tester) async {
      await tester.pumpWidget(buildTestApp(locale: const Locale('zh')));
      await tester.pumpAndSettle();

      expect(find.text('404'), findsOneWidget);
      expect(find.text('页面不存在'), findsOneWidget);
      expect(find.text('返回首页'), findsOneWidget);
    });

    testWidgets('displays English text when locale is en', (tester) async {
      await tester.pumpWidget(buildTestApp(locale: const Locale('en')));
      await tester.pumpAndSettle();

      expect(find.text('404'), findsOneWidget);
      expect(find.text('Page not found'), findsOneWidget);
      expect(find.text('Back to Home'), findsOneWidget);
    });
  });
}
```

- [ ] **Step 3: 创建 deferred_route_page_i18n_test.dart**

```dart
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:im_web/core/router/deferred_route_page.dart';
import 'package:im_web/l10n/app_localizations.dart';

void main() {
  Widget buildTestApp({
    Locale locale = const Locale('zh'),
    required Future<void> Function() loadLibrary,
    Widget Function()? builder,
  }) {
    return MaterialApp(
      locale: locale,
      localizationsDelegates: AppLocalizations.localizationsDelegates,
      supportedLocales: AppLocalizations.supportedLocales,
      home: DeferredRoutePage(
        loadLibrary: loadLibrary,
        builder: builder ?? () => const Text('loaded'),
      ),
    );
  }

  group('DeferredRoutePage i18n', () {
    testWidgets('shows Chinese loading text when locale is zh', (tester) async {
      final completer = Completer<void>();
      await tester.pumpWidget(buildTestApp(
        locale: const Locale('zh'),
        loadLibrary: () => completer.future,
      ));
      await tester.pump();

      expect(find.byType(CircularProgressIndicator), findsOneWidget);
      expect(find.text('加载中...'), findsOneWidget);
    });

    testWidgets('shows English loading text when locale is en', (tester) async {
      final completer = Completer<void>();
      await tester.pumpWidget(buildTestApp(
        locale: const Locale('en'),
        loadLibrary: () => completer.future,
      ));
      await tester.pump();

      expect(find.byType(CircularProgressIndicator), findsOneWidget);
      expect(find.text('Loading...'), findsOneWidget);
    });

    testWidgets('shows Chinese error text when locale is zh', (tester) async {
      await tester.pumpWidget(buildTestApp(
        locale: const Locale('zh'),
        loadLibrary: () => Future.error('test error'),
      ));
      await tester.pumpAndSettle();

      expect(find.textContaining('加载失败'), findsOneWidget);
      expect(find.text('重试'), findsOneWidget);
    });

    testWidgets('shows English error text when locale is en', (tester) async {
      await tester.pumpWidget(buildTestApp(
        locale: const Locale('en'),
        loadLibrary: () => Future.error('test error'),
      ));
      await tester.pumpAndSettle();

      expect(find.textContaining('Loading failed'), findsOneWidget);
      expect(find.text('Retry'), findsOneWidget);
    });
  });
}
```

注意：需要在文件顶部添加 `import 'dart:async';`

- [ ] **Step 4: 创建 encryption_dialog_i18n_test.dart**

```dart
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:im_web/features/e2ee/presentation/encryption_dialog.dart';
import 'package:im_web/l10n/app_localizations.dart';

void main() {
  Widget buildTestApp({Locale locale = const Locale('zh'), VoidCallback? onConfirm}) {
    return MaterialApp(
      locale: locale,
      localizationsDelegates: AppLocalizations.localizationsDelegates,
      supportedLocales: AppLocalizations.supportedLocales,
      home: Builder(
        builder: (context) => ElevatedButton(
          onPressed: () => showDialog(
            context: context,
            builder: (_) => EncryptionDialog(onConfirm: onConfirm ?? () {}),
          ),
          child: const Text('open'),
        ),
      ),
    );
  }

  group('EncryptionDialog i18n', () {
    testWidgets('displays Chinese text when locale is zh', (tester) async {
      await tester.pumpWidget(buildTestApp(locale: const Locale('zh')));
      await tester.tap(find.text('open'));
      await tester.pumpAndSettle();

      expect(find.text('启用端到端加密'), findsOneWidget);
      expect(find.text('取消'), findsOneWidget);
      expect(find.text('确认启用'), findsOneWidget);
    });

    testWidgets('displays English text when locale is en', (tester) async {
      await tester.pumpWidget(buildTestApp(locale: const Locale('en')));
      await tester.tap(find.text('open'));
      await tester.pumpAndSettle();

      expect(find.text('Enable End-to-End Encryption'), findsOneWidget);
      expect(find.text('Cancel'), findsOneWidget);
      expect(find.text('Confirm Enable'), findsOneWidget);
    });
  });
}
```

- [ ] **Step 5: 运行测试验证**

Run: `cd flutter/apps/web && flutter test test/features/i18n/`

Expected: 所有测试通过

- [ ] **Step 6: Commit**

```bash
git add flutter/apps/web/test/features/i18n/
git commit -m "test(i18n): add hardcoded string scan and i18n widget tests"
```

---

## Task 12: 更新现有测试

**Files:**
- Modify: `test/core/router/not_found_page_test.dart`

- [ ] **Step 1: 更新 not_found_page_test.dart 以支持双语**

将 `test/core/router/not_found_page_test.dart` 完整替换为：

```dart
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:im_web/core/router/not_found_page.dart';
import 'package:im_web/l10n/app_localizations.dart';

void main() {
  Widget buildTestApp({Locale locale = const Locale('zh')}) {
    return MaterialApp(
      locale: locale,
      localizationsDelegates: AppLocalizations.localizationsDelegates,
      supportedLocales: AppLocalizations.supportedLocales,
      home: const NotFoundPage(),
    );
  }

  group('NotFoundPage', () {
    testWidgets('displays 404 text', (tester) async {
      await tester.pumpWidget(buildTestApp());
      expect(find.text('404'), findsOneWidget);
    });

    testWidgets('displays Chinese text when locale is zh', (tester) async {
      await tester.pumpWidget(buildTestApp(locale: const Locale('zh')));
      await tester.pumpAndSettle();

      expect(find.text('页面不存在'), findsOneWidget);
      expect(find.text('返回首页'), findsOneWidget);
    });

    testWidgets('displays English text when locale is en', (tester) async {
      await tester.pumpWidget(buildTestApp(locale: const Locale('en')));
      await tester.pumpAndSettle();

      expect(find.text('Page not found'), findsOneWidget);
      expect(find.text('Back to Home'), findsOneWidget);
    });
  });
}
```

- [ ] **Step 2: 运行所有测试确认无回归**

Run: `cd flutter/apps/web && flutter test`

Expected: 所有测试通过

- [ ] **Step 3: Commit**

```bash
git add flutter/apps/web/test/core/router/not_found_page_test.dart
git commit -m "test(i18n): update not found page test for bilingual support"
```

---

## Task 13: 最终验证

- [ ] **Step 1: 运行 gen-l10n 确认生成无误**

Run: `cd flutter/apps/web && flutter gen-l10n`

- [ ] **Step 2: 运行全部测试**

Run: `cd flutter/apps/web && flutter test`

Expected: 所有测试通过

- [ ] **Step 3: 运行硬编码扫描测试确认无新增**

Run: `cd flutter/apps/web && flutter test test/features/i18n/hardcoded_strings_test.dart`

Expected: PASS

- [ ] **Step 4: 最终 Commit（如有遗漏的修改）**

```bash
git add -A flutter/apps/web/
git commit -m "feat(i18n): complete i18n coverage for all remaining hardcoded strings"
```
