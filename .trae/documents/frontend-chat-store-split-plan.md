# Pinia Chat Store 拆分对齐计划

## Summary

- 目标：将聊天相关 Store 的职责边界明确为：
  - `useSessionStore` 负责会话状态与会话派生数据
  - `useMessageStore` 负责消息集合与消息历史
  - `useChatStore` 只保留跨域协调与 Facade 出口
- 严格边界：
  - 仅调整 state / getters / actions 在不同 Store 文件间的物理位置与调用关系
  - 不修改 API 请求地址、不改响应解析逻辑、不改变任何 UI 组件交互行为
- 基于当前仓库的核心结论：
  - `frontend/src/stores/message.ts` 与 `frontend/src/stores/session.ts` 已经存在，且大部分职责已经拆分完成
  - `frontend/src/stores/chat.ts` 也已经主要承担 Facade 角色
  - 当前真正需要对齐的重点，不是“从零拆分”，而是“确认边界、补齐缺口、收敛调用出口”

## Current State Analysis

### 1. `chat.ts` 当前状态

- 文件：`frontend/src/stores/chat.ts`
- 当前已经不再直接持有核心聊天 state，而是组合以下 Store：
  - `useContactStore()`
  - `useGroupStore()`
  - `useMessageStore()`
  - `useSessionStore()`
  - `useUserStore()`
- 主要职责已经是编排/协调：
  - `initChatBootstrap()`
  - `restoreCurrentSession()`
  - `refreshOnlineStatuses()`
  - `openPrivateSession()` / `openGroupSession()`
  - `sendMessage()`
  - `syncOfflineMessages()`
- 对外暴露的数据也基本是转发式 computed：
  - `sessions`
  - `sortedSessions`
  - `unreadCounts`
  - `totalUnreadCount`
  - `messages`
  - `currentMessages`
- 结论：
  - `useChatStore` 当前已经基本符合“瘦身后的 Facade Store”目标。

### 2. `session.ts` 当前状态

- 文件：`frontend/src/stores/session.ts`
- 当前已承载会话相关 state：
  - `currentSession`
  - `sessions`
  - `unreadCounts`
  - `loading`
- 当前已承载会话相关 getters / 派生：
  - `sortedSessions`
  - `totalUnreadCount`
- 当前已承载会话相关 actions：
  - `ensureSession`
  - `ensurePrivateSession`
  - `ensureGroupSession`
  - `setCurrentSession`
  - `clearCurrentSession`
  - `applyMessageToSession`
  - `updatePrivateSessionDisplay`
  - `mergeGroupMetadata`
  - `removeSession`
  - `removeGroupSession`
  - `restorePersistedCurrentSession`
  - `loadSessions`
  - `markSessionReadLocally`
  - `clearSessionConversationState`
  - `clear`
- 与目标相比，已覆盖：
  - “会话列表”
  - `currentSessionId` 对应的当前会话能力
  - 未读红点维护与总未读计算
- 当前剩余偏差：
  - 没有显式的“置顶动作”接口，例如 `toggleSessionPinned()`
  - `sortedSessions` 目前仅按 `lastActiveTime` 排序，尚未体现 `isPinned` 优先

### 3. `message.ts` 当前状态

- 文件：`frontend/src/stores/message.ts`
- 当前已承载消息相关 state：
  - `messages`
  - `loading`
  - `searchResults`
  - `messageTextConfig`
  - `sendingSessionLocks`
  - `readSessionLocks`
  - `readSessionLastAt`
  - `clearMarkers`
- 当前已承载消息相关 getters / 派生：
  - `currentMessages`
- 当前已承载消息相关 actions：
  - `loadMessages`
  - `addMessage`
  - `sendMessage`
  - `markAsRead`
  - `applyReadSync`
  - `applyReadReceipt`
  - `deleteMessage`
  - `clearMessages`
  - `searchMessages`
  - `clear`
- 与目标相比，已完整覆盖：
  - `messagesMap`
  - 消息增删改查
  - 历史记录分页拉取
- 结论：
  - `useMessageStore` 已经基本满足“消息体 Store”目标，后续更多是边界说明与出口统一，不需要大规模重写。

### 4. 组件调用现状

- 组件和 hooks 侧仍主要依赖 `useChatStore()`：
  - `frontend/src/features/chat/ChatContainer.vue`
  - `frontend/src/features/chat/composables/useMessageActions.ts`
  - `frontend/src/hooks/useChatLogic.ts`
  - `frontend/src/stores/websocket.ts`
  - 多个页面/组件
- 这意味着：
  - 当前 UI 侧已经把 `useChatStore` 当作统一 Facade
  - 若本轮执行，要避免让大量组件直接改为分别注入 `useSessionStore` / `useMessageStore`，否则会扩大改动面并触碰 UI 行为边界

## Proposed Changes

### A. `frontend/src/stores/session.ts`

#### 目标

- 明确成为“唯一的会话状态 Store”

#### 计划改动

