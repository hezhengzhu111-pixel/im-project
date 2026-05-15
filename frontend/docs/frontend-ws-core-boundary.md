# Frontend WebSocket Core Boundary

本文档是阶段四 WebSocket 状态机与跨端事件处理边界的稳定裁决。后续 Mimo 任务必须按 `W1` 到 `W25` 的条款编号引用，不得用临时标题或自然语言替代编号。

阶段四只允许收敛 Web/Mobile 之间可共享的纯协议规则和纯策略，不允许改变现有 WebSocket connect/reconnect/dispatch 用户可见行为，不允许改 UI、E2EE、后端接口或 store 架构。

## W1. shared-ws-core 职责边界

### 规则描述

`frontend/packages/shared-ws-core/src` 只能承载 Web 与 Mobile 共享的 WebSocket 协议类型、常量、纯函数和纯策略。函数输出必须由入参决定，不得读取或写入 Pinia、Zustand、DOM、React Native、真实 `WebSocket`、notification、storage、debugTelemetry 或平台生命周期状态。

### 允许修改位置

- `frontend/packages/shared-ws-core/src/**`
- `frontend/packages/shared-ws-core/src/__tests__/**`
- `frontend/packages/shared-api-contract/src/websocket.endpoints.ts`
- `frontend/packages/shared-api-contract/src/codes.ts` 中 WebSocket 协议枚举的补充

### 禁止修改位置

- Web/Mobile store 架构、UI、E2EE、后端 API 路径
- 任何把平台 I/O 下沉到 `shared-ws-core` 的改动
- 在 `shared-ws-core` 中引入 Pinia、Zustand、Vue、React、React Native、DOM、真实 `WebSocket`

### Web 端保留职责

Web 继续负责 Pinia 容器、真实 socket 创建、handler 绑定、timer 调度、Element Plus 通知、localStorage 缓存、Web/Capacitor 生命周期绑定和 Web 端 service 调用。

### Mobile 端保留职责

Mobile 继续负责 Zustand 容器、真实 socket 创建、handler 绑定、timer 调度、RN notification、SQLite/MMKV/Keychain 等平台存储、AppState/NetInfo 绑定和 Mobile service 调用。

### shared-ws-core 可承载的纯函数或类型

可承载 URL 构造、heartbeat payload 构造、reconnect delay 计算、payload parse/type guard、sequential 判断、event classification、presence map 纯更新、duplicate message cache 纯策略、contact refresh action 纯分类。

### 后续 Mimo 任务引用方式

引用本节使用 `W1`。例如：`按 W1 将事件分类提取为 shared-ws-core 纯函数，端侧只消费分类结果`。

## W2. Web WebSocket store 职责边界

### 规则描述

`frontend/apps/web/src/stores/websocket.ts` 是 Web 运行时编排层，只保留 Pinia 状态、真实 socket 生命周期、timer、通知、localStorage、Web lifecycle/network resume 和调用 chat/contact/user/auth service 的职责。它可以调用 `shared-ws-core`，但不能继续沉淀跨端可复用的协议规则副本。

### 允许修改位置

- `frontend/apps/web/src/stores/websocket.ts`
- `frontend/apps/web/src/stores/chat.ts`
- `frontend/apps/web/src/config/**`
- `frontend/apps/web/src/services/platform/**`
- `frontend/apps/web/src/test/**` 中 WebSocket store 相关测试

### 禁止修改位置

- 在 Web store 内新增可跨端共享的 URL、heartbeat、reconnect、payload guard、event classification 重复规则
- 为阶段四修改 UI、E2EE 流程、后端接口、API 路径
- 把 Web-only 平台对象传入 shared 层持久保存

### Web 端保留职责

Web 保留 `authService.issueWsTicket`、`new WebSocket`、`setInterval`、`setTimeout`、`window.dispatchEvent`、`document.hidden`、Element Plus 通知和 localStorage 读写。

### Mobile 端保留职责

无直接修改职责；Mobile 只在对齐同一 shared 规则时保持自身 store 编排语义。

### shared-ws-core 可承载的纯函数或类型

Web store 可调用 shared 的 URL 构造、payload parse/type guard、`shouldProcessSequentially`、reconnect delay、duplicate suppression 策略和事件分类类型。

### 后续 Mimo 任务引用方式

引用本节使用 `W2`。例如：`按 W2 保留 Web timer 管理，仅替换 reconnect delay 的计算来源`。

## W3. Mobile WebSocket store 职责边界

### 规则描述

`frontend/apps/mobile/src/stores/websocketStore.ts` 是 Mobile 运行时编排层，只保留 Zustand 状态、真实 socket 生命周期、timer、RN notification、debugTelemetry、AppState/NetInfo resume 和调用 auth/chat/contact/message/session service 的职责。它可以调用 `shared-ws-core`，但不能把平台字段或平台对象污染进 shared。

