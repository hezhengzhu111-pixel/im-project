# Chat Header Widget 设计文档

## 概述

将 Flutter Web 聊天页面的头部提取为独立的 `ChatHeader` widget，补齐头像、在线状态、E2EE 状态徽章，使其更接近 Vue 版本的功能。

## 目标

1. 头部显示会话头像（36-40px 圆形，无头像时显示首字母）
2. 头部显示会话名称
3. 私聊显示 E2EE 状态完整徽章
4. 不实现 E2EE 协商弹窗、会话操作菜单、详情侧栏

## 架构设计

### ChatHeader Widget

**位置**：`flutter/apps/web/lib/features/chat/presentation/widgets/chat_header.dart`

**参数**：

```dart
class ChatHeader extends StatelessWidget {
  const ChatHeader({
    required this.session,
    required this.isMobile,
    required this.onBackPressed,
    this.e2eeStatus,
    super.key,
  });

  final ChatSession session;
  final bool isMobile;
  final VoidCallback onBackPressed;
  final E2eeSessionStatus? e2eeStatus; // null = 不显示 E2EE 徽章
}
```

### 组件结构

```
ChatHeader
├── 返回按钮 (仅移动端)
├── 头像
│   ├── 网络图片 (有头像时)
│   └── 首字母 (无头像时)
├── 名称
├── E2EE 徽章 (私聊)
│   ├── 图标
│   └── 状态文字
└── Spacer
```

## 数据流

### 数据来源

1. **会话信息** - 从 `chatStateProvider` 获取 `session` 对象
   - `session.targetAvatar` - 头像 URL
   - `session.targetName` - 会话名称
   - `session.conversationType` - 会话类型（private/group）

2. **E2EE 状态** - 从 `e2eeSessionStatusProvider(sessionId)` 获取
   - 状态枚举：`encrypted`、`negotiating`、`failed`、`plaintext`

### 数据流向

```
chat_page.dart
  └── ref.watch(chatStateProvider) → chatState
       └── session = chatState.sessions.firstWhere(...)
            └── ChatHeader(session: session, e2eeStatus: ...)
                 └── 显示 E2EE 徽章
```

## 组件实现

### 头像组件

```dart
CircleAvatar(
  radius: 18, // 36px 直径
  backgroundImage: session.targetAvatar != null
      ? NetworkImage(session.targetAvatar!)
      : null,
  child: session.targetAvatar == null
      ? Text(
          session.targetName.isNotEmpty
              ? session.targetName[0].toUpperCase()
              : '?',
          style: const TextStyle(fontSize: 16),
        )
      : null,
)
```

### E2EE 徽章组件

复用现有 `EncryptionBadge` widget：

```dart
// 仅私聊显示
if (session.conversationType == 'private' && e2eeStatus != null)
  EncryptionBadge(status: e2eeStatus!)
```

## 错误处理

1. **头像加载失败** - 显示首字母作为 fallback（与 SessionTile 一致）
2. **E2EE 状态不可用** - 不显示徽章，仅显示名称和头像

## 测试场景

1. 私聊会话 - 显示头像、名称、E2EE 徽章
2. 群聊会话 - 显示头像、名称、成员数，无 E2EE 徽章
3. 无头像会话 - 显示首字母
4. 移动端布局 - 显示返回按钮
5. E2EE 状态变化 - 徽章正确更新

## 修改文件列表

1. **新增** - `flutter/apps/web/lib/features/chat/presentation/widgets/chat_header.dart`
2. **修改** - `flutter/apps/web/lib/features/chat/presentation/chat_page.dart`
   - 在 `_buildChatView` 中使用 ChatHeader 替代现有头部
   - 传递 session、E2EE 状态

## 任务边界

**包含**：
- ✅ 头部显示会话头像
- ✅ 头部显示会话名称
- ✅ 私聊显示 E2EE 状态徽章
- ✅ 移动端返回按钮

**不包含**：
- ❌ E2EE 协商弹窗
- ❌ 会话操作菜单
- ❌ 详情侧栏
- ❌ 修改 provider 逻辑
- ❌ 修改 E2EE 逻辑
- ❌ 修改路由

## 验证命令

```bash
cd flutter/apps/web
flutter analyze
flutter test
```

## 冲突记录

无
