# Frontend IM State Core Boundary

本文档是阶段三消息与会话状态语义边界的稳定条款。后续 Mimo 任务必须按
`S1` 到 `S16` 的条款编号引用，不允许用临时标题或自然语言替代编号。

## S1. shared-im-core 职责边界

### 规则描述

`frontend/packages/shared-im-core/src` 是 Web 与 Mobile 共享的 IM 状态语义
核心，只承载纯函数、确定性规则和跨端一致的状态计算。它已经拥有或必须拥有
以下规则：`sessionId` 构造、message identity、message sort、message
dedupe、pending/server echo merge、message window limit、server message
filter、read receipt apply、session sort、session unread apply、session
lastMessage apply、clear marker 判断规则、retry backoff 纯策略。

shared-im-core 不读取运行时环境，不调用 API，不写存储，不展示通知，不绑定
生命周期，不调度队列。所有函数必须由输入参数完整决定输出。

### 允许修改位置

- `frontend/packages/shared-im-core/src/**`
- `frontend/packages/shared-im-core/src/__tests__/**`
- `frontend/packages/shared-im-core/src/index.ts` 的导出表
- 必要时补充 `frontend/packages/shared-types/src/**` 中已存在领域类型的缺失
  字段，但不得为平台字段扩展共享类型

### 禁止修改位置

- `frontend/apps/web/src/stores/**` 中新增 shared-core 同名规则实现
- `frontend/apps/mobile/src/stores/**` 中新增 shared-core 同名规则实现
- `frontend/apps/**/src/services/**` 中承载状态语义
- 平台存储、通知、WebSocket、E2EE、上传、路由、UI 目录

### 后续 Mimo 任务引用方式

引用本节使用 `S1`。例如：`按 S1 将 session sort 提取为 shared-im-core 纯函数`。

## S2. Web store 职责边界

### 规则描述

Web store 只负责 Pinia 状态容器和浏览器端编排，包括 `ref`、`computed`、
`Map`、当前会话、loading、搜索结果、运行时锁、Promise tail、IndexedDB、
localStorage、Element Plus 通知、API service 调用和 Web 生命周期事件。

Web store 可以调用 shared-im-core 规则，但不允许重新定义跨端状态语义。

### 允许修改位置

- `frontend/apps/web/src/stores/**`
- `frontend/apps/web/src/stores/modules/**`
- `frontend/apps/web/src/services/**` 的调用编排
- `frontend/apps/web/src/utils/**` 的 Web 存储或平台适配代码

### 禁止修改位置

- 在 Web store 内新增会话排序、未读、lastMessage、pending/server echo、
  read receipt、message window、sessionId 推断、retry backoff 的独立规则
- 在 Web store 内绕过 shared-im-core 的等价 helper
- 为迁移状态规则修改 UI、WebSocket、E2EE 或后端接口

### 后续 Mimo 任务引用方式

引用本节使用 `S2`。例如：`按 S2 保留 Pinia 容器，仅替换规则调用点`。

## S3. Mobile store 职责边界

### 规则描述

Mobile store 只负责 Zustand 状态容器和 React Native 端编排，包括当前会话、
消息 Map、loading、搜索结果、SQLite/MMKV/Keychain 等平台存储、RN
notification、upload、lifecycle、network、API service 调用和实际 pending
队列调度。

Mobile store 可以通过 adapter 把 Mobile model 转为 shared model 后调用
shared-im-core，但不允许把跨端状态语义保留为 store-local 规则。

### 允许修改位置

- `frontend/apps/mobile/src/stores/**`
- `frontend/apps/mobile/src/adapters/**`
- `frontend/apps/mobile/src/services/**` 的调用编排
- `frontend/apps/mobile/src/services/storage/**`
- `frontend/apps/mobile/src/services/upload/**`

### 禁止修改位置

- 在 Mobile store 内新增会话排序、未读、lastMessage、pending/server echo、
  read receipt、message window、sessionId 推断、retry backoff 的独立规则
- 把 mobile-only 字段推入 shared-im-core 或 shared-types
- 为迁移状态规则修改 RN UI、导航、WebSocket、E2EE 或后端接口

### 后续 Mimo 任务引用方式

引用本节使用 `S3`。例如：`按 S3 让 messageStore 只保留 retry 调度`。

## S4. 平台层职责边界

### 规则描述

平台层是 Web 与 Mobile 各自的运行时能力边界。它负责 I/O、副作用、调度、
生命周期、平台 SDK 和用户可见反馈，不负责定义 IM 状态语义。平台层可以保存
shared-im-core 的计算结果，但不能改变结果含义。

