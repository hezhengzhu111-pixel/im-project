# DDD 边界清理与实体迁移计划

## Summary

- 目标：清理 `common` 模块中的持久化模型残留与 Feign 客户端耦合，确保实体和 MyBatis 配置只位于所属微服务内，公共模块只保留 DTO/通用工具。
- 严格边界：
  - 仅执行文件迁移、目录清理、import 批量替换、Feign 接口签名替换。
  - 不改任何 Controller / Service 业务逻辑，不改 Mapper SQL 逻辑，不改数据库表结构。
- 已确认执行口径：
  - 脚本按当前仓库真实状态生成，而不是按“common 仍持有全部业务实体”的理想化起点生成。
  - Feign 部分同时给出“当前仓库实际检查结果”和“若存在 Entity 签名时的标准替换前后对比模板”。

## Current State Analysis

### 1. `common/entity` 与业务实体现状

- 当前 `backend/common/src/main/java/com/im/entity` 下只剩：
  - `BaseEntity.java`
- 你点名的业务实体 `User` / `Friend` / `FriendRequest` / `Message` / `MessageReadStatus` / `Group` / `GroupMember` 已经不在 `common` 中。
- 这些业务实体目前实际分布在各服务的两套包结构里：
  - `user-service/src/main/java/com/im/entity/*.java`
  - `user-service/src/main/java/com/im/user/entity/*.java`
  - `message-service/src/main/java/com/im/entity/*.java`
  - `message-service/src/main/java/com/im/message/entity/*.java`
  - `group-service/src/main/java/com/im/entity/*.java`
  - `group-service/src/main/java/com/im/group/entity/*.java`
- 进一步检查 import 后发现：
  - 代码实际引用的是 `com.im.user.entity.*`
  - `com.im.message.entity.*`
  - `com.im.group.entity.*`
  - 几乎没有对服务内 `com.im.entity.*` 这些平级实体类的引用。
- 结论：
  - 当前最大的边界问题不是“从 `common` 迁出业务实体”，而是“各服务内存在两套重复实体包，且引用集中在带服务前缀的旧包”。

### 2. `BaseEntity` 与持久化基础设施现状

- `backend/common/src/main/java/com/im/entity/BaseEntity.java` 仍存在。
- 但服务内实际实体类已经大量继承：
  - `com.im.persistence.entity.BaseEntity`
- 仓库中未发现对 `com.im.entity.BaseEntity` 的真实 import 使用。
- 结论：
  - `common` 下这个 `BaseEntity` 是可清理的残留公共持久化类。
  - `persistence-common` 已经承担了更合理的持久化基类职责。

### 3. `MybatisPlusConfig` 现状

- `backend/common/src/main/java/com/im/config/MybatisPlusConfig.java` 当前不存在。
- 三个数据库微服务内已各自存在：
  - `user-service/src/main/java/com/im/config/MybatisPlusConfig.java`
  - `message-service/src/main/java/com/im/config/MybatisPlusConfig.java`
  - `group-service/src/main/java/com/im/config/MybatisPlusConfig.java`
- 且三个类实现一致，均提供：
  - `MybatisPlusInterceptor`
  - `MetaObjectHandler`
- 结论：
  - 你要求的第 4 步在当前仓库已基本完成。
  - 真正需要做的是“确认 common 中无残留配置”和“保留服务内配置不动”。

### 4. `common/feign` 现状

- `backend/common/src/main/java/com/im/feign` 下的以下接口均已改为 DTO / 基础类型签名：
  - `AuthServiceFeignClient`
  - `UserServiceFeignClient`
  - `GroupServiceFeignClient`
  - `MessageServiceFeignClient`
  - `ImServerFeignClient`
- 逐个检查后未发现以下签名残留：
  - `ApiResponse<User>`
  - `ApiResponse<Group>`
  - `ApiResponse<Message>`
  - `ApiResponse<GroupMember>`
  - `ApiResponse<FriendRequest>`
  - 其他 Entity 入参 / 出参
