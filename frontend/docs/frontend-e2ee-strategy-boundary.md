# Frontend E2EE Strategy Boundary

本文档是阶段五 E2EE 策略与安全边界的稳定裁决。后续 Mimo 任务必须按 `E1` 到 `E34` 的条款编号引用，不得用临时标题、自然语言概括或“沿用 E2EE 策略”等模糊表述替代编号。

本裁决基于对 Web E2EE manager、X3DH、Double Ratchet、媒体加密、IndexedDB key/session store、Web 发送队列、WebSocket 事件分发、Mobile deferred、Mobile message/session/websocket store、Mobile Keychain/MMKV/SQLite 使用边界、shared-types 与 shared-api-contract 字段的读取。阶段五只做策略裁决、架构边界和必要文档，不做业务逻辑大规模改造。

## E1. 阶段五 E2EE 总目标

### 规则描述

E1.1 阶段五目标是建立后续 Mimo 任务必须遵守的 E2EE 安全边界，优先防止静默明文降级、协议核心误改、移动端半成品加密发送和密钥存储误用。

E1.2 阶段五不以“跨端功能完整”为目标；Web 当前 E2EE 能力继续保留，Mobile 当前继续 deferred，后续补齐必须先满足本文档的门槛。

E1.3 E2EE 安全性优先级高于体验兜底。任何发送、接收、重试、通知、缓存、展示逻辑在无法证明安全时必须失败关闭，而不是自动转为明文。

## E2. 当前 Web E2EE 能力边界

### 规则描述

E2.1 Web 已具备私聊文本 E2EE 的核心链路：`e2ee-manager.ts` 调用 `x3dh.ts`、`double-ratchet.ts`、`key-store.ts`、`session-store.ts` 完成协商、加密、解密和 Ratchet state 持久化。

E2.2 Web 的本地会话状态由 `negotiation.ts` 写入 `localStorage`，有效状态只能解释为 `plaintext`、`negotiating`、`encrypted`、`failed`，历史 `pending` 只能兼容读取为 `negotiating`。

E2.3 Web 的密钥和 Ratchet state 当前依赖浏览器 WebCrypto `CryptoKey`、IndexedDB structured clone 与 JWK 序列化；这不是可直接迁移到 React Native 的跨端抽象。

E2.4 Web 的媒体加密只覆盖上传前文件内容加密，使用随机 AES-GCM media key 和 chunk IV；媒体 key 如何随消息安全传输必须继续受 E23 约束。

E2.5 Web 的群聊 E2EE 只存在部分类型和 API 占位；本文档不认定群聊 Sender Key 已完整实现。

## E3. 当前 Mobile E2EE deferred 能力边界

### 规则描述

E3.1 Mobile 当前没有 X3DH、Double Ratchet、media crypto、key bundle 注册、Ratchet session store 或密钥恢复实现。

E3.2 Mobile 当前的安全能力是 deferred guard：`e2eeDeferred.ts` 识别 encrypted message/session，遮罩密文消息，阻断 encrypted session 发送，并阻断 encrypted pending payload 重试。

E3.3 Mobile `websocketStore.ts` 当前对 `E2EE_NEGOTIATION` 只记录 deferred 日志，不执行协商、不生成密钥、不接受或拒绝协议事件。

E3.4 Mobile `secureStorage.ts` 当前服务于 access token、session meta 与 cookie mirror；`kvStorage.ts` 当前是 MMKV 加内存回退，不是 E2EE 密钥或 Ratchet state 存储方案。

## E4. 移动端支持等级裁决

### 规则描述

E4.1 阶段五正式采用 Track A：继续移动端安全降级策略。

E4.2 Track A 的含义是 Mobile 继续 deferred，不做加密发送、不做解密展示、不参与 X3DH/Double Ratchet 协商，但必须持续加固测试、文案、事件处理、pending 阻断和“不明文发送”约束。

E4.3 阶段五不采用 Track B。Mobile 完整 E2EE 需要 crypto polyfill、secure key store、IndexedDB 替代、Ratchet session store 替代和测试门槛，当前仓库尚未具备。

