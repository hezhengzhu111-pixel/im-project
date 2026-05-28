# i18n 补全设计：消除剩余硬编码

## 概述

在已有 i18n 基础设施（`2026-05-28-i18n-implementation-design.md`）之上，补齐剩余页面和组件中的硬编码中文文案，保证语言切换后所有核心 UI 文案立即刷新。

## 范围

修复 16 个文件中约 60 处硬编码中文字符串。已确认以下文件已正确使用 `AppLocalizations`，无需修改：
- `encryption_dialog.dart`、`deferred_route_page.dart`、`not_found_page.dart`、`group_list_page.dart`、`negotiation_dialog.dart`、`encryption_banner.dart`

## 架构分层

```
UI Layer (widgets/pages)
  └─ AppLocalizations.of(context)!.keyName

Provider Layer (state management)
  └─ 返回错误码字符串（如 'e2ee_not_ready'），由消费者翻译

Adapter Layer (platform adapters)
  └─ 返回 Result.failure(ErrorCode.xxx)，由 UI 层翻译
```

**原则**：adapter/provider 层不依赖 BuildContext，不包含用户可见文案。

## Key 命名规范

按功能域前缀组织，与现有 arb key 保持一致：

| 域 | 前缀 | 示例 |
|---|---|---|
| E2EE | `e2ee` | `e2eeEncryptedBadge`、`e2eeNegotiatingBadge` |
| Chat/Network | `chat` / `network` | `networkDisconnected`、`chatMessagesFailed` |
| Moments | `moments` | `momentsTitle`、`momentsNoPosts` |
| Auth/Brand | `brand` | `brandSubtitle`、`brandFeatureE2ee` |
| 通用/时间 | `common` / `time` | `timeJustNow`、`timeMinutesAgo` |
| 错误码 | `error` | `errorAlreadyRecording`、`errorE2eeNotReady` |

## 新增 Arb Keys

### E2EE Badge（4 keys）

| Key | EN | ZH |
|---|---|---|
| `e2eeEncryptedBadge` | End-to-end encryption enabled | 端到端加密已启用 |
| `e2eeNegotiatingBadge` | Negotiating encryption | 正在协商加密 |
| `e2eeFailedBadge` | Encryption error | 端到端加密异常 |
| `e2eePlaintextBadge` | Encryption not enabled | 未启用端到端加密 |

### Chat / Network（6 keys）

| Key | EN | ZH |
|---|---|---|
| `networkDisconnected` | Network disconnected, messages will be sent when restored | 网络已断开，消息将在恢复后自动发送 |
| `chatMessagesFailed` | `{count} messages failed to send` | `{count} 条消息发送失败` |
| `chatMessagesPending` | `{count} messages waiting to send` | `{count} 条消息等待发送` |
| `chatRetrying` | Retrying to send messages... | 正在重试发送消息... |
| `chatRetry` | Retry | 重试 |
| `errorE2eeNotReady` | E2EE negotiation not complete, waiting for peer confirmation | 端到端加密协商尚未完成，请等待对方确认。 |

### Adapter Errors（3 keys）

| Key | EN | ZH |
|---|---|---|
| `errorAlreadyRecording` | Already recording | 已在录音中 |
| `errorNotRecording` | Not recording | 未在录音中 |
| `errorRecordingNotImplemented` | Voice recording not yet implemented | 录音功能待实现 |

### Moments（~25 keys）

| Key | EN | ZH |
|---|---|---|
| `momentsTitle` | Moments | 朋友圈 |
| `momentsUserFallback` | User | 用户 |
| `momentsPublishButton` | Publish Moment | 发布动态 |
| `momentsDailyOverview` | Daily Overview | 今日概览 |
| `momentsInteractions` | Interactions | 互动 |
| `momentsPhotos` | Photos | 照片 |
| `momentsComments` | Comments | 评论 |
| `momentsRecentInteractions` | Recent Interactions | 最近互动 |
| `momentsNoRecentInteractions` | No recent interactions | 暂无最近互动 |
| `momentsSharePrompt` | Share your life moments | 分享你的生活瞬间 |
| `momentsShareDesc` | Photos, text, videos can all be published to Moments | 照片、文字、视频都可以发布到朋友圈 |
| `momentsNoPosts` | No moments yet | 暂无动态 |
| `momentsNotifications` | Notifications | 通知 |
| `momentsMarkAllRead` | Mark all as read | 全部已读 |
| `momentsNoNotifications` | No notifications | 暂无通知 |
| `momentsNotificationLiked` | `{name} liked your moment` | `{name} 赞了你的动态` |
| `momentsNotificationCommented` | `{name} commented on your moment` | `{name} 评论了你的动态` |
| `momentsNotificationReplied` | `{name} replied to your comment` | `{name} 回复了你的评论` |
| `momentsNotificationInteracted` | `{name} interacted with you` | `{name} 与你互动` |
| `momentsVisibilityPublic` | Public | 公开 |
| `momentsVisibilityFriends` | Friends only | 好友可见 |
| `momentsVisibilitySelf` | Only me | 仅自己 |
| `momentsAddMedia` | Add photos/videos, max {count} | 添加图片/视频，最多 {count} 张 |
| `momentsShowFull` | Show full | 全文 |

