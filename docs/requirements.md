# 即时通信系统需求文档

## 1. 背景与目标
- 提供端对端加密的即时通信能力，覆盖私聊、群聊、在线状态与多端消息同步。
- 建立可扩展的微服务架构，支持独立扩容与灰度发布。
- 提供标准化的 REST 与 WebSocket 接口，方便前端与第三方系统集成。
- 满足基础生产可用性要求：鉴权、安全、限流、可观测、可运维。

## 2. 术语与范围
- IM：即时通信
- 端到端加密：消息内容在客户端侧加解密，服务端不存明文
- 会话：私聊或群聊的消息集合
- 游标：按消息 ID 或时间戳翻页

### 2.1 范围内
- 用户注册、登录、Token 鉴权
- 好友关系管理
- 群组管理与成员管理
- 消息发送/存储/已读/撤回/删除
- 文件与媒体上传
- WebSocket 实时推送与在线状态
- 网关路由与服务编排

### 2.2 范围外
- 高级合规功能（数据脱敏、审计报表等）
- 复杂运营后台与 BI
- 群组复杂权限矩阵（多角色、多级审批）

## 3. 角色与使用场景
- 普通用户：注册登录、加好友、私聊/群聊、上传文件
- 群主/管理员：创建群、邀请成员、移除成员
- 系统管理员：配置部署、运维监控、设置限流与策略

## 4. 功能需求

### 4.1 鉴权与账号
- 支持用户注册、登录、刷新 token、解析 token
- 用户信息包含用户名、昵称、头像、邮箱、手机号与状态
- 网关白名单：登录、注册、检查用户名、token 解析/刷新、WebSocket、/api/im

### 4.2 好友关系
- 发起好友申请、同意/拒绝、列表查询
- 私聊只允许好友之间发起
- 好友列表用于会话与在线状态展示

### 4.3 群组管理
- 创建群、修改群信息、解散群
- 邀请/添加成员、移除成员
- 查询群列表与群成员列表
- 群消息仅群成员可发送与查看

### 4.4 消息管理
- 私聊消息发送与存储
- 群聊消息发送与存储
- 会话列表：返回每个会话的最后一条消息、未读数、会话信息
- 消息列表分页与游标拉取
- 已读回执：按会话标记已读并更新未读数
- 消息撤回与删除
- 文本消息长度限制支持配置：是否启用与最大长度
- 发送频率限流：分钟/小时/日级计数

### 4.5 文件与媒体
- 支持图片、文件、音频、视频上传
- 上传文件类型白名单校验
- 最大上传大小可配置
- 返回媒体 URL 供消息发送时引用

### 4.6 实时推送与在线状态
- WebSocket 连接：`/websocket/{userId}`
- 支持断线重连与心跳保活
- 实时消息推送与在线状态更新
- Kafka 作为消息总线，保证消息异步投递与削峰

## 5. 系统架构与服务划分
- im-gateway：统一入口与路由转发
- im-auth：鉴权与 token
- im-user：用户与好友关系
- im-group：群组与成员管理
- im-message：消息存储、会话、撤回/删除、已读
- im-file：文件与媒体上传
- im-server：WebSocket 实时推送与在线状态
- im-frontend：前端应用

## 6. 接口与路由概览

