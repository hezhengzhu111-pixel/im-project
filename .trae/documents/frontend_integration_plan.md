# 前端接口联调与逻辑完善计划

## 1. 目标
以后端代码 (`backend/` 目录下的微服务) 为基准，分析前端代码 (`frontend/` 目录)，找出接口定义和逻辑上的差异，完成前后端接口联调，并完善前端的交互逻辑，确保即时通讯(IM)系统的核心功能能够端到端正常运行。

## 2. 核心分析范围
- **后端服务 (基准)**：`auth-service`, `user-service`, `group-service`, `message-service`, `file-service`, `im-server`, `gateway`。
- **前端服务代码**：`frontend/src/services/` (包含 auth, user, friend, group, message, file, im)。
- **前端状态与交互代码**：`frontend/src/hooks/` 和 `frontend/src/components/` (消息收发、WebSocket状态等)。

## 3. 执行步骤

### 阶段一：环境与基础配置对齐
1. **网关与环境配置检查**：
   - 检查前端 `.env.dev` / `.env.sit` 中定义的网关端口 (如 `VITE_GATEWAY_PORT`) 是否与后端 `gateway` 服务的端口 (如 8082 或 8080) 一致。
   - 确认前端 Axios 实例的基础路径 (BaseURL) 是否正确拼接了后端网关的前缀。
2. **鉴权机制对齐**：
   - 对比前端 `auth.ts` 与后端 `AuthController` 的登录/注册/登出接口。
   - 确认前端 HTTP 请求拦截器中注入 Token 的方式是否符合后端 `JwtAuthGlobalFilter` 和 `JwtAuthInterceptor` 的要求 (如 `Authorization: Bearer <token>`)。
   - 检查前端 `auth-refresh.ts` (无感刷新 Token 逻辑) 是否与后端双 Token 机制 (Access/Refresh Token) 匹配。

### 阶段二：核心业务接口一致性校验与修复
逐个核对并修复前端 `services` 中的 API 定义，确保与后端 Controller 完全一致（包含路径、Method、请求体DTO、响应体结构）：
1. **用户与好友模块 (`user.ts`, `friend.ts`)**：
   - 校验用户搜索、好友申请、好友列表获取、好友申请处理等接口。
2. **群组模块 (`group.ts`)**：
   - 校验群组创建、加入、成员列表、群信息更新等接口。
3. **消息模块 (`message.ts`)**：
   - 校验历史消息拉取、消息状态(已读)更新等接口。
4. **文件模块 (`file.ts`)**：
   - 校验文件上传、下载接口是否与 `file-service` 的 `FileController` 匹配。

### 阶段三：WebSocket 实时通信与消息链路联调
1. **WebSocket 连接与鉴权**：
   - 分析 `frontend/src/config/websocket.ts` 和 `im.ts`，确保 WebSocket 连接的 URL 和鉴权方式 (通常是 URL 参数或 Sec-WebSocket-Protocol 携带 token) 与后端 `im-server` 的 `WebSocketHandshakeInterceptor` 匹配。
2. **心跳与重连机制**：
   - 确认前端的心跳发送频率和消息格式与后端 `HeartbeatWsMessageHandler` 一致，保障长连接稳定性。
3. **消息收发逻辑**：
   - 完善前端 `useChatLogic.ts` / `useMessage.ts` 中的消息处理。
   - 确保发出的聊天消息数据结构与后端 `MessageDTO` / `SendPrivateMessageRequest` 对齐。
   - 处理后端推送的 WebSocket 消息，并实时更新到 Vue 组件的会话列表和聊天窗口。

### 阶段四：前端状态与 UI 交互完善
1. **会话列表更新**：收到新消息时，自动将对应的会话置顶并更新最新消息摘要。
2. **未读消息与已读回执**：完善未读角标逻辑，处理当前聊天窗口内的消息自动已读上报。
3. **全局异常处理**：
   - 完善 Axios 响应拦截器，针对 401 状态码触发登出或 Token 刷新。
   - 针对其他业务异常展示全局 Toast 提示。

### 阶段五：端到端闭环验证
1. 启动完整的后端基础设施 (MySQL, Redis, Kafka, Nacos 等) 及后端微服务。
2. 启动前端开发服务器 (`npm run dev`)。
3. 执行如下测试用例：
   - 新用户注册与登录。
   - 互加好友。
   - 创建群聊并邀请好友。
   - 发送文本、图片消息 (私聊与群聊)。
   - 验证消息接收的实时性及历史消息回放。

## 4. 预期产出
- 修复所有前后端不一致的 API 调用代码。
- 修复并完善 WebSocket 连接管理与消息分发逻辑。
- 确保系统核心 IM 业务链路无阻断 Bug。