### 允许修改位置

- Web：IndexedDB、localStorage、Element Plus、browser lifecycle、
  network status、Pinia runtime state
- Mobile：SQLite、MMKV、Keychain、RN notification、upload、app lifecycle、
  network status、Zustand runtime state
- Web/Mobile 各自的 API service 调用和 repository 批处理

### 禁止修改位置

- 平台层不得实现跨端状态规则
- 平台层不得改变 shared-im-core 输出结果以匹配局部 UI 偏好
- 平台层不得把存储字段、通知字段、上传任务字段下沉到 shared-im-core

### 后续 Mimo 任务引用方式

引用本节使用 `S4`。例如：`按 S4 保留 SQLite 写入，不把存储逻辑下沉`。

## S5. 禁止继续散落在端侧的状态规则

### 规则描述

以下规则必须有且只有一个 shared-im-core 语义 owner：会话排序规则、
`unreadCount` 递增/清零规则、`lastMessage` 应用规则、pending/server echo
合并规则、read receipt 应用规则、消息窗口裁剪规则、`sessionId` 推断规则、
retry backoff 纯计算规则、clear marker 判断规则。

### 允许修改位置

- `frontend/packages/shared-im-core/src/**`
- Web/Mobile stores 中删除重复逻辑并改为调用 shared-im-core 的位置
- Mobile adapters 中必要的 shared model 与 mobile model 转换代码

### 禁止修改位置

- Web store 与 Mobile store 各维护一份行为接近但不完全一致的规则
- services、screens、components 中内联状态语义
- 为绕过类型问题复制旧逻辑到新文件

### 后续 Mimo 任务引用方式

引用本节使用 `S5`。例如：`按 S5 清理 Mobile sessionStore 的本地排序规则`。

## S6. 不允许下沉到 shared-im-core 的能力

### 规则描述

shared-im-core 不允许承载任何平台能力或副作用能力。API 请求、数据库存储、
UI 状态、通知展示、生命周期绑定、队列实际调度、上传任务、WebSocket 连接、
E2EE 加解密和路由导航都必须留在端侧。

### 允许修改位置

- Web/Mobile 平台目录中保留或调整副作用编排
- shared-im-core 调用点周围的 glue code
- adapters 中保留 platform-only 字段转换

### 禁止修改位置

- `frontend/packages/shared-im-core/src/**` 中导入 Vue、Pinia、Zustand、
  Element Plus、React Native、storage repository、service、WebSocket、
  upload、E2EE 或 router
- shared-im-core 中调用 `Date.now()` 实现 retry backoff
- shared-im-core 中读取 localStorage、SQLite、MMKV、Keychain 或网络状态

### 后续 Mimo 任务引用方式

引用本节使用 `S6`。例如：`按 S6 retry helper 只返回 nextRetryAt，不执行发送`。

## S7. 消息列表规则

### 规则描述

消息列表规则包括 message identity、message sort、message dedupe、server
message filter、message window limit 和消息归属会话推断。消息按 `sendTime`
升序排序，时间相同用字符串 `id` 兜底；重复消息通过 `id`、`messageId`、
`clientMessageId` 识别；服务端消息排除 `local_` id；窗口裁剪必须先排序后按
调用方意图保留 latest 或 oldest。

### 允许修改位置

- `frontend/packages/shared-im-core/src/message-identity.ts`
- `frontend/packages/shared-im-core/src/message-sort.ts`
- `frontend/packages/shared-im-core/src/message-dedup.ts`
- `frontend/packages/shared-im-core/src/message-filter.ts`
- `frontend/packages/shared-im-core/src/message-window.ts`
- `frontend/packages/shared-im-core/src/session-resolver.ts`

### 禁止修改位置

- Web/Mobile store 中手写独立排序、去重、窗口裁剪、server message 过滤
- 因 UI 展示需要改变 shared sort 语义
- 把 Mobile `serverId`、message-level `conversationId`、`rawJson` 写入 shared
  `Message`

### 后续 Mimo 任务引用方式

引用本节使用 `S7`。例如：`按 S7 将 loadMoreHistory 的窗口裁剪保持为 shared helper`。

## S8. 会话排序规则

### 规则描述

会话排序规则必须统一为：置顶会话优先；置顶状态相同则按 `lastActiveTime`
倒序；无效时间按 `0` 处理；排序函数必须是纯函数，不能读取当前 store 或修改
输入数组。