### 6.1 网关路由
详见 [application.yml](file:///c:/Users/10954/.openclaw/workspace/new-im-project/backend/gateway/src/main/resources/application.yml)
- `/api/auth/**` → im-auth
- `/api/user/**`、`/api/friend/**` → im-user
- `/api/group/**`、`/api/groups/**` → im-group
- `/api/message/**`、`/api/messages/**` → im-message
- `/api/file/**` → im-file
- `/api/im/**` → im-server
- `/websocket/**` → im-server（WebSocket）

### 6.2 关键接口清单（示例）
消息服务接口详见 [MessageController.java](file:///c:/Users/10954/.openclaw/workspace/new-im-project/backend/message-service/src/main/java/com/im/controller/MessageController.java)
- `GET /api/message/config`：获取前端配置（文本限制）
- `POST /api/message/send/private`：发送私聊
- `POST /api/message/send/group`：发送群聊
- `GET /api/message/conversations`：会话列表
- `GET /api/message/private/{friendId}`：私聊分页
- `GET /api/message/private/{friendId}/cursor`：私聊游标
- `GET /api/message/group/{groupId}`：群聊分页
- `GET /api/message/group/{groupId}/cursor`：群聊游标
- `POST /api/message/read/{conversationId}`：已读
- `POST /api/message/recall/{messageId}`：撤回
- `POST /api/message/delete/{messageId}`：删除

群组服务接口详见 [GroupController.java](file:///c:/Users/10954/.openclaw/workspace/new-im-project/backend/group-service/src/main/java/com/im/controller/GroupController.java)
- `GET /api/group/user/{userId}`：用户群组列表

IM 服务接口详见 [ImController.java](file:///c:/Users/10954/.openclaw/workspace/new-im-project/backend/im-server/src/main/java/com/im/controller/ImController.java)
- `POST /api/im/sendMessage`：发送消息入口（IM Core）

文件服务接口详见 [FileController.java](file:///c:/Users/10954/.openclaw/workspace/new-im-project/backend/file-service/src/main/java/com/im/controller/FileController.java)
- `POST /api/file/upload/**`：文件/图片/音频/视频上传

## 7. 数据与实体

### 7.1 用户
详见 [UserDTO.java](file:///c:/Users/10954/.openclaw/workspace/new-im-project/backend/common/src/main/java/com/im/dto/UserDTO.java)
- id、username、nickname、avatar、email、phone、status

### 7.2 消息
详见 [MessageDTO.java](file:///c:/Users/10954/.openclaw/workspace/new-im-project/backend/common/src/main/java/com/im/dto/MessageDTO.java)
- id、senderId、receiverId、groupId、messageType、content、mediaUrl、mediaSize、mediaName、thumbnailUrl、duration、locationInfo

### 7.3 会话
详见 [ConversationDTO.java](file:///c:/Users/10954/.openclaw/workspace/new-im-project/backend/common/src/main/java/com/im/dto/ConversationDTO.java)
- conversationId、conversationType、conversationName、lastMessage、lastMessageTime、unreadCount

## 8. 权限与安全
- JWT 鉴权，网关统一校验
- 内部服务调用使用内部密钥头部
- WebSocket 握手需校验 token
- 文件上传限制类型与大小
- 消息发送限流（分钟/小时/日）

## 9. 性能与可用性
- 单个接口响应 P95 < 300ms（本地环境基线）
- WebSocket 重连策略：断线后自动重连
- Kafka 消息投递与重试机制
- Redis 缓存用于会话与限流

## 10. 配置要求
消息长度配置详见 [message-service application.yml](file:///c:/Users/10954/.openclaw/workspace/new-im-project/backend/message-service/src/main/resources/application.yml)
- `IM_MESSAGE_TEXT_ENFORCE`：是否启用文本长度限制
- `IM_MESSAGE_TEXT_MAX_LENGTH`：最大长度

文件存储配置详见 [file-service application.yml](file:///c:/Users/10954/.openclaw/workspace/new-im-project/backend/file-service/src/main/resources/application.yml)
- `IM_COS_ENABLED` 与 COS 参数

IM 实时服务运维详见 [im-server-deploy.md](file:///c:/Users/10954/.openclaw/workspace/new-im-project/docs/im-server-deploy.md)

## 11. 部署与运行
使用 docker-compose 一键启动，详见 [docker-compose.yml](file:///c:/Users/10954/.openclaw/workspace/new-im-project/docker-compose.yml)
- 基础设施：MySQL、Redis、Kafka
- 业务服务：网关、鉴权、用户、群组、消息、文件、IM 实时、前端

## 12. 验收标准
- 注册登录、好友、群组、私聊、群聊、文件上传、已读、撤回、删除正常
- WebSocket 可稳定收发消息并自动重连
- 文本限制可通过配置开启/关闭
- 接口鉴权与权限控制有效
- 端到端测试通过
