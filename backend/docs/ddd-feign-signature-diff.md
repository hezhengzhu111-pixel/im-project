# Feign 接口 Entity -> DTO 对比说明

## 当前仓库实际检查结果

已检查以下文件：

- `backend/common/src/main/java/com/im/feign/AuthServiceFeignClient.java`
- `backend/common/src/main/java/com/im/feign/UserServiceFeignClient.java`
- `backend/common/src/main/java/com/im/feign/GroupServiceFeignClient.java`
- `backend/common/src/main/java/com/im/feign/MessageServiceFeignClient.java`
- `backend/common/src/main/java/com/im/feign/ImServerFeignClient.java`

当前结论：

- 未发现 Entity 作为 Feign 方法入参或出参。
- 当前接口已经统一使用 DTO、请求对象或基础类型。
- 因此，按当前仓库真实状态，`common/feign` 不需要做 Entity -> DTO 的实际代码修改。

## 当前状态示例

### `UserServiceFeignClient`

```java
@GetMapping("/{userId}")
ApiResponse<UserDTO> getUserResponse(@PathVariable("userId") Long userId);
```

### `GroupServiceFeignClient`

```java
@GetMapping("/list/{userId}")
ApiResponse<List<GroupInfoDTO>> listUserGroupsResponse(@PathVariable("userId") Long userId);
```

### `MessageServiceFeignClient`

```java
@PostMapping("/system/private")
ApiResponse<MessageDTO> sendSystemPrivateMessage(@RequestBody SendSystemMessageRequest request);
```

### `AuthServiceFeignClient`

```java
@GetMapping("/user-resource/{userId}")
ApiResponse<AuthUserResourceDTO> getUserResourceResponse(@PathVariable("userId") Long userId);
```

## 面向评审的标准前后对比模板

以下 diff 不是当前仓库实际变更，而是“如果 Feign 接口仍在使用 Entity”时，应该如何替换成 DTO 的标准模板。

### 1. User -> UserDTO

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

### 2. Group -> GroupInfoDTO

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

### 3. Message -> MessageDTO

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

### 4. GroupMember -> GroupMemberDTO

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

### 5. FriendRequest -> FriendRequestDTO

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

## 额外观察

- `common/pom.xml` 仍包含 `spring-cloud-starter-openfeign`。
- `internal-client` 模块也存在同包名 `com.im.feign.*` 客户端副本。
- 这说明当前真正需要继续推进的边界治理，是把 Feign 客户端从 `common` 彻底下沉到 `internal-client`，但这超出本次“签名替换对比”的范围。