### 允许修改位置

- 新增或更新 `frontend/packages/shared-im-core/src/session-sort.ts`
- `frontend/packages/shared-im-core/src/index.ts`
- Web `session.ts` 的 computed 调用点
- Mobile `sessionStore.ts` 的 upsert/setSessions 调用点

### 禁止修改位置

- Web 和 Mobile 各自保留不同排序实现
- 排序时修改原始数组对象
- 排序规则混入 UI 分组、搜索、置灰、在线状态等展示逻辑

### 后续 Mimo 任务引用方式

引用本节使用 `S8`。例如：`按 S8 替换 Web sortedSessions 的本地 comparator`。

## S9. lastMessage / unreadCount 规则

### 规则描述

`lastMessage` 应用规则必须统一更新 `lastMessage`、`lastMessageTime` 和
`lastActiveTime`。`unreadCount` 只在非本人消息进入非当前会话时递增；选择会话、
markRead 成功或 read sync 命中时清零。清空会话时只清理目标会话的
`lastMessage`、`lastMessageTime`、sender metadata、`lastActiveTime` 和
`unreadCount`。

### 允许修改位置

- 新增或更新 `frontend/packages/shared-im-core/src/session-apply.ts`
- Web `session.ts`、`message.ts`、`message-read.ts` 的调用点
- Mobile `messageStore.ts`、`sessionStore.ts` 的调用点

### 禁止修改位置

- 在 addMessage、sendMessage、markRead、setCurrentSession 中各写一份
  unread/lastMessage 规则
- unread 递增规则依赖 UI 是否可见之外的隐式状态
- 清空一个会话时影响其他会话或全局未读

### 后续 Mimo 任务引用方式

引用本节使用 `S9`。例如：`按 S9 抽取 applyMessageToSession 纯函数`。

## S10. markRead / read receipt 规则

### 规则描述

markRead 的 API 请求、节流、锁、dirty 标记和失败处理留在端侧；read receipt
对消息列表的应用规则归 shared-im-core。`received` 模式更新目标用户发出的
消息；`sync` 模式更新非目标用户发出的消息。私聊更新 `status/readStatus/readAt`；
群聊更新 `readBy/readByCount/readStatus`。`lastReadMessageId` 和 `readAt`
都必须参与过滤。

### 允许修改位置

- `frontend/packages/shared-im-core/src/read-receipt.ts`
- Web `message-read.ts` 的 shared helper 调用点
- Mobile 后续新增 read receipt 应用时的 adapter/shared helper 调用点

### 禁止修改位置

- shared-im-core 调用 `messageService.markRead`
- 端侧重复实现 read receipt message map 逻辑
- 反转 `received` 与 `sync` 的 sender 判断方向

### 后续 Mimo 任务引用方式

引用本节使用 `S10`。例如：`按 S10 用 applyReadReceiptToMessages 替换 Web 重复 map`。

## S11. pending / server echo 合并规则

### 规则描述

pending/server echo 合并必须通过 message identity 匹配 `id`、`messageId`、
`clientMessageId`。服务端 echo 到达后保留可信服务端 id，同时保留必要的
`clientMessageId` 以移除 pending 记录。E2EE 发送方本地明文展示不能被服务端
密文覆盖。

### 允许修改位置

- `frontend/packages/shared-im-core/src/message-dedup.ts`
- Web `message.ts`、`message-loading.ts`、`message-send-queue.ts` 的调用点
- Mobile `messageAdapter.ts` 中 shared/mobile model 往返转换
- Mobile `messageStore.ts` 中调用 adapter 后的存储和队列清理

### 禁止修改位置

- 使用单一 `id` 判断替代 identity 集合判断
- server echo 合并时丢失 `clientMessageId`
- 为 Mobile 添加 shared `serverId` 字段
- 在 shared-im-core 处理 pending repository 删除

### 后续 Mimo 任务引用方式

引用本节使用 `S11`。例如：`按 S11 统一 Web replaceLocalMessage 与 addMessage 合并路径`。

## S12. retry backoff 规则

### 规则描述

retry backoff 归 shared-im-core 的部分只能是纯计算：输入 `retryCount`、
`baseDelayMs`、`maxDelayMs`、`maxRetryCount` 和 `nowMs`，输出下一次状态、
下一次重试时间和是否达到失败上限。实际 pending 查询、发送、上传、错误记录、
队列调度和删除仍留在端侧。

### 允许修改位置