- 保留现有 state 定义：
  - `currentSession`
  - `sessions`
  - `unreadCounts`
  - `loading`
- 保留现有会话相关 action 和 getter，不回迁到 `chat.ts`
- 补齐会话置顶能力，建议新增：
  - `toggleSessionPinned(sessionId: string, pinned?: boolean)`
  - 或 `setSessionPinned(sessionId: string, pinned: boolean)`
- 将 `sortedSessions` 调整为：
  1. `isPinned === true` 的会话优先
  2. 同组内按 `lastActiveTime` 倒序
- 若需要保留兼容输出，可继续维持 `pinned` / `isPinned` 双字段镜像

#### 原因

- 这一步是当前仓库与目标描述之间最明显的缺口
- 置顶排序属于典型会话域行为，应该只存在于 `session.ts`

### B. `frontend/src/stores/message.ts`

#### 目标

- 继续作为“唯一的消息状态 Store”

#### 计划改动

- 保留现有 state 定义：
  - `messages`
  - `loading`
  - `searchResults`
  - `messageTextConfig`
  - `sendingSessionLocks`
  - `readSessionLocks`
  - `readSessionLastAt`
  - `clearMarkers`
- 保留现有消息动作：
  - `loadMessages`
  - `addMessage`
  - `sendMessage`
  - `markAsRead`
  - `applyReadReceipt`
  - `deleteMessage`
  - `clearMessages`
  - `searchMessages`
- 执行阶段只做必要的边界收敛：
  - 检查是否仍有会话域逻辑残留在消息 Store
  - 若仅是依赖 `sessionStore` 做联动更新，则保留这种协作，不视为越界

#### 原因

- 当前 `message.ts` 已基本达到目标要求
- 过度改写会增加对 API 解析和消息收发链路的回归风险

### C. `frontend/src/stores/chat.ts`

#### 目标

- 明确作为 Facade / 协调层 Store

#### 计划改动

- 保留当前跨域协调职责：
  - 启动初始化
  - 当前会话恢复
  - 在线状态刷新
  - 会话打开与切换后触发消息加载
  - 联系人/群组/消息间的组合编排
- 对外继续暴露 Facade 风格 API，避免组件侧大规模改写
- 仅做边界收敛：
  - 不再新增真正属于会话 state 或消息 state 的本地 state
  - 置顶动作若需要对外暴露，则通过 `sessionStore` 透传，例如：
    - `pinSession`
    - `toggleSessionPinned`
- 保持现有 UI 调用方式尽量不变：
  - 组件继续优先使用 `useChatStore()`
  - `chat.ts` 内部再委派给 `sessionStore` / `messageStore`

#### 原因

- 这最符合你要求的“Facade 模式”
- 也最符合当前项目已经形成的组件依赖关系

### D. 测试与回归点

#### 文件

- `frontend/src/test/chat-store.spec.ts`

#### 计划改动

- 现有测试主要还是通过 `useChatStore` 验证行为，这与 Facade 方案兼容
- 执行阶段应补充或更新以下断言：
  - `chatStore.sessions` 仍能从 `sessionStore` 正常透出
  - `chatStore.currentMessages` 仍能从 `messageStore` 正常透出
  - 会话置顶后，`sortedSessions` 中置顶会话优先
  - `openPrivateSession` / `openGroupSession` 仍触发消息加载
  - `markAsRead` / `clearMessages` 等调用路径不变

## Assumptions & Decisions

- 当前仓库已经完成了大部分拆分，后续执行以“对齐和补缝”为主，不做推倒重来。
- 组件层继续通过 `useChatStore()` 获取聊天能力，避免触碰 UI 行为边界。
- `useSessionStore` 是会话域唯一归属者，后续所有会话列表、当前会话、未读数、置顶都应集中在此。
- `useMessageStore` 是消息域唯一归属者，后续所有消息列表、消息分页、消息读状态都应集中在此。
- `useChatStore` 不再新增“真正持久状态”，只保留 computed 转发与跨 Store 编排。

## Verification Steps

### 结构验证

- `chat.ts` 中不新增重复的会话/消息 state
- `session.ts` 中明确包含：
  - `sessions`
  - `currentSession`
  - `unreadCounts`
  - 置顶 action
  - 置顶优先排序
- `message.ts` 中明确包含：
  - `messages`
  - `currentMessages`
  - `loadMessages`
  - `sendMessage`
  - `markAsRead`
  - `clearMessages`

### 调用验证

- 组件仍可通过 `useChatStore()` 完成：
  - 读取会话列表
  - 切换会话
  - 加载消息
  - 发送消息
  - 标记已读
- 组件不需要改动 API 请求参数与响应解析方式

### 测试验证

- 运行 `frontend/src/test/chat-store.spec.ts`
- 如新增 `session-store.spec.ts` / `message-store.spec.ts`，验证：
  - 置顶排序
  - 未读数计算
  - 消息分页加载
  - Facade 透传行为

### 非目标回归

- API 请求地址不变
- 响应数据结构解析逻辑不变
- UI 组件交互行为不变