### Time Formatting（4 keys）

| Key | EN | ZH |
|---|---|---|
| `timeJustNow` | just now | 刚刚 |
| `timeMinutesAgo` | {minutes} min ago | {minutes}分钟前 |
| `timeHoursAgo` | {hours} h ago | {hours}小时前 |
| `timeDaysAgo` | {days} d ago | {days}天前 |

### Brand Showcase（5 keys）

品牌标语（'Secure. Private. Instant.'、'End-to-End Encrypted'、feature labels）保持英文，仅翻译中文描述。

| Key | EN | ZH |
|---|---|---|
| `brandSubtitle` | End-to-end encrypted instant messaging,\nyour messages are only decrypted on your device. | 端对端加密即时通信系统，\n您的消息仅在设备上解密。 |
| `brandFeatureE2ee` | End-to-end encryption | 端对端加密 |
| `brandFeatureRealtime` | Realtime sync | 实时消息同步 |
| `brandFeatureDeviceTrust` | Multi-device secure login | 多设备安全登录 |
| `brandFeatureAi` | AI assistant | AI 助手接入 |

## 时间格式化提取

moments 模块中有 3 处重复的时间格式化逻辑（`comment_section.dart`、`post_card.dart`、`moments_notifications_page.dart`）。

**方案**：提取为共享工具函数 `lib/core/utils/time_formatter.dart`：

```dart
String formatRelativeTime(BuildContext context, DateTime time) {
  final loc = AppLocalizations.of(context)!;
  final diff = DateTime.now().difference(time);
  if (diff.inMinutes < 1) return loc.timeJustNow;
  if (diff.inHours < 1) return loc.timeMinutesAgo(diff.inMinutes);
  if (diff.inDays < 1) return loc.timeHoursAgo(diff.inHours);
  if (diff.inDays < 30) return loc.timeDaysAgo(diff.inDays);
  // fallback to date string
  return '${time.month}/${time.day}';
}
```

## Adapter 层错误码重构

### web_audio_recorder_adapter.dart

将中文错误消息替换为枚举错误码：

```dart
enum RecordingError {
  alreadyRecording,
  notRecording,
  notImplemented,
}

// 使用方式
return const Failure(UnknownError('already_recording'));
```

UI 层消费者通过 switch 翻译：

```dart
String translateRecordingError(BuildContext context, String errorCode) {
  final loc = AppLocalizations.of(context)!;
  return switch (errorCode) {
    'already_recording' => loc.errorAlreadyRecording,
    'not_recording' => loc.errorNotRecording,
    'not_implemented' => loc.errorRecordingNotImplemented,
    _ => loc.commonFailed,
  };
}
```

### chat_provider_with_outbox.dart

第 442 行的硬编码错误消息改为 key：

```dart
// Before
state = state.copyWith(error: '端到端加密协商尚未完成，请等待对方确认。');
// After
state = state.copyWith(errorKey: 'e2ee_not_ready');
```

消费者在 UI 层翻译 `errorKey`。

## 迁移批次

1. **arb 文件**：一次性添加所有 ~47 个新 key 到 `app_en.arb` 和 `app_zh.arb`
2. **E2EE**：`encryption_badge.dart`（4 处）
3. **Chat**：`network_status_banner.dart`（5+ 处）、`session_tile.dart`（1 处 fallback）
4. **Provider**：`chat_provider_with_outbox.dart`（错误码重构）
5. **Adapter**：`web_audio_recorder_adapter.dart`（错误码重构）
6. **共享工具**：创建 `time_formatter.dart`，提取时间格式化
7. **Moments**：全部子组件（~25 处），含时间格式化替换
8. **Auth**：`brand_showcase.dart`（5 处，品牌标语保持英文）
9. **gen-l10n**：运行 `flutter gen-l10n` 生成更新的 AppLocalizations
10. **测试**：新增 i18n 测试

## 测试设计

### 新增测试文件

`test/features/i18n/hardcoded_strings_test.dart` — 扫描 lib/ 目录，断言无新增中文硬编码（排除注释和 arb 文件）。

### Widget 测试

- `test/features/i18n/not_found_page_i18n_test.dart` — 404 页面中英切换
- `test/features/i18n/deferred_route_page_i18n_test.dart` — DeferredRoutePage loading/error 中英切换
- `test/features/i18n/encryption_dialog_i18n_test.dart` — EncryptionDialog 中英切换

## 技术约束

1. 不修改业务流程
2. 不在 adapter/provider 层直接依赖 BuildContext
3. 不把中文默认值写到 widget 中作为 fallback；fallback 在 l10n 层处理
4. 品牌标语（Secure. Private. Instant.）保持英文不翻译
5. 使用现有 `flutter gen-l10n` 流程生成 AppLocalizations

## 成功标准

1. 所有列出的 16 个文件中无硬编码中文文案
2. 语言切换后所有 UI 文案立即刷新
3. adapter/provider 层返回错误码，不含用户可见文案
4. 时间格式化函数提取为共享工具，无重复代码
5. i18n 扫描测试通过，无新增硬编码
6. 关键页面的中英切换 widget test 通过