- 典型现状：
  - `UserServiceFeignClient#getUserResponse()` 返回 `ApiResponse<UserDTO>`
  - `GroupServiceFeignClient#listUserGroupsResponse()` 返回 `ApiResponse<List<GroupInfoDTO>>`
  - `MessageServiceFeignClient#sendSystemPrivateMessage()` 返回 `ApiResponse<MessageDTO>`
- 但 `common/pom.xml` 仍包含 `spring-cloud-starter-openfeign`，且 `internal-client` 模块也存在同名 `com.im.feign.*` 客户端副本。
- 结论：
  - 当前 Feign 的“Entity -> DTO”替换在接口层已完成。
  - 仍存在更大的架构边界问题：`common` 继续承载 Feign 客户端与 OpenFeign 依赖，和 `internal-client` 模块职责重叠。

## Proposed Changes

### A. 目录迁移口径

- 本次脚本按“仓库真实现状”执行，目标不是从 `common` 迁出业务实体，而是：
  - 统一保留服务内的一个实体包入口
  - 清理服务内重复实体包
  - 清理 `common` 中残留的持久化基类
- 统一后的实体放置目标：
  - `user-service/src/main/java/com/im/entity`
  - `message-service/src/main/java/com/im/entity`
  - `group-service/src/main/java/com/im/entity`

### B. 可执行 Bash 文件移动脚本

以下脚本按当前仓库状态设计，包含保护性判断：

```bash
#!/usr/bin/env bash
set -euo pipefail

ROOT="${1:-$(pwd)}"
BACKEND="$ROOT/backend"

USER_SRC="$BACKEND/user-service/src/main/java/com/im/user/entity"
USER_DST="$BACKEND/user-service/src/main/java/com/im/entity"
MSG_SRC="$BACKEND/message-service/src/main/java/com/im/message/entity"
MSG_DST="$BACKEND/message-service/src/main/java/com/im/entity"
GROUP_SRC="$BACKEND/group-service/src/main/java/com/im/group/entity"
GROUP_DST="$BACKEND/group-service/src/main/java/com/im/entity"

COMMON_ENTITY_DIR="$BACKEND/common/src/main/java/com/im/entity"
COMMON_CONFIG_FILE="$BACKEND/common/src/main/java/com/im/config/MybatisPlusConfig.java"

mkdir -p "$USER_DST" "$MSG_DST" "$GROUP_DST"

move_if_exists() {
  local src="$1"
  local dst="$2"
  if [[ -f "$src" ]]; then
    mv "$src" "$dst"
    echo "moved: $src -> $dst"
  else
    echo "skip missing: $src"
  fi
}

remove_if_exists() {
  local path="$1"
  if [[ -e "$path" ]]; then
    rm -rf "$path"
    echo "removed: $path"
  else
    echo "skip missing: $path"
  fi
}

echo "== 1. 用户域实体归位 =="
move_if_exists "$USER_SRC/User.java" "$USER_DST/User.java"
move_if_exists "$USER_SRC/Friend.java" "$USER_DST/Friend.java"
move_if_exists "$USER_SRC/FriendRequest.java" "$USER_DST/FriendRequest.java"

echo "== 2. 消息域实体归位 =="
move_if_exists "$MSG_SRC/Message.java" "$MSG_DST/Message.java"
move_if_exists "$MSG_SRC/MessageReadStatus.java" "$MSG_DST/MessageReadStatus.java"

echo "== 3. 群组域实体归位 =="
move_if_exists "$GROUP_SRC/Group.java" "$GROUP_DST/Group.java"
move_if_exists "$GROUP_SRC/GroupMember.java" "$GROUP_DST/GroupMember.java"

echo "== 4. 可选：一并处理仓库中同域重复实体 =="
move_if_exists "$USER_SRC/UserSettings.java" "$USER_DST/UserSettings.java"
move_if_exists "$MSG_SRC/GroupReadCursor.java" "$MSG_DST/GroupReadCursor.java"
move_if_exists "$MSG_SRC/MessageOutboxEvent.java" "$MSG_DST/MessageOutboxEvent.java"

echo "== 5. 删除旧包目录（仅当已迁空） =="
remove_if_exists "$USER_SRC"
remove_if_exists "$MSG_SRC"
remove_if_exists "$GROUP_SRC"

echo "== 6. 删除 common 残留持久化类/配置 =="
remove_if_exists "$COMMON_ENTITY_DIR/BaseEntity.java"
remove_if_exists "$COMMON_CONFIG_FILE"

echo "== 7. import 批量替换建议 =="
cat <<'EOF'
请对以下 import 做全仓批量替换：

com.im.user.entity.User           -> com.im.entity.User
com.im.user.entity.Friend         -> com.im.entity.Friend
com.im.user.entity.FriendRequest  -> com.im.entity.FriendRequest
com.im.user.entity.UserSettings   -> com.im.entity.UserSettings

com.im.message.entity.Message          -> com.im.entity.Message
com.im.message.entity.MessageReadStatus-> com.im.entity.MessageReadStatus
com.im.message.entity.GroupReadCursor  -> com.im.entity.GroupReadCursor
com.im.message.entity.MessageOutboxEvent -> com.im.entity.MessageOutboxEvent

com.im.group.entity.Group        -> com.im.entity.Group
com.im.group.entity.GroupMember  -> com.im.entity.GroupMember

com.im.entity.BaseEntity         -> com.im.persistence.entity.BaseEntity
EOF

echo "完成：文件移动脚本已执行，请随后运行 IDE rename/import optimize 与单元测试。"
```