E4.4 阶段五不采用 Track C 作为当前执行策略。Track C 只作为未来过渡方案定义，不能被 Mimo 擅自启用。

## E5. Track A：继续移动端安全降级策略

### 规则描述

E5.1 Mobile 收到 encrypted message 时必须遮罩内容和媒体字段，不得展示密文、明文猜测、URL、缩略图、文件名、文件大小或时长。

E5.2 Mobile 进入 encrypted session 时必须阻断文本、媒体和 pending retry 发送，错误文案必须明确提示切换 Web 端或关闭加密通道。

E5.3 Mobile 处理 `E2EE_NEGOTIATION` 时只能做 deferred 范围内的状态展示、日志或测试可观测行为，不得创建密钥、接受协商、修改协议状态或调用 Web E2EE 代码。

E5.4 Mobile pending queue 中只要 payload 或 nested data 标记 `encrypted: true`，必须进入 blocked 状态，不得调用普通 `sendPrivate` 或 `sendGroup`。

E5.5 Track A 下 Mimo 可做的是补测试、补文案、补遮罩、补事件 guard、补 pending 阻断，并可调用 Codex 已裁决的 `@im/shared-e2ee-core` 纯 contract/guard；不可做协议、密钥、Ratchet 或加密核心抽取。

## E6. Track B：移动端完整 E2EE 补齐策略

### 规则描述

E6.1 Track B 不是阶段五采用策略，只能由 Codex 在单独安全方案中启动。

E6.2 Track B 必须先确定 React Native crypto 运行时：P-256 ECDH、ECDSA P-256、HKDF、AES-GCM、CSPRNG、constant-time 比较能力和二进制/base64 兼容测试。

E6.3 Track B 必须先确定 secure key store：identity private key 和 wrapping key 必须落在 Keychain/Keystore 等硬件或系统保护层；任何内存 fallback 都不得承载长期 E2EE 密钥。

E6.4 Track B 必须提供 IndexedDB 替代：Ratchet state、skipped message keys、public bundle metadata、device id 与 session status 要有事务性持久化和迁移策略。

E6.5 Track B 测试门槛至少包括 Web/Mobile X3DH 互通、Double Ratchet 互通、乱序消息、重复消息、counter gap、重启恢复、离线 retry、密钥删除、日志脱敏和真机 Keychain/Keystore 行为。

## E7. Track C：混合策略，移动端只支持接收/展示状态，不支持加密发送

### 规则描述

E7.1 Track C 允许 Mobile 展示 encrypted session 状态、展示协商待处理提示、遮罩 encrypted message，并同步 Web 已建立的会话状态。

E7.2 Track C 禁止 Mobile 解密消息、加密发送、生成身份密钥、上传 key bundle、接受协商、推进 Ratchet counter 或写入 Ratchet state。

E7.3 Track C 若未来启用，必须先由 Codex 明确事件语义、状态来源、冲突处理和 UX 文案；Mimo 不能把 Track A 的日志忽略行为自行升级为 Track C。

## E8. 不允许静默降级为明文

### 规则描述

E8.1 当本地或服务端可见状态表明会话为 `negotiating`、`encrypted` 或消息 `encrypted: true` 时，任何端都不得把发送路径、重试路径或接收展示路径静默改为普通明文。

E8.2 加密失败、Ratchet state 缺失、header 缺失、解密失败、counter gap、key store 失败时，必须阻断发送或遮罩展示，并给出可见错误或状态提示。

E8.3 会话状态从 `encrypted` 重置为 `plaintext` 只能作为显式安全恢复动作，不得作为随后自动明文发送的授权。

E8.4 E8 优先级高于所有体验兜底和离线重试策略。

## E9. 会话状态 plaintext / negotiating / encrypted / failed 语义

### 规则描述

E9.1 `plaintext` 表示本端没有启用 E2EE 发送要求。只有在消息和会话均未标记 encrypted 时，普通明文发送才允许。

E9.2 `negotiating` 表示 E2EE 协商请求已发起或已收到，Ratchet state 可能未被双方确认。该状态下不得发送普通私聊明文作为加密会话的替代。

