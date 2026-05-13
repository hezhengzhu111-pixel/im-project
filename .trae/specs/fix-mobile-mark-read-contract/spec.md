# Android markRead 参数语义修正规格

## Why
Android mobile 端进入会话后，`markRead` 可能只清本地未读而未正确清理服务端未读，根因是移动端传参语义与共享接口契约命名存在偏差风险。需要先确认后端 `/message/read/:conversationId` 的真实参数语义，再在不改后端与 Web 业务逻辑的前提下修正 mobile 调用。

## What Changes
- 审计共享契约、Web 调用、mobile 调用与后端 `message/read` 路由/handler/controller 的真实参数语义
- 仅修复 Android mobile `markRead` 调用参数与语义命名，使其与后端真实契约保持一致
- 为 mobile `markRead` 增加针对私聊、群聊、成功与失败分支的单元测试
- 更新 Android 修复说明文档，记录后端语义结论、移动端处理策略与人工联调项
- 不新增业务功能
- 不改 Web 业务逻辑，除非审计确认共享契约命名本身明显错误且必须同步修正
- 不改后端业务逻辑
- 不重写 `messageStore`、`sessionStore`，也不调整 WebSocket 连接逻辑

## Impact
- Affected specs: mobile-message-read, shared-api-contract, backend-message-read-contract
- Affected code: `frontend/packages/shared-api-contract/src/message.endpoints.ts`、`frontend/apps/web/src/services/message.ts`、`frontend/apps/mobile/src/services/chat/messageService.ts`、`frontend/apps/mobile/src/stores/messageStore.ts`、`frontend/apps/mobile/src/stores/sessionStore.ts`、后端 `message/read` 路由与处理链、mobile 测试文件、Android 修复说明文档

## ADDED Requirements
### Requirement: 审计并确认 markRead 契约语义
系统 SHALL 审计共享接口契约、Web 端既有调用与后端 `message/read` 实现，明确 `/message/read/:conversationId` 路由参数的真实语义，并据此约束 mobile 端调用。

#### Scenario: 后端语义可从源码确认
- **WHEN** 审计到后端 `message/read` 路由、handler 与实际查询/更新逻辑
- **THEN** 结论必须明确说明该参数需要的是 `session.id` / `conversationId`、`friendId`、`groupId` 或其他值
- **THEN** mobile 端实现必须按该真实语义传参，且不得引入新的业务分支

#### Scenario: 后端语义无法从源码确认
- **WHEN** 后端源码无法唯一确定参数语义
- **THEN** 结论必须在修复报告中明确标注该不确定性
- **THEN** mobile 端调用 SHALL 与 Web 端现有调用语义保持一致，避免跨端继续分叉

### Requirement: Mobile markRead 修复边界
系统 SHALL 仅在 `frontend/apps/mobile` 范围内以最小改动修复 `markRead` 参数传递，并保持现有 store 结构、WebSocket 行为与页面交互不变。

#### Scenario: 后端语义为 conversationId
- **WHEN** 审计结论表明后端 `/message/read/:conversationId` 真实需要 `conversationId`
- **THEN** mobile `markRead` 一律传 `session.id`
- **THEN** 不得继续按群聊/私聊分支分别传 `resolveGroupSessionId(session.targetId)` 或 `session.targetId`

#### Scenario: 后端语义为混合值
- **WHEN** 审计结论表明私聊与群聊需要不同语义值，例如私聊传 `friendId` 而群聊传 `conversationId`
- **THEN** 系统 SHALL 在共享契约或 mobile service 中明确命名与注释，消除 `conversationId` 命名误导
- **THEN** 修复文档 SHALL 解释为何私聊继续传 `targetId`

### Requirement: markRead 失败时保持前台体验稳定
系统 SHALL 在 `markRead` 失败时保持页面可见状态与本地展示稳定，同时记录警告日志，避免影响会话打开流程。

#### Scenario: markRead 成功
- **WHEN** mobile 端成功调用 `markRead`
- **THEN** 本地 session 未读数必须清零
- **THEN** 行为应与当前页面显示保持一致，不引入额外用户提示

#### Scenario: markRead 失败
- **WHEN** mobile 端调用 `markRead` 失败
- **THEN** 页面显示不得因此中断或报错退出
- **THEN** 系统必须记录 warning 以便排查

### Requirement: markRead 回归测试覆盖
系统 SHALL 为 mobile `markRead` 提供针对关键参数语义和状态更新的单元测试。

#### Scenario: 私聊参数验证
- **WHEN** 针对 private session 执行 `markRead`
- **THEN** 测试必须断言传入后端的参数符合审计后的真实契约

#### Scenario: 群聊参数验证
- **WHEN** 针对 group session 执行 `markRead`
- **THEN** 测试必须断言传入后端的参数符合审计后的真实契约

#### Scenario: 成功与失败分支
- **WHEN** `markRead` 成功或失败
- **THEN** 测试必须分别覆盖本地 unread 清零与 warning 记录行为

## MODIFIED Requirements
### Requirement: Mobile 已读上报实现
移动端已读上报实现 SHALL 与共享接口契约命名、Web 端既有调用语义以及后端真实处理语义保持一致；当三者存在命名不一致时，系统必须在不改后端业务逻辑的前提下通过最小范围修正与文档说明消除歧义。

## REMOVED Requirements