### C. import 替换范围

根据当前实际引用，执行器需要重点替换以下路径中的 import：

- `user-service`
  - `mapper/*`
  - `service/*`
  - `service/impl/*`
  - `util/DTOConverter.java`
  - 对应测试
- `message-service`
  - `mapper/*`
  - `handler/*`
  - `service/*`
  - `metrics/*`
  - `util/MessageConverter.java`
  - 对应测试
- `group-service`
  - `mapper/*`
  - `controller/GroupInternalController.java`
  - `service/impl/GroupServiceImpl.java`
  - 对应测试

### D. `MybatisPlusConfig` 处理策略

- 当前 `common` 下该配置已经不存在，因此脚本中保留“若存在则删除”的幂等处理即可。
- `user-service` / `message-service` / `group-service` 内现有配置类已满足“各服务自有数据库配置”目标，不需要新建。

### E. `common/feign` 实际检查结果

#### 当前仓库实际结果

- 本次检查后，`common/feign` 中未发现任何 Entity 作为入参/出参的方法签名。
- 因此“实际代码层面的 Entity -> DTO 替换 diff”为：

```diff
--- backend/common/src/main/java/com/im/feign/UserServiceFeignClient.java
+++ backend/common/src/main/java/com/im/feign/UserServiceFeignClient.java
@@
- // 当前仓库已使用 ApiResponse<UserDTO>
+ // 无需修改

--- backend/common/src/main/java/com/im/feign/GroupServiceFeignClient.java
+++ backend/common/src/main/java/com/im/feign/GroupServiceFeignClient.java
@@
- // 当前仓库已使用 ApiResponse<List<GroupInfoDTO>>
+ // 无需修改

--- backend/common/src/main/java/com/im/feign/MessageServiceFeignClient.java
+++ backend/common/src/main/java/com/im/feign/MessageServiceFeignClient.java
@@
- // 当前仓库已使用 ApiResponse<MessageDTO>
+ // 无需修改

--- backend/common/src/main/java/com/im/feign/AuthServiceFeignClient.java
+++ backend/common/src/main/java/com/im/feign/AuthServiceFeignClient.java
@@
- // 当前仓库已使用 TokenPairDTO / TokenParseResultDTO / AuthUserResourceDTO 等 DTO
+ // 无需修改
```

#### 面向评审文档的“标准替换模板”

若后续在 `common/feign` 或 `internal-client/feign` 中再次出现 Entity 签名，应按下面方式替换：

```diff
--- before
+++ after
@@
- import com.im.user.entity.User;
+ import com.im.dto.UserDTO;

- @GetMapping("/{userId}")
- ApiResponse<User> getUserResponse(@PathVariable("userId") Long userId);
+ @GetMapping("/{userId}")
+ ApiResponse<UserDTO> getUserResponse(@PathVariable("userId") Long userId);
```