E9.3 `encrypted` 表示本端有可用 Ratchet state 且协商已被接受。发送必须走 E2EE；解密失败必须失败关闭。

E9.4 `failed` 表示协商或持久化失败。该状态不得自动退回可发送明文；必须由用户或明确流程重新协商、关闭加密或重置。

E9.5 `ChatSession.encrypted` 是跨端展示和阻断字段，不等同于本端拥有 Ratchet state；Mobile Track A 必须把它视为发送阻断信号。

## E10. 协商请求 / 接受 / 拒绝 / disabled 事件语义

### 规则描述

E10.1 `request` 表示发起方请求开启 E2EE，可能携带 `requestPayloadJson`，其中 Web 当前会放入 `senderIdentityKey`、`ephemeralPublicKey`、`deviceId` 等初始握手数据。

E10.2 `accepted` 表示对端显式接受协商。Web 可据此标记加密状态或继续完成已保存握手；Mobile Track A 不得因此创建 Ratchet state。

E10.3 `rejected` 表示对端拒绝协商。本端必须清理 pending negotiation UI 和待处理握手，不得保留一个可继续发送加密消息的假状态。

E10.4 `disabled` 表示加密通道被关闭。本端必须停止加密发送并清理本地 pending handshake；Ratchet state 删除或保留审计策略只能由 Codex 裁决。

E10.5 协商事件是控制面事件，不是密文消息事件；不得把密文 payload、Ratchet header 或媒体 key 塞入协商事件。

## E11. E2EE_NEGOTIATION WebSocket 事件边界

### 规则描述

E11.1 `E2EE_NEGOTIATION` 是 WebSocket 控制面事件，只负责通知端侧发生 request/accepted/rejected/disabled。

E11.2 Web `websocket.ts` 对该事件的职责是归一化字段并发到 E2EE negotiation event bus，不得在 WebSocket store 内执行 X3DH 或 Double Ratchet。

E11.3 Mobile Track A 对该事件的职责是 deferred 处理：记录可观测日志、未来可显示状态提示，但不得推进协议状态。

E11.4 `shared-ws-core` 可继续承载事件分类和 payload guard；不得承载 E2EE 协议状态机、密钥材料或加解密逻辑。

## E12. X3DH 协议边界

### 规则描述

E12.1 Web 当前 X3DH 使用 WebCrypto P-256 ECDH identity key、P-256 ECDSA signing identity key、signed pre-key、可选 one-time pre-key、HKDF 派生 root key。

E12.2 Signed pre-key 签名验证是强制安全边界，不得跳过、弱化、catch 后继续或改成仅日志警告。

E12.3 Mimo 不得自行修改 `x3dh.ts` 的 DH 顺序、HKDF info/salt、曲线、签名算法、key export/import 语义或错误处理。

E12.4 服务端和 WebSocket 只被视为不可信传输和存储协调方，不得被赋予明文、私钥、root key 或 Ratchet state 的可见性。

E12.5 X3DH 协议语义、OPK 生命周期和跨端互通只能由 Codex 修改和审计。

## E13. Double Ratchet 协议边界

### 规则描述

E13.1 Web 当前 Double Ratchet 使用 root key、sending/receiving chain key、DH ratchet key、send/receive counter、previousCounter 和 skipped message keys。

E13.2 AES-GCM AAD 绑定 `ratchetPublicKey`、`counter`、`previousCounter`，不得删除或弱化 header 认证。

E13.3 Mimo 不得自行修改 `double-ratchet.ts` 的 KDF info、chain split、counter 推进、DH ratchet 时机、skipped key lookup 或 duplicate/expired message 判断。

E13.4 Ratchet state 持久化失败必须视为安全失败；不得在未确认持久化时继续发送或展示为 encrypted。

E13.5 Double Ratchet 协议核心、持久化事务语义和跨端互通只能由 Codex 修改和审计。

## E14. Ratchet counter gap 与重新协商边界

### 规则描述

