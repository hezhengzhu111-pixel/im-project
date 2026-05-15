# 阶段四验收报告：WebSocket 状态机与跨端事件处理统一

**日期**: 2026-05-15
**验收人**: 前端交付验收工程师
**验收结论**: **阶段四通过**

---

## 1. 阶段四目标

将 Web 与 Mobile WebSocket store 之间可共享的纯协议规则、纯策略和纯类型提取到 `@im/shared-ws-core` 包中，实现：

- 跨端协议语义零重复（URL 构造、heartbeat payload、reconnect delay、payload parse/guard、event classification、duplicate suppression、contact refresh 等）
- 不改变现有 WebSocket connect/reconnect/dispatch 用户可见行为
- 不修改 UI、E2EE、后端接口或 store 架构
- 所有 shared 函数为纯函数（输出仅由入参决定，无副作用）

---

## 2. W1-W25 条款完成情况

| 条款 | 标题 | 状态 | 说明 |
|------|------|------|------|
| W1 | shared-ws-core 职责边界 | ✅ 完成 | 仅含纯函数、常量、类型，无 I/O 副作用 |
| W2 | Web WebSocket store 职责边界 | ✅ 完成 | Web store 仅保留 Pinia 状态、socket 生命周期、timer、通知、localStorage |
| W3 | Mobile WebSocket store 职责边界 | ✅ 完成 | Mobile store 仅保留 Zustand 状态、socket 生命周期、timer、RN notification |
| W4 | 平台层职责边界 | ✅ 完成 | 平台 I/O 保留在端侧 platform service 中 |
| W5 | 禁止下沉到 shared-ws-core 的能力 | ✅ 完成 | shared 中无 authService、WebSocket、DOM、notification、storage 调用 |
| W6 | WebSocket URL / ticket 参数规则 | ✅ 完成 | `createTicketedWebSocketUrl` 纯函数已提取 |
| W7 | 连接状态规则 | ✅ 完成 | `resolveWebSocketConnectionStatus` 纯函数已提取 |
| W8 | manual disconnect / duplicate connection 规则 | ✅ 完成 | `DUPLICATE_CONNECTION_REASON` 常量 + `shouldScheduleReconnect` 已提取 |
| W9 | heartbeat payload 与 heartbeat timer 规则 | ✅ 完成 | `createHeartbeatPayload(timestampMs)` 显式时间戳入参 |
| W10 | reconnect delay / reconnect stop 规则 | ✅ 完成 | `createReconnectDelay` + `shouldScheduleReconnect` 已提取 |
| W11 | payload parse / envelope type guard 规则 | ✅ 完成 | `parseWebSocketPayload` + 9 个 type guard 已提取 |
| W12 | incoming sequential queue 规则 | ✅ 完成 | `shouldProcessSequentially` + `shouldQueueIncomingPayload` 已提取 |
| W13 | message event routing 规则 | ✅ 完成 | `classifyWsEvent` + `WsEventKind` 类型已提取 |
| W14 | online status / presence 规则 | ✅ 完成 | `normalizePresenceUserId` + `applyPresenceToRecord` + `applyPresenceToSet` 已提取 |
| W15 | read receipt event 规则 | ✅ 完成 | `isReadReceiptPayload` guard 已提取，apply 语义保留在端侧 |
| W16 | friend request / contact refresh 规则 | ✅ 完成 | `classifyContactRefreshFromWsType` + `classifyContactRefreshFromSystemContent` 已提取 |
| W17 | system message command 规则 | ✅ 完成 | `::CMD:` 协议解析和自然语言关键字匹配已统一 |
| W18 | duplicate message suppression 规则 | ✅ 完成 | `evaluateDuplicateMessage` 策略（shouldDrop/remember/cleanup）已提取 |
| W19 | notification trigger 规则 | ✅ 完成 | shared 中无 notification 调用，端侧保留通知展示 |
| W20 | E2EE_NEGOTIATION 事件边界 | ✅ 完成 | `isE2eeNegotiationPayload` guard 已提取，crypto 逻辑保留在端侧 |
| W21 | lifecycle / network resume 边界 | ✅ 完成 | 生命周期绑定保留在端侧 platform service |
| W22 | diagnostics / telemetry 边界 | ✅ 完成 | `createWebSocketDiagnosticsSnapshot` 纯函数已提取，telemetry 留在端侧 |
| W23 | 阶段四禁止事项 | ✅ 完成 | 未改变 connect/reconnect/dispatch 外部语义、UI、E2EE、后端接口 |
| W24 | 冲突处理规则 | ✅ 完成 | Web Set / Mobile Record 通过 shared 纯函数统一语义 |
| W25 | 后续 Mimo 任务引用方式 | ✅ 完成 | 所有实现文件均标注条款编号 |