### 允许修改位置

- `frontend/apps/mobile/src/stores/websocketStore.ts`
- `frontend/apps/mobile/src/stores/chatStore.ts`
- `frontend/apps/mobile/src/constants/config.ts`
- `frontend/apps/mobile/src/services/platform/**`
- `frontend/apps/mobile/src/services/notification/**`
- `frontend/apps/mobile/src/**/__tests__/**` 中 Mobile WebSocket store 相关测试

### 禁止修改位置

- 在 Mobile store 内新增可跨端共享的 URL、heartbeat、reconnect、payload guard、event classification 重复规则
- 为阶段四修改 RN UI、导航、E2EE、后端接口、API 路径
- 将 RN notification、debugTelemetry、MMKV、Keychain、SQLite 或 NetInfo 下沉到 shared

### Web 端保留职责

无直接修改职责；Web 只在对齐同一 shared 规则时保持自身 store 编排语义。

### Mobile 端保留职责

Mobile 保留 `authService.issueWsTicket`、`new WebSocket`、`setInterval`、`setTimeout`、RN notification、debugTelemetry、AppState/NetInfo 绑定和本地平台存储。

### shared-ws-core 可承载的纯函数或类型

Mobile store 可调用 shared 的 URL 构造、heartbeat payload、payload parse/type guard、`shouldProcessSequentially`、reconnect delay、presence map 更新和事件分类类型。

### 后续 Mimo 任务引用方式

引用本节使用 `W3`。例如：`按 W3 保留 Mobile debugTelemetry，只将 payload guard 改为 shared-ws-core 调用`。

## W4. 平台层职责边界

### 规则描述

平台层是 Web/Mobile 各自持有副作用的位置，负责 lifecycle、network、notification、storage、telemetry、browser/RN SDK 和用户可见反馈。平台层可以触发 store 方法，但不能定义跨端 WebSocket 协议语义。

### 允许修改位置

- Web: `frontend/apps/web/src/services/platform/**`
- Mobile: `frontend/apps/mobile/src/services/platform/**`
- Mobile: `frontend/apps/mobile/src/services/notification/**`
- Web/Mobile 各自的配置、测试和平台适配代码

### 禁止修改位置

- `frontend/packages/shared-ws-core/src/**` 中引入平台 SDK 或平台状态
- 在平台层重新定义 payload type guard、event routing、reconnect delay、sequential 判断等共享语义
- 为接入平台事件改变 connect/reconnect/dispatch 外部行为

### Web 端保留职责

Web 平台层保留 document visibility、online/offline、Capacitor app state、browser event listener 和 cleanup。

### Mobile 端保留职责

Mobile 平台层保留 AppState、NetInfo、notification permission、FCM/notifee、badge、route from notification 和平台存储。

### shared-ws-core 可承载的纯函数或类型

shared 只可承载平台输入的纯解释结果类型，例如 `resume reason`、`network availability input` 的类型定义或纯 action plan，不可绑定监听器。

### 后续 Mimo 任务引用方式

引用本节使用 `W4`。例如：`按 W4 保留 NetInfo 监听在 Mobile 平台层，不下沉到 shared-ws-core`。

## W5. 禁止下沉到 shared-ws-core 的能力

### 规则描述

`shared-ws-core` 禁止承载任何 I/O、副作用、运行时资源或平台专有能力。明确禁止：`authService.issueWsTicket`、`new WebSocket`、`setInterval`/`setTimeout` 实际调用、`ElMessage`/`ElNotification`、RN notification、localStorage、MMKV、Keychain、SQLite、appLifecycle/networkStatus 绑定、debugTelemetry。

### 允许修改位置

- 端侧 store 或 platform/service 中保留并整理上述能力的调用点
- shared 仅补充这些能力需要消费的纯输入/输出类型

### 禁止修改位置

- `frontend/packages/shared-ws-core/src/**` 中出现上述能力或其 import
- 通过回调把 shared 变成长期持有副作用调度器
- 为复用而把平台状态单例放入 shared

### Web 端保留职责

Web 继续直接持有浏览器、Element Plus、localStorage、socket 和 timer 能力。

### Mobile 端保留职责

Mobile 继续直接持有 RN、notification、debugTelemetry、平台存储、socket 和 timer 能力。

### shared-ws-core 可承载的纯函数或类型

只可承载与上述能力解耦的纯策略，例如 `shouldReconnect(input)`、`createReconnectDelay(attempt, base)`、`classifyIncomingPayload(payload)`。

### 后续 Mimo 任务引用方式

引用本节使用 `W5`。例如：`按 W5 禁止把 issueWsTicket 移入 shared-ws-core`。

## W6. WebSocket URL / ticket 参数规则