E14.1 Web 当前 `MAX_COUNTER_GAP` 为 2000。收到 header counter 超过本地 receive counter 允许窗口时，必须触发重新协商并失败关闭当前解密。

E14.2 Mimo 不得调大、删除或绕过 counter gap 检查，也不得把 gap 解密失败改为明文展示。

E14.3 duplicate、expired、乱序和 skipped message key 行为必须通过测试覆盖后才能调整。

E14.4 gap 触发的重新协商是安全恢复流程，不是自动接受新链路；对端仍需按 E10 显式语义处理。

## E15. identity key / signed pre-key / one-time pre-key 边界

### 规则描述

E15.1 identity key 标识设备长期身份；签名 identity key 只用于签名/验签；signed pre-key 用于 X3DH DH 与签名绑定。

E15.2 当前 Web `generateKeyBundle()` 会生成 one-time pre-keys，但 `local-device.ts` 上传 `oneTimePreKeys: []`，`respondToNegotiation()` 传入 `null` OPK；阶段五不得宣称 OPK 已完整启用。

E15.3 任何 OPK 上传、领取、消耗、补充、重放防御和服务端接口语义变更都必须由 Codex 裁决。

E15.4 Mimo 不得把 identity key、signed pre-key、OPK 或 root key 放入日志、普通 storage、URL、通知、analytics 或 crash detail。

## E16. deviceId 与多设备边界

### 规则描述

E16.1 `deviceId` 是 E2EE key bundle 的目标设备标识，也是 encrypted message payload 中的发送设备标识。

E16.2 Web 当前发起协商时选择远端最新活跃设备，尚不是完整多设备 fanout 和 per-device session 模型。

E16.3 Mobile Track A 不注册 E2EE device，不上传 bundle，不参与多设备 E2EE。

E16.4 Mimo 不得自行扩展多设备语义、设备撤销、设备信任、device transfer 或多端同步 Ratchet state。

## E17. Web 密钥存储边界

### 规则描述

E17.1 Web E2EE key store 使用 IndexedDB `e2ee_keys` version 2，object stores 包括 `identity`、`prekeys`、`sessions`、`sender_keys`、`meta`。

E17.2 identity key pair 以 non-extractable `CryptoKey` 形式存入 IndexedDB structured clone；signed pre-key 和 Ratchet state 当前以 JWK/ArrayBuffer 形式序列化。

E17.3 Web session status 和 initial handshake 当前在 `localStorage` 中保存；它们是状态元数据，不得承载私钥、root key、chain key、message key 或 media key。

E17.4 Web key/session store 的结构、迁移、清除语义和 recovery 语义属于安全敏感区，Mimo 不得自行重构。

## E18. Mobile 密钥存储边界

### 规则描述

E18.1 Track A 下 Mobile 不存储 E2EE identity key、signed pre-key、one-time pre-key、root key、chain key、message key、Ratchet state 或 media key。

E18.2 Mobile 当前 Keychain wrapper 有内存 fallback。该 fallback 可用于现有 auth 降级，但不得用于任何长期 E2EE 密钥。

E18.3 Mobile 当前 MMKV 和 SQLite 可继续保存普通会话、消息、pending、上传和非敏感 UI 状态；不得保存未加密 E2EE 私钥或 Ratchet state。

E18.4 Track B 若启动，Mobile E2EE key store 必须先由 Codex 设计并审计。

## E19. secureStorage / Keychain / MMKV / SQLite 使用裁决

### 规则描述

E19.1 Keychain/Keystore 只适合保存小体积高价值 secret，例如 wrapping key、identity private key 句柄或不可导出密钥材料；不得依赖内存 fallback 承载 E2EE。

E19.2 MMKV 只能保存非敏感 E2EE UI flags、deferred 文案状态、session encrypted boolean 缓存等；不得保存私钥、root key、chain key、message key、media key 或明文。

E19.3 SQLite 可以保存消息、pending 队列和未来加密后的 Ratchet blob，但 Ratchet blob 必须由 Keychain/Keystore 保护的 wrapping key 加密后再落库。

E19.4 secureStorage、MMKV、SQLite 的组合方案属于 Track B 前置架构，不得由 Mimo 在功能任务中临时拼接。