---

## 3. shared-ws-core 新增函数/类型列表

### 模块：`path.ts`
| 导出 | 类型 | 条款 |
|------|------|------|
| `createTicketedWebSocketUrl(wsBaseUrl, userId, ticket?)` | 纯函数 | W6 |

### 模块：`heartbeat.ts`
| 导出 | 类型 | 条款 |
|------|------|------|
| `createHeartbeatPayload(timestampMs)` | 纯函数 | W9 |

### 模块：`payload.ts`
| 导出 | 类型 | 条款 |
|------|------|------|
| `parseWebSocketPayload(raw)` | 纯函数 | W11 |
| `isMessagePayload(data)` | type guard | W11 |
| `isMessageStatusChangedPayload(data)` | type guard | W11 |
| `isOnlineStatusPayload(data)` | type guard | W11 |
| `isReadReceiptPayload(data)` | type guard | W11/W15 |
| `isSystemPayload(data)` | type guard | W11 |
| `isHeartbeatPayload(data)` | type guard | W11 |
| `isFriendRequestPayload(data)` | type guard | W11 |
| `isFriendAcceptedPayload(data)` | type guard | W11 |
| `isE2eeNegotiationPayload(data)` | type guard | W11/W20 |

### 模块：`strategy.ts`
| 导出 | 类型 | 条款 |
|------|------|------|
| `shouldProcessSequentially(messageType, innerType)` | 纯函数 | W12 |

### 模块：`incoming-queue.ts`
| 导出 | 类型 | 条款 |
|------|------|------|
| `getIncomingPayloadType(payload)` | 纯函数 | W11/W12 |
| `shouldQueueIncomingPayload(payload)` | 纯函数 | W12 |

### 模块：`reconnect.ts`
| 导出 | 类型 | 条款 |
|------|------|------|
| `createReconnectDelay(attempt, baseInterval?)` | 纯函数 | W10 |
| `shouldScheduleReconnect(options)` | 纯函数 | W8/W10 |
| `ShouldScheduleReconnectOptions` | 类型 | W8/W10 |

### 模块：`presence.ts`
| 导出 | 类型 | 条款 |
|------|------|------|
| `normalizePresenceUserId(userId)` | 纯函数 | W14 |
| `isOnlineStatusValue(status)` | 纯函数 | W14 |
| `applyPresenceToRecord(record, userId, status)` | 纯函数 | W14 |
| `applyPresenceToSet(set, userId, status)` | 纯函数 | W14 |

### 模块：`duplicate-message.ts`
| 导出 | 类型 | 条款 |
|------|------|------|
| `DEFAULT_DEDUP_TTL_MS` | 常量 (60000) | W18 |
| `DEFAULT_DEDUP_MAX_SIZE` | 常量 (2000) | W18 |
| `getMessageDedupKey(message)` | 纯函数 | W18 |
| `shouldDropRecentMessage(recentMap, key, nowMs, ttlMs)` | 纯函数 | W18 |
| `rememberRecentMessage(recentMap, key, nowMs, maxSize, ttlMs)` | 纯函数 | W18 |
| `cleanupRecentMessages(recentMap, nowMs, ttlMs)` | 纯函数 | W18 |

### 模块：`contact-refresh.ts`
| 导出 | 类型 | 条款 |
|------|------|------|
| `classifyContactRefreshFromWsType(type)` | 纯函数 | W16 |
| `classifyContactRefreshFromSystemContent(content)` | 纯函数 | W16/W17 |
| `mergeContactRefreshActions(left, right)` | 纯函数 | W16 |
| `ContactRefreshAction` | 类型 | W16 |

### 模块：`event-classifier.ts`
| 导出 | 类型 | 条款 |
|------|------|------|
| `classifyWsEvent(payload)` | 纯函数 | W13 |
| `getWsPayloadData(payload)` | 纯函数 | W11 |
| `isChatMessageEvent(kind)` | 纯函数 | W13 |
| `isContactEvent(kind)` | 纯函数 | W13/W16 |
| `isPresenceEvent(kind)` | 纯函数 | W13/W14 |
| `isReadEvent(kind)` | 纯函数 | W13/W15 |
| `WsEventKind` | 类型 | W13 |