### 规则描述

WebSocket URL 构造规则归 `shared-ws-core`，ticket 获取归端侧。shared 只根据 `baseUrl`、`userId`、`ticket` 和协议端点常量生成 URL，并负责 `ticket` query 参数编码；Web/Mobile 各自从配置中取 base URL，并各自调用 auth service 获取一次性 ticket。

### 允许修改位置

- `frontend/packages/shared-ws-core/src/path.ts`
- `frontend/packages/shared-api-contract/src/websocket.endpoints.ts`
- Web: `frontend/apps/web/src/config/**`、`frontend/apps/web/src/stores/websocket.ts`
- Mobile: `frontend/apps/mobile/src/constants/config.ts`、`frontend/apps/mobile/src/stores/websocketStore.ts`

### 禁止修改位置

- 在 shared 中调用 `authService.issueWsTicket`
- 在 shared 中读取 `import.meta.env`、`window.location`、RN runtime config
- Web/Mobile 各自重新拼接 ticket query 形成重复规则

### Web 端保留职责

Web 保留 `import.meta.env.DEV`、`WS_CONFIG.BASE_URL`、dev relative URL 选择和 ticket 获取失败提示。

### Mobile 端保留职责

Mobile 保留 `APP_CONFIG.WS_BASE_URL`、runtime config 注入和 ticket 获取失败 telemetry。

### shared-ws-core 可承载的纯函数或类型

可承载 `createTicketedWebSocketUrl(baseUrl, userId, ticket)`、URL 参数名常量引用和 URL 输入类型。

### 后续 Mimo 任务引用方式

引用本节使用 `W6`。例如：`按 W6 删除端侧手写 ticket query，统一调用 createTicketedWebSocketUrl`。

## W7. 连接状态规则

### 规则描述

连接状态语义包括 connecting、connected、disconnected、reconnecting/error 的展示或诊断映射。端侧 store 持有真实状态和状态切换；shared 可承载由布尔状态派生显示状态的纯函数，但不得拥有 socket lifecycle。

### 允许修改位置

- Web: `frontend/apps/web/src/stores/websocket.ts`
- Mobile: `frontend/apps/mobile/src/stores/websocketStore.ts`
- shared: `frontend/packages/shared-ws-core/src/**` 中新增纯状态派生函数和类型

### 禁止修改位置

- shared 中保存连接状态单例
- shared 中直接响应 `onopen`、`onclose`、`onerror`
- 为统一状态名改变端侧已有用户可见连接行为

### Web 端保留职责

Web 保留 `ref`/`computed` 状态容器、`connectionStatus` 暴露和 socket event handler 内的状态赋值。

### Mobile 端保留职责

Mobile 保留 Zustand 状态容器、diagnostics 状态快照和 socket event handler 内的状态赋值。

### shared-ws-core 可承载的纯函数或类型

可承载 `WsConnectionStatus` 类型、`deriveConnectionStatus({ connected, connecting })`、状态转换输入类型。

### 后续 Mimo 任务引用方式

引用本节使用 `W7`。例如：`按 W7 只提取状态派生，不移动 onopen/onclose handler`。

## W8. manual disconnect / duplicate connection 规则

### 规则描述

manual disconnect 与 duplicate connection 都是 reconnect stop 条件。shared 可承载 close reason 常量和纯判断；端侧负责设置 `manualDisconnect`、调用 `socket.close`、清理 timer 和跳过 reconnect。

### 允许修改位置

- `frontend/packages/shared-ws-core/src/constants.ts`
- `frontend/packages/shared-ws-core/src/strategy.ts`
- Web/Mobile WebSocket store 的 close handler 与 disconnect 方法

### 禁止修改位置

- shared 中调用 `socket.close`
- shared 中保存 `manualDisconnect` 可变状态
- 端侧绕过 shared 常量手写 duplicate reason 字符串

### Web 端保留职责

Web 保留 `manualDisconnect` ref、`socket.close(1000, "manual_disconnect")`、connection cache 清理和 Element Plus reconnect limit 提示。

### Mobile 端保留职责

Mobile 保留模块级 `manualDisconnect`、`socket.close(1000, "manual_disconnect")`、reconnect timer 清理和 debugTelemetry 记录。

### shared-ws-core 可承载的纯函数或类型

可承载 `DUPLICATE_CONNECTION_REASON`、`shouldReconnectAfterClose({ manualDisconnect, closeReason, closeCode })`。

### 后续 Mimo 任务引用方式

引用本节使用 `W8`。例如：`按 W8 用 shared close 判断替换端侧 duplicate reason 分支`。

## W9. heartbeat payload 与 heartbeat timer 规则

### 规则描述