## E20. 明文、密文、密钥、Ratchet state 日志禁止规则

### 规则描述

E20.1 禁止记录消息明文、完整密文、media URL、media key、chunk IV 列表、identity private key、signed pre-key private key、OPK private key、root key、chain key、message key、Ratchet state JWK、requestPayloadJson 原文。

E20.2 允许记录脱敏的 sessionId、messageId、clientMessageId、布尔状态、错误类别、counter 数值和是否触发 deferred，但不得记录可复原密钥或内容的原始字段。

E20.3 通知、debugTelemetry、console、logger、crash report、analytics、test snapshot 都适用 E20。

E20.4 现有日志若涉及 Ratchet state counter，可继续作为短期诊断存在；任何新增日志必须遵守 E20.1 到 E20.3。

## E21. 文本消息加密发送边界

### 规则描述

E21.1 Web private encrypted session 发送文本时必须先调用 E2EE 加密，成功取得 ciphertext、Ratchet header 和 deviceId 后才能调用 encrypted send API。

E21.2 加密失败、Ratchet state 缺失、header 生成失败、session 为 `negotiating` 或 `failed` 时必须阻断发送并标记本地 pending failed，不得调用普通 private send API。

E21.3 发送方本地 UI 可保留自己输入的明文用于显示，但服务端 payload、离线 retry payload 和 WebSocket payload 必须是密文及 E2EE metadata。

E21.4 Mobile Track A 不允许 encrypted session 文本发送；只能抛出 E2EE send disabled 文案。

## E22. 文本消息解密接收边界

### 规则描述

E22.1 接收端看到 `encrypted: true` 或 `encrypted: 1` 时，必须把 `content` 视为密文，不得直接展示。

E22.2 Web 接收非自己发送的 encrypted message 时必须使用 `e2eeHeader`、ciphertext、sender identity/ephemeral metadata 和本地 Ratchet state 解密。

E22.3 解密失败时消息必须保持 encrypted 状态或显示不可读遮罩；不得把密文写成普通 content。

E22.4 Mobile Track A 必须始终遮罩 encrypted message，不尝试解密。

## E23. 媒体消息加密边界

### 规则描述

E23.1 Web encrypted session 上传媒体前必须先对文件内容 AES-GCM 加密，再上传密文 blob。

E23.2 media key、chunk IV 和 MIME metadata 不得通过普通明文 `extra` 泄露给服务端或其他端；它们必须被放入受 E2EE 文本 payload 保护的 metadata 中，或等待 Codex 设计专用包装格式。

E23.3 Mobile Track A 不支持 encrypted session 媒体发送；收到 encrypted media message 时必须遮罩 mediaUrl、thumbnailUrl、mediaName、mediaSize 和 duration。

E23.4 大文件 worker、分块大小、media key 包装和跨端媒体解密格式属于安全敏感区，Mimo 不得自行修改。

## E24. pending encrypted payload 边界

### 规则描述

E24.1 Web incoming pending encrypted message cache 只能用于等待协商后重试解密，不得展示密文内容，不得持久化明文。

E24.2 pending encrypted message 中的 header、ciphertext、sender identity metadata 是敏感 payload，日志和测试 snapshot 必须脱敏。

E24.3 Mobile pending queue 若发现 encrypted payload，必须置为 blocked，不得重试发送。

E24.4 Mimo 不得把 pending encrypted payload 转成普通 pending plaintext payload。

## E25. 离线重试与密文 payload 边界

### 规则描述

E25.1 Web encrypted message 若网络失败进入离线 retry，pending repository 必须保存已经生成的 ciphertext、header、deviceId 和 handshake metadata，不得保存一个未来会走普通 send 的明文 payload。

E25.2 已推进 Ratchet state 后，不得在没有事务性 rollback 设计的情况下反复用同一明文重新加密生成多份 retry payload。

E25.3 Mobile Track A retry 必须调用 `blockEncryptedPendingPayload()` 或等价 guard；blocked 状态不能自动恢复为 pending。