### 模块：`diagnostics.ts`
| 导出 | 类型 | 条款 |
|------|------|------|
| `resolveWebSocketConnectionStatus(input)` | 纯函数 | W7 |
| `createWebSocketDiagnosticsSnapshot(input)` | 纯函数 | W7/W22 |
| `WebSocketConnectionStatus` | 类型 | W7 |
| `ResolveConnectionStatusInput` | 类型 | W7 |
| `DiagnosticsSnapshotInput` | 类型 | W22 |
| `WebSocketDiagnosticsSnapshot` | 类型 | W22 |

### 模块：`constants.ts`
| 导出 | 类型 | 条款 |
|------|------|------|
| `DUPLICATE_CONNECTION_REASON` | 常量 | W8 |

**总计**: 11 个源文件模块，39 个导出函数/常量，8 个导出类型。

---

## 4. Web websocket store 替换列表

Web store (`frontend/apps/web/src/stores/websocket.ts`) 已完成以下调用点替换：

| 原始实现 | 替换为 shared-ws-core | 条款 |
|----------|----------------------|------|
| 手写 JSON.stringify heartbeat payload | `createHeartbeatPayload(Date.now())` | W9 |
| 手写 ticket query 拼接 | `createTicketedWebSocketUrl(wsBaseUrl, userId, ticket)` | W6 |
| 手写 `JSON.parse` + null check | `parseWebSocketPayload(String(event.data))` | W11 |
| 手写 `shouldQueue` 判断 | `shouldQueueIncomingPayload(parsed)` | W12 |
| 手写 reconnect delay 计算 | `createReconnectDelay(attempts, WS_CONFIG.RECONNECT_INTERVAL)` | W10 |
| 手写 close reason 判断 | `shouldScheduleReconnect({...})` | W8/W10 |
| 手写 `DUPLICATE_CONNECTION_REASON` 字符串 | `DUPLICATE_CONNECTION_REASON` 常量 | W8 |
| 手写 `connectionStatus` computed | `resolveWebSocketConnectionStatus({...})` | W7 |
| 手写 userId trim/normalize | `normalizePresenceUserId(userId)` | W14 |
| 手写 online status value 判断 | `isOnlineStatusValue(status.status)` | W14 |
| 手写 Set add/delete presence | `applyPresenceToSet(onlineUsers, userId, isOnline)` | W14 |
| 手写 `recentMessageIds` cleanup | `cleanupRecentMessages(map, now, TTL)` | W18 |
| 手写 dedup key 提取 | `getMessageDedupKey(rawMessage)` | W18 |
| 手写 TTL drop 判断 | `shouldDropRecentMessage(map, key, now, TTL)` | W18 |
| 手写 remember + prune | `rememberRecentMessage(map, key, now, MAX, TTL)` | W18 |
| 手写 `data.type` 分支路由 | `classifyWsEvent(data)` → `WsEventKind` | W13 |
| 手写 FRIEND_REQUEST/ACCEPTED 判断 | `classifyContactRefreshFromWsType(data.type)` | W16 |
| 手写 `::CMD:` 解析 + 中文关键字 | `classifyContactRefreshFromSystemContent(content)` | W16/W17 |
| 手写 `getIncomingPayloadType` | `getIncomingPayloadType(payload)` | W11 |

---

## 5. Mobile websocket store 替换列表

Mobile store (`frontend/apps/mobile/src/stores/websocketStore.ts`) 已完成以下调用点替换：

| 原始实现 | 替换为 shared-ws-core | 条款 |
|----------|----------------------|------|
| 手写 heartbeat JSON | `createHeartbeatPayload(Date.now())` | W9 |
| 手写 WS URL 拼接 | `createTicketedWebSocketUrl(APP_CONFIG.WS_BASE_URL, userId, ticket)` | W6 |
| 手写 `JSON.parse` | `parseWebSocketPayload(String(event.data))` | W11 |
| 手写 sequential 判断 | `shouldQueueIncomingPayload(payload)` | W12 |
| 手写 reconnect delay | `createReconnectDelay(attempts, WS_CONFIG.reconnectBaseDelayMs)` | W10 |
| 手写 close reason 判断 | `shouldScheduleReconnect({...})` | W8/W10 |
| 手写 `DUPLICATE_CONNECTION_REASON` | `DUPLICATE_CONNECTION_REASON` 常量 | W8 |
| 手写 userId normalize | `normalizePresenceUserId(userId)` | W14 |
| 手写 Record presence 更新 | `applyPresenceToRecord(record, userId, status)` | W14 |
| 手写 dedup 策略 | `getMessageDedupKey` + `shouldDropRecentMessage` + `rememberRecentMessage` | W18 |
| 手写 event type 分支 | `classifyWsEvent(payload)` → `WsEventKind` | W13 |
| 手写 FRIEND_* 判断 | `classifyContactRefreshFromWsType(wsType)` | W16 |
| 手写 `::CMD:` 解析 | `classifyContactRefreshFromSystemContent(content)` | W16/W17 |
| 手写 diagnostics snapshot | `createWebSocketDiagnosticsSnapshot({...})` | W7/W22 |