heartbeat payload 协议归 shared，heartbeat timer 调度归端侧。shared 只构造符合 `HEARTBEAT` envelope 的 payload；时间戳应由调用方传入或作为显式输入，避免 shared 内部持有 timer 或长期状态。

### 允许修改位置

- `frontend/packages/shared-ws-core/src/heartbeat.ts`
- Web: `frontend/apps/web/src/stores/websocket.ts`、`frontend/apps/web/src/config/**`
- Mobile: `frontend/apps/mobile/src/stores/websocketStore.ts`、`frontend/apps/mobile/src/constants/config.ts`

### 禁止修改位置

- shared 中调用 `setInterval`、`clearInterval`、`socket.send`
- shared 中读取平台 timer 状态
- 为统一 heartbeat 间隔改变 Web/Mobile 现有配置值

### Web 端保留职责

Web 保留 `WS_CONFIG.HEARTBEAT_INTERVAL`、`setInterval`、`clearInterval`、open socket 检查和 send error 日志。

### Mobile 端保留职责

Mobile 保留 `WS_CONFIG.heartbeatIntervalMs`、`setInterval`、`clearInterval`、`WebSocket.OPEN` 检查和 send 调用。

### shared-ws-core 可承载的纯函数或类型

可承载 `createHeartbeatPayload(timestampMs)`、heartbeat envelope 类型和 heartbeat type guard。若保留无参兼容包装，后续任务必须保证核心规则有显式 timestamp 入参和测试。

### 后续 Mimo 任务引用方式

引用本节使用 `W9`。例如：`按 W9 提取 heartbeat payload，不移动 startHeartbeat/stopHeartbeat`。

## W10. reconnect delay / reconnect stop 规则

### 规则描述

reconnect delay 和 stop 判断是纯策略，允许进入 shared；真实 timer、attempt 状态、用户提示和 telemetry 留在端侧。策略输入必须包含 attempt、base delay、max attempts、manual disconnect、duplicate close reason 等必要字段。

### 允许修改位置

- `frontend/packages/shared-ws-core/src/strategy.ts`
- Web/Mobile WebSocket store 中调用策略的位置
- Web/Mobile 配置中的现有 reconnect 参数读取点

### 禁止修改位置

- shared 中调用 `setTimeout`、`clearTimeout`
- shared 中读取 Web/Mobile 配置单例
- 借阶段四修改现有最大重连次数或基础间隔

### Web 端保留职责

Web 保留 reconnect timer、attempt ref、limit notification、`connect(userId)` 重新调度。

### Mobile 端保留职责

Mobile 保留 reconnect timer、attempt Zustand 状态、debugTelemetry 和 `connect()` 重新调度。

### shared-ws-core 可承载的纯函数或类型

可承载 `createReconnectDelay(attempt, baseInterval)`、`shouldScheduleReconnect(input)`、reconnect decision 类型。

### 后续 Mimo 任务引用方式

引用本节使用 `W10`。例如：`按 W10 只替换 delay/stop 计算，不移动 reconnect timer`。

## W11. payload parse / envelope type guard 规则

### 规则描述

payload parse、envelope type guard 和事件类型识别归 shared。端侧负责读取 `MessageEvent.data`、记录 parse 错误、决定是否丢弃或 dispatch。shared 的 parse 失败必须返回显式失败值，不抛端侧不可控异常。

### 允许修改位置

- `frontend/packages/shared-ws-core/src/payload.ts`
- `frontend/packages/shared-api-contract/src/codes.ts`
- Web/Mobile WebSocket store 的 message handler 调用点

### 禁止修改位置

- Web/Mobile store 内继续新增重复 JSON parse/type guard 规则
- shared 中依赖 DOM `MessageEvent`
- shared 中记录 telemetry 或展示错误提示

### Web 端保留职责

Web 保留 `event.data` 获取、logger 记录、dispatch 到 `handleMessage` 和异常隔离。

### Mobile 端保留职责

Mobile 保留 `event.data` 获取、logger/debugTelemetry 记录、dispatch 到 `dispatchPayload` 和异常隔离。

### shared-ws-core 可承载的纯函数或类型

可承载 `parseWebSocketPayload(raw)`、`isMessagePayload`、`isOnlineStatusPayload`、`isReadReceiptPayload`、`isSystemPayload`、通用 envelope guard 和 typed parse result。

### 后续 Mimo 任务引用方式

引用本节使用 `W11`。例如：`按 W11 将端侧 JSON.parse 分支替换为 parseWebSocketPayload`。

## W12. incoming sequential queue 规则

### 规则描述

是否进入 incoming sequential queue 是共享纯判断；队列本身是端侧运行时调度。当前规则是 `MESSAGE` 且 inner type 不是 `SYSTEM` 的消息需要串行处理，system、heartbeat、presence、read receipt 等不阻塞队列。

### 允许修改位置

