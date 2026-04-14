# 消息分发策略模式重构计划

## Summary

- 目标：对 `message-service` 现有发送链路做进一步解耦，收敛为更稳定的“策略处理器 + `MessageType` 映射缓存”结构。
- 严格边界：
  - 仅调整代码组织结构、处理器拆分方式、方法分发方式。
  - 不改私聊、群聊、系统消息的业务步骤、事务边界、存库逻辑、Outbox 投递逻辑。
- 已确认决策：
  - 保留仓库现有的 `SendMessageCommand` 作为发送上下文，不强行改成 `MessageDTO` 版接口。
  - 仅覆盖发送链路，不把 `recallMessage` / `deleteMessage` 纳入本轮策略化。
  - 将当前混在 `PrivateMessageHandler` 中的系统消息发送逻辑拆成独立 `SystemMessageHandler`。

## Current State Analysis

### 1. `MessageServiceImpl` 现状

- `backend/message-service/src/main/java/com/im/service/impl/MessageServiceImpl.java`
  - 当前已经不存在 `switch-case` 分发。
  - `sendPrivateMessage()` / `sendGroupMessage()` / `sendSystemMessage()` 都会先组装 `SendMessageCommand`，再统一进入 `sendMessage(SendMessageCommand command)`。
  - `sendMessage()` 当前逻辑为：
    - 遍历 `List<MessageHandler> messageHandlers`
    - 通过 `supports(command)` 找到第一个匹配处理器
    - 执行 `handle(command)`
  - 当前还没有按 `MessageType` 做预构建 Map 缓存。

### 2. 处理器现状

- `backend/message-service/src/main/java/com/im/handler/MessageHandler.java`
  - 当前接口为：
    - `boolean supports(SendMessageCommand command)`
    - `MessageDTO handle(SendMessageCommand command)`
- `backend/message-service/src/main/java/com/im/handler/AbstractMessageHandler.java`
  - 已封装通用模板流程：
    - 基础参数校验
    - 上下文构建
    - 锁获取/释放
    - 事务执行
    - 结果构造
  - 已承载大量“不应重复实现”的公共逻辑。
- `backend/message-service/src/main/java/com/im/handler/PrivateMessageHandler.java`
  - 当前同时处理：
    - 普通私聊
    - 系统消息
  - 系统消息逻辑和普通私聊逻辑共享同一处理器，但 `buildContext()` 内有明显分支。
- `backend/message-service/src/main/java/com/im/handler/GroupMessageHandler.java`
  - 当前处理群聊发送。

### 3. 实际偏差与重构机会

- 仓库已经做过一轮策略化，所以本轮不是“从 `switch-case` 迁移到策略模式”的从零重构。
- 当前仍有三个结构问题：
  - `MessageServiceImpl` 每次发送都线性遍历 `handlers`，没有类型到处理器的缓存。
  - `PrivateMessageHandler` 同时承担“普通私聊 + 系统消息”两种职责，违反单一职责。
  - 处理器接口是“命令匹配式”，但尚未形成清晰的 `MessageType -> Handler` 注册表。

## Proposed Changes

### A. 保留现有 `MessageHandler` 接口，但调整为类型驱动匹配

#### 文件

- `backend/message-service/src/main/java/com/im/handler/MessageHandler.java`

#### 改法

- 保留 `SendMessageCommand` 作为输入，不改成 `MessageDTO`。
- 将接口从“按整个命令判断”收敛为“按消息类型判断”，建议调整为：
  - `boolean supports(MessageType type);`
  - `MessageDTO handle(SendMessageCommand command);`
- 原因：
  - 既满足你对“策略模式 + supports”语义的要求。
  - 又避免为了对齐文档而强行把当前发送上下文从 `SendMessageCommand` 降级成 `MessageDTO`，导致额外转换和逻辑回流。

### B. 新增 `SystemMessageHandler`，把系统消息逻辑从私聊处理器中平移出去

#### 文件

- 新增 `backend/message-service/src/main/java/com/im/handler/SystemMessageHandler.java`
- 修改 `backend/message-service/src/main/java/com/im/handler/PrivateMessageHandler.java`

#### 改法

- `SystemMessageHandler`
  - 继承 `AbstractMessageHandler`
  - `supports(MessageType type)` 仅匹配 `MessageType.SYSTEM`
  - `handle()` 所用业务步骤完全平移自当前 `PrivateMessageHandler` 中 `command.isSystemMessage()` 分支：
    - 解析系统发送者 ID
    - 校验接收者存在
    - 构造上下文
    - 构建消息实体
    - 持久化
    - Outbox 入队
    - 清缓存
    - 转 DTO
- `PrivateMessageHandler`
  - 改为只处理普通私聊。
  - 移除 `command.isSystemMessage()` 分支判断及对应上下文逻辑。
  - `supports(MessageType type)` 仅匹配“非群聊发送场景下的非系统私聊消息”。

#### 约束

- 系统消息的持久化、锁、事务、Outbox payload、缓存清理逻辑必须原样平移，不允许业务改写。

### C. `GroupMessageHandler` 保持逻辑不动，仅对齐新接口

#### 文件

- `backend/message-service/src/main/java/com/im/handler/GroupMessageHandler.java`

#### 改法