---

## 6. 保留端侧逻辑列表及原因

### Web 端保留

| 保留能力 | 原因 | 条款 |
|----------|------|------|
| `authService.issueWsTicket` | 平台级 HTTP 调用，含 Axios 拦截器 | W5 |
| `new WebSocket(...)` | 浏览器原生 API | W5 |
| `setInterval` / `setTimeout` / `clearInterval` / `clearTimeout` | 浏览器 timer API | W5/W9/W10 |
| `ElMessage` / `ElNotification` | Element Plus UI 通知 | W5/W19 |
| `localStorage` 读写 | 浏览器存储 | W5 |
| `document.hidden` 检查 | 浏览器可见性 API | W19 |
| `window.dispatchEvent(CustomEvent)` | 浏览器事件总线 | W14 |
| `import.meta.env.DEV` | Vite 构建环境变量 | W6 |
| `normalizeMessage(raw)` | Web 端 normalizer 依赖 Web 类型定义 | W13 |
| `hasMessageInLocalState(...)` | Web 端消息内存状态扫描 | W18 |
| `queueContactRefresh(...)` | Web 端 debounce + pending 聚合 + ElNotification | W16 |
| `createAsyncDebounce(...)` | Web 端特有 debounce 实现 | W16 |
| E2EE decrypt intercept | 加密逻辑属于 E2EE 模块，非 WS 协议 | W20 |
| `setupLifecycleListeners(...)` | Web 平台 lifecycle 绑定 | W21 |
| `chatStore.addMessage(...)` | Web 端 store 编排 | W13 |
| `chatStore.applyReadReceipt(...)` | Web 端 store 编排 | W15 |

### Mobile 端保留

| 保留能力 | 原因 | 条款 |
|----------|------|------|
| `authService.issueWsTicket` | 平台级 HTTP 调用 | W5 |
| `new WebSocket(...)` | React Native WebSocket API | W5 |
| `setInterval` / `setTimeout` | RN timer API | W5/W9/W10 |
| `debugTelemetry.recordWsError(...)` | Mobile 诊断系统 | W22 |
| `displayMessageNotification(...)` | RN notification 服务 | W19 |
| `appLifecycle.onForeground(...)` | RN AppState 监听 | W21 |
| `networkStatus.onOnline(...)` | RN NetInfo 监听 | W21 |
| `normalizeMessage(data)` | Mobile 端 normalizer | W13 |
| `useMessageStore.addMessage(...)` | Mobile 端 store 编排 | W13 |
| `useSessionStore.upsertSession(...)` | Mobile 端 store 编排 | W13 |
| `useContactStore.loadFriendRequests/...()` | Mobile 端 store 编排 | W16 |
| `incomingTail` Promise tail | Mobile 端串行队列运行时 | W12 |
| module-level `manualDisconnect` | Mobile 端连接状态管理 | W8 |
| module-level `recentMessageIds` Map | Mobile 端 dedup cache 运行时 | W18 |

---

## 7. 不允许下沉到 shared-ws-core 的能力清单

| 能力 | 禁止原因 | 条款 |
|------|----------|------|
| `authService.issueWsTicket` | I/O 副作用（HTTP 调用） | W5 |
| `new WebSocket(...)` | 平台原生 API | W5 |
| `setInterval` / `setTimeout` 实际调用 | 平台 timer API | W5 |
| `ElMessage` / `ElNotification` | Web UI 框架依赖 | W5 |
| RN notification (notifee/FCM) | Mobile 平台依赖 | W5 |
| `localStorage` / `MMKV` / `Keychain` / `SQLite` | 平台存储 API | W5 |
| `document.hidden` / `window.dispatchEvent` | 浏览器 DOM API | W5 |
| `AppState` / `NetInfo` 监听绑定 | RN 平台 API | W5 |
| `debugTelemetry.recordWsError(...)` | Mobile 诊断副作用 | W5/W22 |
| `normalizeMessage(...)` | 依赖端侧类型定义和配置 | W13 |
| E2EE decrypt / negotiate | 加密语义不属于 WS 协议层 | W20 |
| Pinia / Zustand store 状态 | 运行时状态容器 | W1 |
| Vue / React / React Native | 平台 UI 框架 | W1 |
| `Date.now()` 内部调用 | 时间戳必须由调用方传入 | W9/W23 |