- `frontend/packages/shared-ws-core/src/strategy.ts`
- Web: `incomingProcessing` 的调用点
- Mobile: `incomingTail` 的调用点

### 禁止修改位置

- shared 中保存 Promise tail
- shared 中执行 dispatch 或捕获端侧 store 异常
- 端侧重新实现 `shouldProcessSequentially` 等价规则

### Web 端保留职责

Web 保留 `incomingProcessing` Promise tail、错误日志和 `handleMessage` 实际执行。

### Mobile 端保留职责

Mobile 保留 `incomingTail` Promise tail、错误隔离和 `dispatchPayload` 实际执行。

### shared-ws-core 可承载的纯函数或类型

可承载 `shouldProcessSequentially(messageType, innerType)`、`extractInnerMessageType(envelope)` 等纯判断。

### 后续 Mimo 任务引用方式

引用本节使用 `W12`。例如：`按 W12 保留 Promise tail 在端侧，只统一 sequential 判断`。

## W13. message event routing 规则

### 规则描述

WebSocket envelope 到业务 action 的分类可进入 shared，实际路由执行必须留在端侧。shared 可以判断 `MESSAGE`、`MESSAGE_STATUS_CHANGED`、`SYSTEM`、`READ_RECEIPT` 等事件类别，但不能调用 chat/message/session/contact store。

### 允许修改位置

- `frontend/packages/shared-ws-core/src/**` 中新增 event classification
- Web: `frontend/apps/web/src/stores/websocket.ts`
- Mobile: `frontend/apps/mobile/src/stores/websocketStore.ts`

### 禁止修改位置

- shared 中 import Web/Mobile store
- shared 中 normalize 平台模型并写入状态容器
- 为统一 routing 改变现有消息入库、通知或 session 更新外部行为

### Web 端保留职责

Web 保留 `normalizeMessage`、E2EE decrypt intercept、`chatStore.addMessage`、`chatStore.applyReadReceipt`、Element Plus 通知和 contact refresh 执行。

### Mobile 端保留职责

Mobile 保留 `normalizeMessage`、`useMessageStore.addMessage`、`useSessionStore.upsertSession`、`useChatStore.refreshSessions` 和 RN notification 执行。

### shared-ws-core 可承载的纯函数或类型

可承载 `classifyWsEvent(envelope)`、routing action 类型、message/status/system/read/presence/contact/e2ee 分类枚举。

### 后续 Mimo 任务引用方式

引用本节使用 `W13`。例如：`按 W13 提取事件分类，不移动 chatStore.addMessage`。

## W14. online status / presence 规则

### 规则描述

presence 的纯更新规则可以进入 shared，presence 状态容器、查询 API、浏览器事件和 UI 通知留在端侧。shared 只根据 userId/status 输入返回下一份 presence map 或增量结果。

### 允许修改位置

- `frontend/packages/shared-ws-core/src/**` 中新增 presence 纯函数和类型
- Web: `onlineUsers` Set、`refreshOnlineStatus`、`window.dispatchEvent` 调用点
- Mobile: `onlineUsers` Record 和 dispatch 处理点

### 禁止修改位置

- shared 中调用 `userService.checkOnlineStatus`
- shared 中触发 `window.dispatchEvent`
- shared 中持有 presence map 单例

### Web 端保留职责

Web 保留 Set 状态容器、known userId 收集、online status API 调用和 `onlineStatusChanged` 事件派发。

### Mobile 端保留职责

Mobile 保留 Record 状态容器、payload dispatch 内状态写入和 `isUserOnline` 读取。

### shared-ws-core 可承载的纯函数或类型

可承载 `normalizePresenceUserId`、`applyPresenceUpdate(map, update)`、`applyPresenceBatch(map, batch)` 和 presence payload guard。

### 后续 Mimo 任务引用方式

引用本节使用 `W14`。例如：`按 W14 只把 presence map 更新变成 shared 纯函数`。

## W15. read receipt event 规则

### 规则描述

READ_RECEIPT envelope 的识别和 payload guard 归 shared-ws-core；已读状态如何应用到消息和会话语义归 shared-im-core 或端侧既有 store 调用链。WebSocket 层不得重新定义 read receipt apply 语义。

### 允许修改位置

- `frontend/packages/shared-ws-core/src/payload.ts`
- `frontend/packages/shared-im-core/src/read-receipt.ts`
- Web/Mobile WebSocket store 的 read receipt dispatch 调用点

### 禁止修改位置

- 在 Web/Mobile WebSocket store 中新增 read receipt apply 规则
- 在 shared-ws-core 中修改消息/会话 read receipt 状态
- 改变 `markRead` API 或后端协议

### Web 端保留职责

Web 保留 `chatStore.applyReadReceipt(data)` 调用和必要的 session/message store 编排。