- 不改群聊内部业务逻辑。
- 仅把 `supports(SendMessageCommand command)` 改为 `supports(MessageType type)` 或等价类型匹配实现。
- 若需要区分群聊与私聊，不应把群聊业务判断搬回 `MessageServiceImpl`；建议在处理器注册阶段用“命名注册 + 构建 Map”解决。

### D. `MessageServiceImpl` 引入 `MessageType -> Handler` 缓存

#### 文件

- `backend/message-service/src/main/java/com/im/service/impl/MessageServiceImpl.java`

#### 改法

- 保留现有：
  - `List<MessageHandler> messageHandlers`
  - `sendPrivateMessage()` / `sendGroupMessage()` / `sendSystemMessage()` 的 `SendMessageCommand` 组装逻辑
- 新增一个处理器缓存，例如：
  - `Map<MessageType, MessageHandler> handlerCache`
- 在初始化阶段构建注册表，推荐使用：
  - `@PostConstruct`
  或
  - 构造器中完成不可变 Map 构建
- 建议缓存策略：
  - `SYSTEM -> SystemMessageHandler`
  - 其余私聊类型不能只靠 `MessageType` 唯一判定，因为私聊与群聊都可能使用 `TEXT` / `IMAGE` 等同一类型。
  - 因此更稳妥的实现应为“双层路由”：
    - 第一层：若 `command.isSystemMessage()`，直接取 `SYSTEM`
    - 第二层：若 `command.isGroup()`，走 `GroupMessageHandler`
    - 否则走 `PrivateMessageHandler`
- 由于你明确要求“以 `MessageType` 为 Key 的 Map 缓存”，计划建议如下折中做法：
  - `Map<MessageType, MessageHandler>` 只承担系统消息和未来按类型区分的扩展点。
  - 私聊/群聊主分发仍需保留“群聊优先判断”这一维，以免 `TEXT` 同时映射到私聊和群聊时发生歧义。

#### `sendMessage()` 重构目标

- 当前：
  - `stream().filter(...).findFirst()`
- 重构后：
  - 先做最小必要路由判断
  - 再通过缓存 Map 直接定位处理器
  - 最后调用 `handle(command)`

#### 推荐关键逻辑

- `sendMessage(SendMessageCommand command)` 建议形成以下顺序：
  1. 校验 `command` / `messageType`
  2. 若 `command.isSystemMessage()`，从 `handlerCache` 获取 `MessageType.SYSTEM`
  3. 若 `command.isGroup()`，调用预先持有的 `groupMessageHandler`
  4. 否则调用预先持有的 `privateMessageHandler`
  5. 未命中则抛出 `BusinessException`

#### 原因

- 这是在“按你要求引入类型缓存”和“尊重仓库现有命令语义”之间最小风险的平衡点。
- 如果强制把所有发送类型都映射成单纯的 `Map<MessageType, Handler>`，会因为同一个 `MessageType` 可同时用于私聊和群聊而导致路由歧义。

### E. 示例代码交付口径

执行阶段最终给用户的代码示例应包含三部分：

- `MessageHandler` 接口
  - 展示新的 `supports(MessageType type)` 与 `handle(SendMessageCommand command)` 形式
- 一个具体实现类示例
  - 优先给 `SystemMessageHandler`，因为它最能体现“从 `PrivateMessageHandler` 拆职责”的重构价值
- `MessageServiceImpl` 关键代码
  - 展示 `List<MessageHandler>` 注入
  - 展示处理器缓存 Map 初始化
  - 展示 `sendMessage()` 改造后的核心分发逻辑

## Assumptions & Decisions

- 本轮不再按 `MessageDTO` 作为处理器入参推进，避免破坏当前稳定的发送上下文建模。
- 本轮只处理发送链路，不把撤回/删除状态流转也强行纳入策略模式。
- `SystemMessageHandler` 必须独立拆出，因为这是当前最明显的职责混杂点。
- 私聊、群聊、系统消息的具体业务步骤必须原样平移，不做语义修改。
- `MessageType` 不能单独覆盖“私聊/群聊”全部路由，因此计划允许在 `sendMessage()` 中保留极小量场景判断，以避免错误映射。

## Verification Steps

### 结构验证

- 确认存在以下处理器：
  - `MessageHandler`
  - `PrivateMessageHandler`
  - `GroupMessageHandler`
  - `SystemMessageHandler`
- 确认 `PrivateMessageHandler` 不再包含系统消息分支。

### 分发验证

- `MessageServiceImpl.sendMessage()` 不再使用 `stream().filter(...).findFirst()`。
- `MessageServiceImpl` 中存在处理器缓存结构。
- `sendPrivateMessage()` / `sendGroupMessage()` / `sendSystemMessage()` 仍只负责构建命令并委派，不重新内联业务逻辑。

### 回归验证

- 私聊发送行为不变
- 群聊发送行为不变
- 系统消息发送行为不变
- 事务、加锁、幂等、Outbox、缓存清理逻辑不变

### 测试建议

- 更新或新增以下方向的单测：
  - `MessageServiceImplTest`
    - 验证系统消息、群聊、私聊都能命中正确处理器
  - `PrivateMessageHandlerTest`
    - 验证仅覆盖普通私聊
  - `GroupMessageHandlerTest`
    - 验证群聊路径不变
  - 新增 `SystemMessageHandlerTest`
    - 验证系统消息逻辑从私聊处理器原样平移后行为一致
