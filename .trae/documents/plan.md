# 修复好友申请列表前端未显示问题的计划

## 1. 问题分析
根据排查，前端收到数据但未显示的原因在于**状态字段（`status`）的匹配逻辑不一致**。
- 后端 `FriendRequestDTO` 的 `status` 字段被转换为中文（`"待处理"`、`"已同意"`、`"已拒绝"`）或数字（`0`）。
- 而前端在联系人列表（`ContactsList.vue`）和聊天页面（`Chat.vue`）中，计算“待处理申请数量”时，仅仅硬编码过滤了 `req.status === "PENDING"`。
- 因为条件不匹配，导致 `pendingRequestsCount` 始终为 `0`，从而隐藏了 UI 上的“好友申请提醒”横幅和红点。
- 此外，为防止 `chatStore` 解析 `PageResult` 时出现潜在的类型错误（比如 fallback 到一个对象），需要增强对数组的提取逻辑。

## 2. 实施步骤

### 步骤 1：修复 `ContactsList.vue` 中的状态判断
**文件：** `frontend/src/components/ContactsList.vue`
- 在 `loadPendingRequests` 方法中，将 `req.status === "PENDING"` 修改为兼容逻辑：`req.status === "PENDING" || req.status === "待处理" || req.status === 0`。

### 步骤 2：修复 `Chat.vue` 中的状态判断
**文件：** `frontend/src/pages/Chat.vue`
- 在 `pendingRequestsCount` 的 computed 属性中，同样将 `req.status === "PENDING"` 修改为：`req.status === "PENDING" || req.status === "待处理" || req.status === 0`。

### 步骤 3：增强 `chatStore` 对响应数据的解析鲁棒性
**文件：** `frontend/src/stores/chat.ts`
- 在 `loadFriendRequests` 方法中，优化数据提取逻辑。将其修改为：
  ```typescript
  const data = response.data as any;
  friendRequests.value = Array.isArray(data) ? data : (data?.content || []);
  ```
  这样可以确保 `friendRequests` 始终是一个数组，避免在 `Friends.vue` 的 `v-for` 渲染时由于数据类型为对象而导致渲染错误或不可见。

## 3. 预期结果
完成上述修改后，前端将能正确识别处于“待处理”状态的好友申请，并在“联系人”页面和“聊天”页面正确显示申请数量横幅和红点提醒，彻底解决“已返回数据但不显示”的问题。