### Mobile 端保留职责

Mobile 保留 `useMessageStore.applyReadReceipt(data)`、必要的 `refreshSessions` 编排和错误隔离。

### shared-ws-core 可承载的纯函数或类型

可承载 `isReadReceiptPayload`、`normalizeReadReceiptEvent` 的协议层类型 guard，不承载 IM 状态 apply。

### 后续 Mimo 任务引用方式

引用本节使用 `W15`。例如：`按 W15 只统一 READ_RECEIPT 识别，不在 ws-core 写消息已读状态`。

## W16. friend request / friend accepted / contact refresh 规则

### 规则描述

friend request、friend accepted 和 contact refresh 的 action 分类可以进入 shared；实际刷新好友请求、好友列表、会话列表和通知展示留在端侧。Web 可继续 debounce，Mobile 可继续 `Promise.allSettled`。

### 允许修改位置

- `frontend/packages/shared-ws-core/src/**` 中新增 contact refresh action 分类
- Web: `queueContactRefresh`、`debouncedRefreshContactData`
- Mobile: friend/contact/session refresh dispatch 分支

### 禁止修改位置

- shared 中调用 `loadFriendRequests`、`loadFriends`、`refreshSessions`
- shared 中持有 debounce timer
- shared 中展示通知

### Web 端保留职责

Web 保留 pending refresh 聚合、debounce timer、Element Plus notification 和 chat store 刷新调用。

### Mobile 端保留职责

Mobile 保留 contact store 刷新、chat session refresh、RN notification 或无通知策略。

### shared-ws-core 可承载的纯函数或类型

可承载 `classifyContactRefreshAction(event)`、`parseSystemContactCommand(content)`、`ContactRefreshAction` 类型。

### 后续 Mimo 任务引用方式

引用本节使用 `W16`。例如：`按 W16 提取 FRIEND_ACCEPTED 到 refresh action 的纯分类`。

## W17. system message command 规则

### 规则描述

system message command 的字符串解析和 action 分类可以进入 shared；实际执行和通知留在端侧。当前 Web 使用 `::CMD:` 承载 `REFRESH_FRIEND_REQUESTS`、`REFRESH_FRIEND_LIST` 等命令，后续必须避免在 Web/Mobile 分散重复解析。

### 允许修改位置

- `frontend/packages/shared-ws-core/src/**` 中新增 system command parser
- Web: system 分支调用 parser 后执行 action
- Mobile: 如支持 system command，也必须调用同一 parser

### 禁止修改位置

- shared 中调用 contact/session store
- shared 中展示 `ElMessage` 或 RN notification
- 端侧新增另一套 `::CMD:` 解析规则

### Web 端保留职责

Web 保留 `queueContactRefresh`、fallback `ElMessage.info` 和系统消息 UI 反馈。

### Mobile 端保留职责

Mobile 保留是否响应 system command 的端侧策略和 store 刷新执行。

### shared-ws-core 可承载的纯函数或类型

可承载 `parseSystemCommand(content)`、`SystemCommand` 枚举、`SystemCommandAction` 类型。

### 后续 Mimo 任务引用方式

引用本节使用 `W17`。例如：`按 W17 统一 ::CMD: 解析，端侧只执行返回 action`。

## W18. duplicate message suppression 规则

### 规则描述

重复消息抑制的 cache 策略可以进入 shared，cache 存储位置和本地状态查询留在端侧。shared 可根据 messageId、时间戳、TTL、最大容量和已有 cache 返回是否处理及下一份 cache；不得扫描端侧 message store。

### 允许修改位置

- `frontend/packages/shared-ws-core/src/**` 中新增 duplicate 策略
- Web: `recentMessageIds` 和本地 message state 查询调用点
- Mobile: 如引入实时重复抑制，必须使用同一 shared 策略

### 禁止修改位置

- shared 中持有全局 recent message cache
- shared 中读取 Web/Mobile message store
- 端侧新增另一套 TTL/容量规则

### Web 端保留职责

Web 保留 `recentMessageIds` 容器、message store 扫描和 server retry 导致的本地已有消息判断。

### Mobile 端保留职责

Mobile 保留 message repository/store 查询、是否需要本地 cache 的运行时决策。

### shared-ws-core 可承载的纯函数或类型

可承载 `evaluateDuplicateMessage(cache, messageId, now, options)`、cache prune 纯函数和 decision 类型。

### 后续 Mimo 任务引用方式

引用本节使用 `W18`。例如：`按 W18 把 TTL/容量判断提为 shared，cache Map 仍由端侧持有`。

## W19. notification trigger 规则

### 规则描述

notification trigger 的纯判断可以进入 shared，通知展示和权限处理必须留在端侧。shared 可根据是否当前会话、是否自己发送、是否 muted、平台可见性输入等返回是否应通知；不得读取 `document.hidden` 或调用 RN notification。

