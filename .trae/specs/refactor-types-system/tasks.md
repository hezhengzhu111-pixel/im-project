# Tasks: 类型系统重构

## 阶段一：类型系统重构

### 任务 1.1: 创建 src/types/user.ts
- [ ] 创建文件 `src/types/user.ts`
- [ ] 从 `src/types/index.ts` 提取 User 相关类型
- [ ] 合并重复的 `User` 和 `UserInfo` 接口
- [ ] 添加 LoginRequest, RegisterRequest 等请求类型

### 任务 1.2: 创建 src/types/message.ts
- [ ] 创建文件 `src/types/message.ts`
- [ ] 定义 MessageType, MessageStatus 联合类型
- [ ] 定义完整的 Message 接口，移除 any
- [ ] 添加 SendMessageRequest, MessageSearchResult 等类型

### 任务 1.3: 创建 src/types/chat.ts
- [ ] 创建文件 `src/types/chat.ts`
- [ ] 从 index.ts 提取 ChatSession, ChatItem 类型
- [ ] 添加 OnlineStatus, WebSocketMessage 类型

### 任务 1.4: 创建 src/types/group.ts
- [ ] 创建文件 `src/types/group.ts`
- [ ] 从 index.ts 提取 Group, GroupMember 类型
- [ ] 整理群组相关接口

### 任务 1.5: 创建 src/types/api.ts
- [ ] 创建文件 `src/types/api.ts`
- [ ] 定义 ApiResponse<T> 泛型接口
- [ ] 添加 PageRequest, PageResponse 类型

### 任务 1.6: 创建 src/types/common.ts
- [ ] 创建文件 `src/types/common.ts`
- [ ] 提取 FileInfo, UploadProgress 类型
- [ ] 提取 UserSettings, MenuItem, TabItem 等公共类型

### 任务 1.7: 创建 src/types/utils.ts
- [ ] 创建文件 `src/types/utils.ts`
- [ ] 添加 isMessage, isUser, isApiResponse 类型守卫
- [ ] 添加 PartialBy, RequiredBy 工具类型

### 任务 1.8: 重构 src/types/index.ts
- [ ] 编辑 `src/types/index.ts`
- [ ] 改为重新导出所有子模块类型
- [ ] 保持向后兼容

# Task Dependencies
- 任务 1.1 - 1.7 可以并行执行
- 任务 1.8 依赖于 1.1 - 1.7 全部完成