E25.4 retry backoff、dedupe 和 server echo merge 规则不得覆盖 E8 的不明文降级要求。

## E26. Mobile 密文遮罩文案边界

### 规则描述

E26.1 Mobile encrypted message 展示文案必须使用或等价于：`此端到端加密消息暂不能在移动端查看，请在 Web 端查看。`

E26.2 Mobile encrypted session 发送阻断文案必须使用或等价于：`移动端暂不支持端到端加密会话发送，请切换到 Web 端或关闭加密通道。`

E26.3 遮罩必须覆盖列表、详情、搜索、通知、lastMessage、离线缓存恢复和本地数据库读出路径。

E26.4 文案不能暗示 Mobile 已经解密、正在解密或只是在网络失败。

## E27. Mobile 加密会话发送阻断边界

### 规则描述

E27.1 Mobile `sendText`、`sendMedia`、retry pending 和任何未来 quick reply/share extension 发送入口都必须在发送前检查 encrypted session 或 encrypted payload。

E27.2 检查失败时必须在本地阻断，不得创建普通 plaintext optimistic message 后继续发送。

E27.3 如果已经创建 optimistic message，必须标记 failed 或 blocked，不能让用户误以为 encrypted session 已发送成功。

E27.4 `ChatSession.encrypted` 缺失时不能反向推断“安全可明文发送”；若消息流中已出现 encrypted payload，必须保守阻断并提示。

## E28. Web 既有行为不得回退清单

### 规则描述

E28.1 不得回退 Web key bundle 生成、上传、signed pre-key 签名验证和本地 bundle consistency check。

E28.2 不得回退 Web private encrypted text send、Ratchet header 生成、encrypted send API 调用和发送方本地明文保留体验。

E28.3 不得回退 Web encrypted incoming decrypt、failed/negotiating 状态提示、pending encrypted cache 和 counter gap 重新协商触发。

E28.4 不得回退 Web media encryption before upload。

E28.5 不得把 Web 的 encrypted session 行为改成 Mobile Track A deferred 行为。

E28.6 不得把 WebSocket store 升级为协议执行层；它必须继续只做事件路由和通知编排。

## E29. shared-types E2EE 字段归属

### 规则描述

E29.1 `Message.encrypted`、`e2eeHeader`、`e2eeDeviceId`、`e2eeSenderIdentityKey`、`e2eeEphemeralKey` 是跨端消息传输和显示字段。

E29.2 `ChatSession.encrypted` 是跨端会话展示和发送阻断字段，不代表本端持有可用 Ratchet state。

E29.3 `WebSocketMessage.type = "E2EE_NEGOTIATION"` 是控制面事件类型；其 payload 语义由 E10 和 E11 限定。

E29.4 shared-types 不得承载私钥、root key、chain key、message key、Ratchet state、media key 或平台存储对象。

## E30. shared-e2ee-core 是否需要创建的裁决

### 规则描述

E30.1 阶段五修订裁决：创建 `frontend/packages/shared-e2ee-core`，但它只能是纯 contract/guard 包，不是加密协议实现包。

E30.2 允许放入 `shared-e2ee-core` 的内容仅限 `E2eeSessionStatus`、错误码/错误分类、错误分类纯函数、敏感日志 sanitize 纯函数、encrypted marker 识别和不明文降级 guard。

E30.3 禁止放入 `shared-e2ee-core` 的内容包括 X3DH、Double Ratchet、media crypto、WebCrypto `CryptoKey`、IndexedDB structured clone、JWK 密钥持久化、Web Worker、File/Blob 加密实现、Ratchet state、私钥、root key、chain key、message key 和 media key。

E30.4 保留禁止协议抽包的原因：Web E2EE 当前直接依赖浏览器 WebCrypto `CryptoKey`、IndexedDB structured clone、JWK 序列化、Web Worker 和浏览器 File/Blob API；这些不是 Mobile 已验证可用的可运行共享核心。

E30.5 未来若要把可运行加密核心迁入 shared 层，必须先由 Codex 设计端口层：crypto port、secure key store port、session store port、random port、codec port、media port 和 test vectors。Mimo 不得自行迁移协议实现。

