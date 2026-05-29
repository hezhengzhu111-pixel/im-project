# E2EE 协商弹窗 UI 设计

## 概述

在 Flutter Web 的 ChatPage 中补齐 E2EE 协商弹窗，当收到对方的加密协商请求时，展示弹窗让用户选择接受或拒绝。

## 背景

Vue Web 已有完整的 E2EE 协商流程：
- WebSocket 接收 `E2EE_NEGOTIATION` 消息
- `ChatContainer.vue` 监听协商事件，缓存非当前会话的请求
- `ChatE2eeNegotiationDialog.vue` 展示协商弹窗
- 接受时调用 `respondToNegotiation` 完成 X3DH 密钥交换

Flutter Web 已有基础设施：
- `ChatNotifierWithOutbox` 已有 `pendingNegotiations` 状态管理
- `NegotiationDialog` 已存在但未接入 ChatPage
- `E2eeManager` 已有 `respondToNegotiation` 和 `rejectNegotiation` 方法

**缺口：** ChatPage 未监听协商状态并展示弹窗。

## 设计方案

### 数据流

```
WebSocket E2EE_NEGOTIATION
    ↓
ChatNotifierWithOutbox._handleE2eeNegotiation()
    ↓
state.pendingNegotiations[sessionId] = event
    ↓
ChatPage ref.listen(activePendingNegotiation)
    ↓
showDialog(NegotiationDialog)
    ↓
Accept → acceptPendingNegotiation() → respondToNegotiation()
Reject → rejectPendingNegotiation() → rejectNegotiation()
```

### UI 触发条件

| 条件 | 行为 |
|------|------|
| 当前会话有 pending request | 立即弹窗 |
| 非当前会话收到 request | 缓存 + SnackBar 通知 |
| 切换到有缓存请求的会话 | 自动弹窗 |
| 收到 accepted/rejected/disabled | 更新状态，不弹窗 |

### 组件改动

#### 1. NegotiationDialog 微调

- 添加 `isLoading` 状态（接受时显示"协商中..."）
- 添加 `errorMessage` 字段（失败时显示错误）
- 保持现有结构：requesterName、Accept/Reject 按钮

#### 2. ChatPage 改动

在 `_buildChatView` 中添加监听：

```dart
ref.listen(chatStateProvider.select((s) => s.activePendingNegotiation), (prev, next) {
  if (next != null && next.action == E2eeNegotiationAction.request) {
    _showNegotiationDialog(next);
  }
});
```

非当前会话通知：在协商事件到达时，如果请求不是当前会话，显示 SnackBar。

### 与 Vue 行为对比

| 功能 | Vue | Flutter（设计） |
|------|-----|----------------|
| 当前会话弹窗 | ✓ | ✓ |
| 非当前会话缓存 | ✓ | ✓（已有） |
| 非当前会话通知 | ElNotification | SnackBar |
| 切换会话自动弹窗 | ✓ | ✓ |
| 接受协商 | respondToNegotiation | acceptPendingNegotiation |
| 拒绝协商 | keyService.rejectEncryption | rejectPendingNegotiation |
| Loading 状态 | ✓ | ✓ |
| 错误提示 | ✓ | ✓ |

## 文件清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `flutter/apps/web/lib/features/e2ee/presentation/negotiation_dialog.dart` | 修改 | 添加 loading/error 状态 |
| `flutter/apps/web/lib/features/chat/presentation/chat_page.dart` | 修改 | 添加协商弹窗监听和展示逻辑 |

## 验证方式

1. 启动 Flutter Web 应用
2. 用户 A 向用户 B 发起 E2EE 协商
3. 用户 B 应看到协商弹窗
4. 点击接受：弹窗关闭，会话状态变为 encrypted
5. 点击拒绝：弹窗关闭，会话状态变为 plaintext
6. 非当前会话收到请求：显示 SnackBar 通知

## 约束

- 不重写 Codex-C2 状态模型
- 不改后端接口
- 不改 Vue 代码
- 不改消息发送逻辑