### 允许修改位置

- `frontend/packages/shared-ws-core/src/**` 中新增 notification decision 纯函数
- Web: `showMessageNotification`
- Mobile: `displayMessageNotification` 调用前的判断

### 禁止修改位置

- shared 中调用 `ElNotification`、notifee、FCM、badge API
- shared 中读取 document、AppState、notification permission
- 为统一判断改变现有可见通知行为

### Web 端保留职责

Web 保留 `document.hidden` 输入采集、Element Plus notification 展示和消息内容展示策略。

### Mobile 端保留职责

Mobile 保留 notifee/FCM、badge、notification permission、route data 和用户设置读取。

### shared-ws-core 可承载的纯函数或类型

可承载 `shouldNotifyForMessage({ isCurrent, isSelf, isMuted, appVisible })` 和 notification decision 类型。

### 后续 Mimo 任务引用方式

引用本节使用 `W19`。例如：`按 W19 只提取 shouldNotify 判断，不移动 displayMessageNotification`。

## W20. E2EE_NEGOTIATION 事件边界

### 规则描述

`E2EE_NEGOTIATION` 的 envelope 识别和基础 payload 类型 guard 可以进入 shared；E2EE 协商状态机、密钥、解密、事件总线、UI 提示和 Mobile deferred 策略必须留在端侧或 E2EE 模块。WebSocket shared 层不得理解密钥材料语义。

### 允许修改位置

- `frontend/packages/shared-ws-core/src/**` 中新增 E2EE negotiation payload guard
- Web: `frontend/apps/web/src/features/e2ee/**` 和 websocket dispatch 调用点
- Mobile: `frontend/apps/mobile/src/e2ee/**` 和 websocket ignored/deferred 调用点

### 禁止修改位置

- shared-ws-core 中导入 E2EE manager、negotiation-events 或密钥存储
- shared-ws-core 中执行 decrypt/initiate negotiation
- 阶段四改变 E2EE 用户可见流程

### Web 端保留职责

Web 保留 E2EE event normalize、`emitE2eeNegotiation`、decrypt intercept、notification 和本地 negotiation 状态。

### Mobile 端保留职责

Mobile 保留 E2EE deferred/ignored 策略和后续 RN E2EE 模块接入点。

### shared-ws-core 可承载的纯函数或类型

可承载 `isE2eeNegotiationPayload`、协议字段 guard 和不含密钥逻辑的 event type。

### 后续 Mimo 任务引用方式

引用本节使用 `W20`。例如：`按 W20 仅提取 E2EE_NEGOTIATION guard，不移动 E2EE manager 调用`。

## W21. lifecycle / network resume 边界

### 规则描述

lifecycle/network resume 是平台副作用边界。端侧负责监听 foreground/online、触发 reconnect、retry pending、refresh sessions 和 offline sync；shared 最多承载由平台输入生成 resume action plan 的纯类型，不绑定监听器。

### 允许修改位置

- Web: `frontend/apps/web/src/services/platform/**`、`frontend/apps/web/src/stores/websocket.ts`、`frontend/apps/web/src/stores/chat.ts`
- Mobile: `frontend/apps/mobile/src/services/platform/**`、`frontend/apps/mobile/src/stores/websocketStore.ts`、`frontend/apps/mobile/src/stores/chatStore.ts`
- shared: 仅新增纯 action plan 类型或判断

### 禁止修改位置

- shared 中 import AppState、NetInfo、Capacitor、window event listener
- shared 中直接调用 reconnect、retry pending、refresh sessions
- 阶段四改变 resume 时机或批处理参数

### Web 端保留职责

Web 保留 `setupLifecycleListeners`、foreground/online reconnect、`scheduleRealtimeResume` 和 offline sync 编排。

### Mobile 端保留职责

Mobile 保留 `bindResumeHooks`、AppState/NetInfo 监听、`retryPending` 和 reconnect 编排。

### shared-ws-core 可承载的纯函数或类型

可承载 `ResumeReason`、`ResumeActionPlan` 类型和 `createResumePlan(input)` 纯函数。

### 后续 Mimo 任务引用方式

引用本节使用 `W21`。例如：`按 W21 保留 AppState/NetInfo 绑定在 Mobile，只共享 resume plan 类型`。

## W22. diagnostics / telemetry 边界

### 规则描述

diagnostics/telemetry 是端侧运行时观测能力。Mobile 的 `debugTelemetry`、Web 的 logger/用户提示和任何埋点发送都不得进入 shared-ws-core。shared 可定义错误分类或诊断快照类型，但不得记录、发送或持久化。

### 允许修改位置

- Web/Mobile 各自 logger、debug telemetry、diagnostics helper
- `frontend/packages/shared-ws-core/src/**` 中只新增错误分类纯函数和类型