- 新增或更新 `frontend/packages/shared-im-core/src/retry-policy.ts`
- Mobile `messageStore.ts` 中 `nextRetryAt` 的替换调用点
- Web 后续如增加 delayed retry，只能调用 shared 纯策略

### 禁止修改位置

- shared-im-core 中读取 `Date.now()`、网络状态或 pending repository
- shared-im-core 中调用 sendPrivate、sendGroup、sendPrivateEncrypted
- 迁移 retry 时改变现有 `baseDelayMs`、`maxDelayMs`、`maxRetryCount` 行为

### 后续 Mimo 任务引用方式

引用本节使用 `S12`。例如：`按 S12 将 Mobile nextRetryAt 改为 shared 纯策略`。

## S13. clear marker 规则

### 规则描述

clear marker 判断规则必须统一：如果 marker 的 `lastServerMessageId` 与消息
`id` 都能转为有效 server id，则 `messageId <= markerId` 的消息隐藏；否则用
`sendTime <= clearedAtMs` 判断。`local_` pending 消息不能被当作 server id。
marker 的存储、用户维度 key 和持久化仍留在端侧。

### 允许修改位置

- 新增 `frontend/packages/shared-im-core/src/clear-marker.ts`
- Web `message.ts` 的 `shouldHideClearedMessage` 与 `filterClearedMessages`
  调用点
- Mobile 后续实现会话清空时的调用点

### 禁止修改位置

- shared-im-core 读取或写入 localStorage、SQLite、MMKV
- 端侧保留不同 clear marker 判断规则
- 用 timestamp 覆盖可用 server id 比较结果

### 后续 Mimo 任务引用方式

引用本节使用 `S13`。例如：`按 S13 抽取 shouldHideClearedMessage 为 shared helper`。

## S14. Web/Mobile 替换顺序

### 规则描述

阶段三必须按低风险到高风险顺序替换：先补 shared-im-core 纯函数和测试，再替换
只读调用点，最后替换带副作用的调用点。推荐顺序是 `S7` 消息列表、`S8`
会话排序、`S9` lastMessage/unread、`S10` read receipt、`S11`
pending/server echo、`S12` retry backoff、`S13` clear marker。

### 允许修改位置

- 每个批次对应的 shared-im-core 文件和测试
- 对应 Web/Mobile 调用点
- 必要的 adapter 转换代码

### 禁止修改位置

- 一个批次同时改 UI、WebSocket、E2EE、API、状态语义
- 未加 shared 测试就替换多端调用点
- 在 Web 与 Mobile 行为冲突时直接选择一端覆盖另一端

### 后续 Mimo 任务引用方式

引用本节使用 `S14`。例如：`按 S14 先做 S8，不与 S11 合批`。

## S15. 阶段三禁止事项

### 规则描述

阶段三禁止改变 WebSocket connect/reconnect/dispatch 语义，禁止改变 E2EE，
禁止改变 UI，禁止改变后端接口，禁止改变现有用户可见行为。阶段三目标是建立
统一状态语义边界，不是业务重构。

### 允许修改位置

- 文档
- shared-im-core 纯函数与测试
- Web/Mobile 调用 shared helper 的最小替换点

### 禁止修改位置

- WebSocket 连接、重连、事件分发语义
- E2EE 协商、加密、解密、deferred decrypt、payload masking
- UI 布局、组件、用户文案、交互流程
- 后端接口、DTO 合约、服务端行为
- 任何改变用户可见行为的默认值、排序、未读、重试、展示结果

### 后续 Mimo 任务引用方式

引用本节使用 `S15`。例如：`按 S15 本批不得修改 websocketStore`。

## S16. 冲突处理规则

### 规则描述

如果 Web、Mobile 或 shared-im-core 现有行为冲突，Mimo 必须先停止替换，
记录冲突、标明受影响条款、补充当前行为测试，再由人工裁决统一语义。不得在
同一批次中静默改变一端行为来追平另一端。

### 允许修改位置

- 本文档的冲突说明补充
- shared-im-core 测试中用例化当前行为差异
- 最小范围的临时适配代码，但必须带条款引用和删除条件

### 禁止修改位置

- 静默修改用户可见行为
- 删除一端逻辑而不证明 shared 行为等价
- 为通过 typecheck 放宽类型、添加 `any`、降低 lint 或跳过测试

### 后续 Mimo 任务引用方式

引用本节使用 `S16`。例如：`按 S16 记录 Web/Mobile unread 冲突后等待裁决`。