---

## 8. 测试矩阵

### shared-ws-core 测试覆盖

| 测试文件 | 测试数 | 覆盖模块 |
|----------|--------|----------|
| `path.test.ts` | 25 | W6: URL 构造、ticket 编码、空值处理 |
| `heartbeat.test.ts` | 11 | W9: payload 格式、时间戳透传、JSON 结构 |
| `payload.test.ts` | 105 | W11: parse 成功/失败、9 个 type guard 覆盖 |
| `reconnect.spec.ts` | 13 | W8/W10: delay 计算、stop 条件、边界值 |
| `incoming-queue.test.ts` | 11 | W12: sequential 判断、SYSTEM 跳过、payload 提取 |
| `presence.test.ts` | 50 | W14: normalize、online 判断、Record/Set 更新 |
| `duplicate-message.test.ts` | 24 | W18: TTL、容量、prune、cleanup、key 提取 |
| `contact-refresh.test.ts` | 19 | W16/W17: WsType 分类、::CMD: 解析、中文关键字、merge |
| `event-classifier.test.ts` | 55 | W13: 10 种事件分类、数据提取、辅助判断 |
| `diagnostics.test.ts` | 7 | W7/W22: 状态派生、snapshot 构建 |
| `ws-core.spec.ts` | 34 | 集成: 跨模块引用一致性 |
| **合计** | **354** | |

### Web 测试覆盖（WebSocket 相关）

| 测试文件 | 测试数 | 覆盖范围 |
|----------|--------|----------|
| `websocket-store.spec.ts` | 8 | WS ticket、reconnect、online status、dedup、system commands |
| 其他测试（chat-store、request-refresh 等） | 368 | 非直接 WS 但验证 store 交互 |
| **合计** | **376** | |

### Mobile 测试覆盖

| 测试文件 | 测试数 | 覆盖范围 |
|----------|--------|----------|
| messageStore、sessionStore 等 | 216 | Mobile store 与 shared-ws-core 集成 |
| **合计** | **216** | |

---

## 9. 验收命令结果

| 命令 | 结果 | 耗时 |
|------|------|------|
| `npm run test --workspace @im/shared-ws-core` | ✅ 11 文件, 354 tests passed | 0.87s |
| `npm run typecheck --workspace @im/shared-ws-core` | ✅ 0 errors | <1s |
| `cd frontend/apps/web && npm run typecheck` | ✅ 0 errors | <10s |
| `cd frontend/apps/web && npm run test` | ✅ 36 文件, 376 tests passed | 59s |
| `cd frontend/apps/mobile && npm run typecheck` | ✅ 0 errors | <5s |
| `cd frontend/apps/mobile && npm run test` | ✅ 13 文件, 216 tests passed | 1.9s |

**全部 6 项验收命令通过，0 阻塞。**

---

## 10. 剩余风险

| 风险项 | 严重度 | 说明 |
|--------|--------|------|
| Mobile E2EE 集成未完成 | 低 | Mobile 端 `e2eeNegotiation` 事件仅 log，无实际 E2EE 模块接入。属于 E2EE 范畴，非阶段四阻塞项 |
| Web E2EE decrypt 在 websocket store 中体量较大 | 低 | E2EE decrypt intercept（约 80 行）仍在 websocket.ts 中，符合 W20 裁决：WS 层做 dispatch，不做 crypto 语义变更 |
| `notification trigger` 纯判断未提取到 shared | 低 | W19 允许提取 `shouldNotifyForMessage`，当前端侧直接判断 `document.hidden` / `isMuted`。行为等价，可作为后续优化 |
| Web `hasMessageInLocalState` 保留在端侧 | 低 | 该函数扫描 Web 端消息内存 Map，依赖 Web store 结构，不适合下沉到 shared |

**以上风险均为低严重度，不影响阶段四验收结论。**

---

## 11. 阶段四结论

### **阶段四通过**

- W1-W25 全部 25 项条款均已满足
- shared-ws-core 新增 11 个模块、39 个导出函数/常量、8 个导出类型
- Web store 完成 19 处调用点替换
- Mobile store 完成 14 处调用点替换
- 所有 shared 函数均为纯函数，无 I/O 副作用
- 6 项验收命令全部通过（946 tests, 0 failures, 0 type errors）
- 未改变 WebSocket connect/reconnect/dispatch 用户可见行为
- 未修改 UI、E2EE 流程、后端接口或 store 架构

### 阻塞项列表

**无阻塞项。**