### 禁止修改位置

- shared 中 import `debugTelemetry`
- shared 中调用网络发送、storage 持久化或 notification
- 为增加 telemetry 改变 reconnect、dispatch 或 close 行为

### Web 端保留职责

Web 保留 logger、Element Plus 错误提示和 Web 端 diagnostics 暴露。

### Mobile 端保留职责

Mobile 保留 `debugTelemetry.recordWsError`、`getWebsocketDiagnostics` 和 last event 时间维护。

### shared-ws-core 可承载的纯函数或类型

可承载 `classifyWsError(input)`、`WsDiagnosticStatus`、`WsCloseCategory` 等纯类型和分类函数。

### 后续 Mimo 任务引用方式

引用本节使用 `W22`。例如：`按 W22 保留 debugTelemetry 在 Mobile store，不引入 shared-ws-core`。

## W23. 阶段四禁止事项

### 规则描述

阶段四禁止改 WebSocket connect/reconnect/dispatch 外部语义，禁止改 UI，禁止改 E2EE，禁止改后端接口，禁止重写 store 架构，禁止把平台副作用下沉到 shared-ws-core，禁止改变现有用户可见行为。

### 允许修改位置

- 文档与测试
- shared-ws-core 纯函数、协议类型、纯策略
- Web/Mobile store 中必要的调用点替换，且必须保持行为等价

### 禁止修改位置

- UI 组件表现和交互
- WebSocket 连接策略实质行为
- E2EE 协商/加解密流程
- 后端 API 路径和协议字段
- Pinia/Zustand store 架构重写

### Web 端保留职责

Web 保留现有用户可见行为、通知展示、连接恢复时机和 chat/session/message 编排。

### Mobile 端保留职责

Mobile 保留现有用户可见行为、通知展示、连接恢复时机和 chat/session/message 编排。

### shared-ws-core 可承载的纯函数或类型

只能新增或调整能被测试证明行为等价的纯函数、协议类型和纯策略。

### 后续 Mimo 任务引用方式

引用本节使用 `W23`。例如：`按 W23 本任务不得修改 WebSocket 重连最大次数`。

## W24. 冲突处理规则

### 规则描述

当实现、旧文档或端侧规则与本文冲突时，以本文 `W1` 到 `W25` 为阶段四裁决依据。更具体条款优先于通用条款；协议纯规则优先进入 shared，平台副作用必须留在端侧；任何不能证明行为等价的迁移必须停止并拆成审计任务。

### 允许修改位置

- 冲突规则对应的 shared 纯函数和端侧调用点
- 相关测试和本文档的后续增量修订

### 禁止修改位置

- 未经引用条款的大范围重构
- 用端侧临时 helper 继续复制 shared 规则
- 为解决冲突修改用户可见流程

### Web 端保留职责

Web 在冲突时保留运行时副作用和现有行为；只替换可证明等价的纯规则调用。

### Mobile 端保留职责

Mobile 在冲突时保留运行时副作用和现有行为；只替换可证明等价的纯规则调用。

### shared-ws-core 可承载的纯函数或类型

可承载冲突中被判定为跨端协议语义的最小纯函数或类型，并必须配套测试覆盖。

### 后续 Mimo 任务引用方式

引用本节使用 `W24`。例如：`按 W24，若 Web 与 Mobile routing 不一致，先提交差异审计，不直接改行为`。

## W25. 后续 Mimo 任务引用方式

### 规则描述

后续 Mimo 任务必须在任务描述、提交说明和验收记录中引用具体条款编号。引用格式为 `按 Wn ...`，涉及多个边界时列出全部条款，例如 `按 W6/W10/W12`。不得只写“按 WebSocket 边界文档”。

### 允许修改位置

- Mimo 任务说明、实现注释、测试名、提交说明和审计报告
- 本文档的后续修订必须保持 `W1` 到 `W25` 编号稳定

### 禁止修改位置

- 重排、复用或删除既有 `W1` 到 `W25` 编号
- 用未编号章节替代条款引用
- 在未引用条款的情况下修改 shared-ws-core 或 Web/Mobile WebSocket store

### Web 端保留职责

Web 任务必须明确引用涉及的 Web 端保留职责条款，并说明未改用户可见行为。

### Mobile 端保留职责

Mobile 任务必须明确引用涉及的 Mobile 端保留职责条款，并说明未改用户可见行为。

### shared-ws-core 可承载的纯函数或类型

shared 任务必须明确引用可下沉条款，并说明新增函数为何是纯函数、输入输出如何测试。

### 后续 Mimo 任务引用方式

引用本节使用 `W25`。例如：`按 W25，本任务引用 W6/W11/W13，输出变更文件、行为等价说明和测试结果`。