```diff
--- before
+++ after
@@
- import com.im.group.entity.Group;
+ import com.im.dto.GroupInfoDTO;

- @GetMapping("/list/{userId}")
- ApiResponse<List<Group>> listUserGroupsResponse(@PathVariable("userId") Long userId);
+ @GetMapping("/list/{userId}")
+ ApiResponse<List<GroupInfoDTO>> listUserGroupsResponse(@PathVariable("userId") Long userId);
```

```diff
--- before
+++ after
@@
- import com.im.message.entity.Message;
+ import com.im.dto.MessageDTO;

- @PostMapping("/system/private")
- ApiResponse<Message> sendSystemPrivateMessage(@RequestBody SendSystemMessageRequest request);
+ @PostMapping("/system/private")
+ ApiResponse<MessageDTO> sendSystemPrivateMessage(@RequestBody SendSystemMessageRequest request);
```

```diff
--- before
+++ after
@@
- import com.im.group.entity.GroupMember;
+ import com.im.dto.GroupMemberDTO;

- @GetMapping("/members/{groupId}")
- ApiResponse<List<GroupMember>> membersResponse(@PathVariable("groupId") Long groupId);
+ @GetMapping("/members/{groupId}")
+ ApiResponse<List<GroupMemberDTO>> membersResponse(@PathVariable("groupId") Long groupId);
```

```diff
--- before
+++ after
@@
- import com.im.user.entity.FriendRequest;
+ import com.im.dto.FriendRequestDTO;

- @PostMapping("/friend/request")
- ApiResponse<FriendRequest> sendRequest(@RequestBody SendFriendRequestRequest request);
+ @PostMapping("/friend/request")
+ ApiResponse<FriendRequestDTO> sendRequest(@RequestBody SendFriendRequestRequest request);
```

### F. 额外的架构说明

- `common/pom.xml` 当前仍含 `spring-cloud-starter-openfeign`。
- `internal-client` 模块也持有同包名 `com.im.feign.*` 的客户端接口副本。
- 这说明当前项目已经开始把客户端能力外移，但 `common` 和 `internal-client` 之间仍有职责重叠。
- 若后续继续做边界治理，建议下一阶段将 Feign 客户端彻底从 `common` 剥离到 `internal-client`，但这超出本次“仅生成迁移脚本和 Feign 签名对比”的边界。

## Assumptions & Decisions

- 本次脚本按仓库真实状态设计，不强行假设 `common` 仍持有 `User` / `Message` / `Group` 等业务实体。
- 本次迁移的实质是：
  - `com.im.user.entity.*` -> `com.im.entity.*`
  - `com.im.message.entity.*` -> `com.im.entity.*`
  - `com.im.group.entity.*` -> `com.im.entity.*`
- `common/src/main/java/com/im/entity/BaseEntity.java` 视为可删除残留类，前提是执行阶段再次确认无引用。
- `common/feign` 当前实际无需做 Entity->DTO 替换；文档中的 diff 模板仅供未来评审/治理复用。
- 不触碰任何业务逻辑、Mapper SQL、数据库 schema。

## Verification Steps

### 脚本执行后验证

- 确认以下目录已不存在或为空：
  - `user-service/src/main/java/com/im/user/entity`
  - `message-service/src/main/java/com/im/message/entity`
  - `group-service/src/main/java/com/im/group/entity`
- 确认以下目录为唯一实体入口：
  - `user-service/src/main/java/com/im/entity`
  - `message-service/src/main/java/com/im/entity`
  - `group-service/src/main/java/com/im/entity`

### import 与编译验证

- 全仓搜索确认不存在以下 import：
  - `com.im.user.entity.`
  - `com.im.message.entity.`
  - `com.im.group.entity.`
  - `com.im.entity.BaseEntity`
- 运行受影响模块编译或单测：
  - `user-service`
  - `message-service`
  - `group-service`

### Feign 验证

- 再次检查 `common/src/main/java/com/im/feign/*.java`：
  - 不存在 Entity 入参/出参
  - 仅使用 DTO / 基础类型 / 请求对象

### 边界回归

- Controller 业务逻辑不改
- Service 业务逻辑不改
- Mapper SQL 执行逻辑不改
- 数据库表结构不改