## E31. E2EE 测试矩阵

### 规则描述

E31.1 Web 必须保持 X3DH、Double Ratchet、media crypto、key-store、device-identity、local-device、negotiation-state 的单元测试和回归测试。

E31.2 Web 发送队列测试必须覆盖 encrypted session 加密成功、加密失败阻断、negotiating 阻断、offline retry 保存密文、sender local plaintext display。

E31.3 WebSocket 测试必须覆盖 `E2EE_NEGOTIATION` 只分发控制事件，不执行 crypto。

E31.4 Mobile 测试必须覆盖 encrypted message mask、encrypted session send block、encrypted pending payload block、websocket negotiation deferred、lastMessage/search/notification 不泄露密文。

E31.5 shared-types/shared-normalizers 测试必须覆盖 camelCase/snake_case E2EE 字段、`encrypted: true/1/0/undefined` 和 `ChatSession.encrypted` 归一化。

E31.6 Track B 启动前必须新增 Web/Mobile test vectors 和真机 Keychain/Keystore 测试；没有这些测试不得上线 Mobile E2EE。

## E32. 阶段五禁止事项

### 规则描述

E32.1 禁止 Mimo 修改 X3DH、Double Ratchet、media crypto 核心算法和 key/session store 安全语义。

E32.2 禁止 Mimo 创建、扩展或重定义 `shared-e2ee-core` 的安全范围；禁止把 Web E2EE 协议代码移动到 shared package。

E32.3 禁止 Mobile 加密发送、解密展示、接受协商、注册 E2EE device 或上传 key bundle。

E32.4 禁止把 encrypted session 或 encrypted message 静默转成 plaintext send/display/retry。

E32.5 禁止把密钥、明文、完整密文、Ratchet state、media key 或 requestPayloadJson 原文写入日志、通知、analytics、storage snapshot。

E32.6 禁止为了修复测试而降低 E8、E12、E13、E20 的安全要求。

## E33. 冲突处理规则

### 规则描述

E33.1 当 UX、离线重试、消息送达率与 E2EE 安全边界冲突时，E2EE 安全边界优先。

E33.2 当 Web 既有行为和 Mobile Track A 策略冲突时，端侧分治：Web 保留既有 E2EE，Mobile 保持 deferred，不做“最小公分母”降级。

E33.3 当 Mimo 任务需求与 E12/E13/E15/E17/E18/E19/E30 冲突时，任务必须暂停并交由 Codex 裁决。

E33.4 当服务端字段、shared-types 字段和端侧状态不一致时，按更保守安全状态处理：encrypted/negotiating/failed 均不得明文发送。

## E34. 后续 Mimo 任务引用方式

### 规则描述

E34.1 每个后续 Mimo 任务必须在任务描述中列出适用条款，例如：`按 E5、E26、E27 为 Mobile 补充 encrypted session 发送阻断测试`。

E34.2 Mimo 可执行任务清单：Mobile deferred 文案测试、encrypted message 遮罩测试、pending encrypted payload blocked 测试、WebSocket negotiation deferred 测试、shared normalizer 字段测试、Web 不回退回归测试、日志脱敏检查，以及调用 `@im/shared-e2ee-core` 已有纯 helper 消除重复 guard。

E34.3 Codex 保留任务清单：X3DH/Double Ratchet 协议语义、OPK 生命周期、多设备 E2EE、Mobile crypto/runtime 选型、secure key store、Ratchet state 持久化、`shared-e2ee-core` 安全范围变更、可运行协议抽包和最终安全审计。

E34.4 高风险点清单：Web encrypted 状态与 Ratchet state 不一致、OPK 生成但未启用、Mobile Keychain 内存 fallback、media key 包装格式未固化、skipped message keys 资源上限、offline retry 与 Ratchet state 事务性、多设备只选最新设备、日志中出现 counter 或状态诊断信息。

E34.5 Mimo 输出必须包含引用条款、修改范围、测试命令、未覆盖风险和是否触及 Codex 保留事项；触及保留事项时不得继续实施。
