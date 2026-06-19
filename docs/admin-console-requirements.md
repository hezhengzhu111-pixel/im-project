# 本地云端运维管理后台需求文档

## 1. 文档信息

| 项目 | 内容 |
|---|---|
| 文档名称 | 本地云端运维管理后台需求文档 |
| 所属项目 | im-project |
| 文档类型 | PRD / 需求说明 |
| 目标版本 | V1.0 MVP |
| 技术基座 | RuoYi-Vue / RuoYi-Vue3-TypeScript |
| 部署方式 | 本地部署，不部署到云端 |
| 主要目标 | 基于成熟 RBAC 后台框架，快速构建 IM 项目的本地运维管理控制台 |

---

## 2. 背景与目标

当前 IM 项目的主业务服务部署在云端，但云端机器内存较小，需要尽量减少云端常驻进程。后台管理系统不计划部署到云端，而是在管理员本地电脑运行，通过安全连接访问云端服务、数据库、中间件和日志。

本后台不是普通运营后台，也不是 RuoYi 默认意义上的系统监控后台，而是一个面向 IM 项目的本地云端运维管理控制台。

核心目标：

1. 快速获得成熟的后台登录、RBAC、菜单权限、按钮权限和操作日志能力。
2. 不从 0 搭建后台基础设施，降低开发时间。
3. 不在云端新增后台管理服务，避免占用云端内存。
4. 对接云端 IM 主业务系统，实现用户、群组、文件、IM 节点、在线用户、服务状态、中间件状态、生产日志等管理和查看能力。
5. 危险写操作必须走云端 Rust 主业务服务的管理接口，避免直接修改数据库导致缓存、在线路由、E2EE、文件元数据等状态不一致。

---

## 3. 总体定位

### 3.1 RuoYi 的定位

RuoYi 只作为后台基础框架使用，主要保留：

- 管理员登录
- RBAC 权限模型
- 菜单管理
- 角色管理
- 按钮权限
- 操作日志
- 登录日志
- 基础布局与后台管理 UI

RuoYi 默认的在线用户、服务监控、缓存监控、连接池监控等模块不作为最终功能直接使用。

原因：RuoYi 默认监控的是本地 RuoYi 后台本身，而本项目需要查看的是云端 IM 系统，包括云端 api-server、im-server、MySQL、Redis、磁盘、内存、CPU、生产日志、IM 在线用户和 IM Server 节点。

### 3.2 后台系统的真实定位

本系统定位为：

> 基于 RuoYi 权限框架的本地云端运维管理控制台。

后台分为三类能力：

1. **RuoYi 基础能力**：管理员、角色、菜单、权限、日志。
2. **IM 业务管理能力**：用户、群组、文件、存储统计。
3. **CloudOps 云端运维能力**：云端服务状态、中间件状态、生产日志、IM Server 节点、在线用户。

---

## 4. 技术选型

### 4.1 后端

建议采用：

- RuoYi-Vue Spring Boot 3 分支
- Spring Boot 3
- Spring Security
- JWT
- MyBatis / MyBatis Plus
- Redis 客户端
- SSH 客户端，建议 sshj
- 本地 SQLite 或 MySQL，用于保存后台配置和本地审计数据
- 云端业务 MySQL，只读或有限权限访问
- 云端业务 Redis，只读或有限权限访问

### 4.2 前端

建议采用：

- RuoYi-Vue3-TypeScript
- Vue 3
- TypeScript
- Vite
- Element Plus
- Pinia
- Vue Router 4

### 4.3 部署方式

后台系统只在本地部署：

```text
管理员本地电脑
  └── RuoYi 本地后台服务
        ├── 本地浏览器访问 127.0.0.1
        ├── 通过 SSH Tunnel / VPN 访问云端 MySQL
        ├── 通过 SSH Tunnel / VPN 访问云端 Redis
        ├── 通过 HTTPS 访问云端 api-server / im-server
        └── 通过 SSH 查看云端日志和机器状态
```

云端不新增后台管理服务。

---

## 5. 总体架构

```text
管理员浏览器
    |
    | http://127.0.0.1:本地端口
    v
本地 RuoYi 管理后台
    |
    |-- 本地后台库
    |     ├── 管理员账号
    |     ├── 角色
    |     ├── 菜单
    |     ├── 权限
    |     ├── 本地连接配置
    |     └── 本地操作日志
    |
    |-- 云端业务 MySQL
    |     ├── 用户数据
    |     ├── 好友数据
    |     ├── 群组数据
    |     ├── 群成员数据
    |     ├── 文件元数据
    |     └── AI / E2EE / Push 相关数据，可后续扩展
    |
    |-- 云端 Redis
    |     ├── IM Server 节点注册信息
    |     ├── 用户在线路由
    |     ├── token / ticket / cache
    |     └── Redis Stream 状态
    |
    |-- 云端 Rust api-server
    |     ├── 高危写操作
    |     ├── 用户禁用 / 解禁
    |     ├── 强制下线
    |     ├── 解散群
    |     └── 文件删除
    |
    |-- 云端 im-server
    |     ├── health / ready
    |     ├── online-status
    |     └── offline
    |
    └── 云端 SSH
          ├── 生产日志
          ├── systemd / docker 状态
          ├── CPU / 内存 / 磁盘
          └── 端口检查
```

---

## 6. 功能范围

### 6.1 V1.0 MVP 范围

V1.0 需要实现以下模块：

1. 管理员登录 + RBAC + 操作日志
2. 用户列表 / 用户详情 / 禁用 / 解禁 / 强制下线
3. 群组列表 / 群详情 / 成员列表 / 解散群
4. 文件列表 / 文件删除 / 存储统计
5. IM Server 节点状态 / 在线用户查询
6. 生产日志查看
7. 云端服务状态查看
8. 云端中间件状态查看
9. 云端连接配置

### 6.2 暂不纳入 V1.0 的功能

以下功能暂不进入第一版：

- 消息内容治理
- 朋友圈 / 动态审核
- AI Key 管理
- RAG 文档管理
- E2EE 设备管理
- Push 设备管理
- 多租户
- 自动告警
- Prometheus / Grafana / ELK 集成
- 移动端后台

---

## 7. 模块需求

## 7.1 管理员登录与权限模块

### 7.1.1 功能说明

基于 RuoYi 原有能力，实现本地后台管理员登录、角色权限、菜单权限、按钮权限和操作日志。

### 7.1.2 保留能力

- 管理员账号管理
- 角色管理
- 菜单管理
- 权限标识
- 登录日志
- 操作日志
- JWT 登录态
- 权限注解
- 按钮级权限

### 7.1.3 管理员角色建议

| 角色 | 权限范围 |
|---|---|
| 超级管理员 | 全部权限，包括连接配置、危险操作、权限管理 |
| 运维管理员 | 服务状态、中间件状态、生产日志、IM 节点、在线用户 |
| 运营管理员 | 用户、群组、文件查询和部分处理能力 |
| 只读观察员 | 只能查看，不允许执行危险操作 |

### 7.1.4 权限标识建议

```text
im:user:list
im:user:detail
im:user:disable
im:user:enable
im:user:forceOffline

im:group:list
im:group:detail
im:group:members
im:group:dismiss

im:file:list
im:file:delete
im:file:storage

cloud:service:status
cloud:middleware:status
cloud:logs:view
cloud:logs:tail
cloud:ssh:config

im:node:list
im:online:query
```

### 7.1.5 安全要求

- 管理员密码必须加密存储。
- 超级管理员初始化后必须强制修改默认密码。
- 登录失败需要记录日志。
- 可配置登录失败次数限制。
- 本地后台仅监听 127.0.0.1，默认不对局域网开放。

---

## 7.2 操作日志模块

### 7.2.1 功能说明

记录所有后台操作，尤其是危险写操作。

### 7.2.2 需要记录的操作

- 登录 / 退出
- 查看用户详情
- 禁用用户
- 解禁用户
- 强制下线
- 查看群详情
- 解散群
- 删除文件
- 查看生产日志
- 修改云端连接配置
- 测试云端连接
- 查看敏感字段

### 7.2.3 字段要求

| 字段 | 说明 |
|---|---|
| id | 日志 ID |
| operator_id | 操作管理员 ID |
| operator_name | 操作管理员用户名 |
| module | 模块 |
| action | 动作 |
| target_type | 操作对象类型 |
| target_id | 操作对象 ID |
| request_params | 请求参数，敏感字段脱敏 |
| before_snapshot | 操作前快照，可选 |
| after_snapshot | 操作后快照，可选 |
| result | 成功 / 失败 |
| error_message | 失败原因 |
| client_ip | 本地请求 IP |
| created_at | 操作时间 |
| reason | 操作原因，高危操作必填 |

### 7.2.4 高危操作要求

以下操作必须二次确认，并填写操作原因：

- 禁用用户
- 解禁用户
- 强制下线
- 解散群
- 删除文件
- 修改云端连接配置
- 查看生产日志

---

## 7.3 云端连接配置模块

### 7.3.1 功能说明

用于配置本地后台访问云端资源的连接信息。

### 7.3.2 配置内容

| 配置项 | 说明 |
|---|---|
| 环境名称 | dev / test / prod |
| api-server URL | 云端 Rust api-server 地址 |
| im-server URL | 云端 im-server 地址，可配置多个 |
| MySQL 连接信息 | host、port、database、username、password |
| Redis 连接信息 | host、port、db、username、password |
| SSH 连接信息 | host、port、username、privateKey/password |
| 日志模式 | systemd / docker / file |
| 服务名映射 | api-server、im-server、spring-ai 等 |

### 7.3.3 安全要求

- 密码、私钥、token 必须加密存储。
- 前端展示时默认脱敏。
- 查看明文需要二次确认并记录操作日志。
- 生产环境连接配置只有超级管理员可修改。
- 支持连接测试，但错误信息不得泄露完整密码或私钥。

---

## 7.4 用户管理模块

### 7.4.1 功能说明

管理云端 IM 用户数据，支持列表、搜索、详情、禁用、解禁、强制下线。

### 7.4.2 用户列表

筛选条件：

- 用户 ID
- 用户名
- 昵称
- 手机号
- 邮箱
- 状态
- 创建时间
- 最近登录时间
- 是否在线

列表字段：

| 字段 | 说明 |
|---|---|
| 用户 ID | IM 用户 ID |
| 用户名 | username |
| 昵称 | nickname |
| 手机号 | 脱敏展示 |
| 邮箱 | 脱敏展示 |
| 状态 | 正常 / 禁用 / 注销 |
| 最近登录时间 | last_login_time |
| 创建时间 | created_time |
| 在线状态 | 在线 / 离线 / 未知 |
| 操作 | 详情、禁用、解禁、强制下线 |

### 7.4.3 用户详情

详情内容：

- 基本信息
- 账号状态
- 头像
- 手机号 / 邮箱，默认脱敏
- 性别 / 生日 / 签名 / 地区
- 创建时间
- 最近登录时间
- 好友数量
- 加入群数量
- 文件数量
- 在线状态
- 所在 IM Server 节点
- 路由过期时间

### 7.4.4 禁用用户

要求：

- 必须二次确认。
- 必须填写原因。
- 必须记录操作日志。
- 不允许直接 update 业务数据库。
- 必须调用云端 Rust api-server 管理接口。

建议接口：

```http
POST /api/admin/users/{userId}/disable
```

### 7.4.5 解禁用户

要求同禁用用户。

建议接口：

```http
POST /api/admin/users/{userId}/enable
```

### 7.4.6 强制下线

要求：

- 查询用户在线路由。
- 找到用户所在 IM Server。
- 调用云端 Rust api-server 或 im-server internal offline 接口。
- 清理 token / ticket / route / session 等状态应由云端 Rust 业务逻辑处理。

建议接口：

```http
POST /api/admin/users/{userId}/force-offline
```

---

## 7.5 群组管理模块

### 7.5.1 功能说明

管理云端 IM 群组数据，支持群组列表、群详情、成员列表、解散群。

### 7.5.2 群组列表

筛选条件：

- 群 ID
- 群名称
- 群主 ID
- 群状态
- 创建时间
- 成员数量范围

列表字段：

| 字段 | 说明 |
|---|---|
| 群 ID | group_id |
| 群名称 | name |
| 群头像 | avatar |
| 群主 ID | owner_id |
| 成员数量 | member_count |
| 最大成员数 | max_members |
| 群状态 | 正常 / 解散 |
| 创建时间 | created_time |
| 操作 | 详情、成员、解散 |

### 7.5.3 群详情

详情内容：

- 群基础信息
- 群公告
- 群描述
- 群主信息
- 成员数量
- 创建时间
- 群状态
- 群加密状态，可后续扩展

### 7.5.4 成员列表

筛选条件：

- 用户 ID
- 用户名
- 昵称
- 角色
- 状态
- 加入时间

成员字段：

| 字段 | 说明 |
|---|---|
| 用户 ID | member_id |
| 用户名 | username |
| 昵称 | nickname |
| 角色 | 群主 / 管理员 / 普通成员 |
| 状态 | 正常 / 已退出 / 被移除 |
| 加入时间 | joined_time |

### 7.5.5 解散群

要求：

- 必须二次确认。
- 必须填写原因。
- 必须记录操作日志。
- 不允许本地后台直接 update 群表。
- 必须调用云端 Rust api-server 管理接口。
- 云端接口需要处理群状态、群成员状态、缓存、E2EE sender key 等副作用。

建议接口：

```http
POST /api/admin/groups/{groupId}/dismiss
```

---

## 7.6 文件管理模块

### 7.6.1 功能说明

查看和管理云端文件，支持文件列表、文件详情、文件删除、存储统计。

### 7.6.2 文件列表

筛选条件：

- 文件 ID
- 上传用户 ID
- 文件类型
- 文件名
- 文件大小范围
- 创建时间
- 是否存在物理文件

列表字段：

| 字段 | 说明 |
|---|---|
| 文件 ID | file_id |
| 文件名 | filename |
| 文件类型 | image / file / audio / video / avatar / knowledge |
| 文件大小 | size |
| 上传用户 | user_id |
| URL / path | 脱敏或相对路径 |
| 创建时间 | created_time |
| 状态 | 正常 / 已删除 / 物理文件缺失 |
| 操作 | 详情、删除 |

### 7.6.3 存储统计

统计内容：

- 总文件数
- 总存储大小
- 图片数量与大小
- 视频数量与大小
- 音频数量与大小
- 普通文件数量与大小
- 头像数量与大小
- 知识库文件数量与大小
- 最近 7 天上传趋势
- 最近 30 天上传趋势
- 大文件排行
- 孤儿文件数量，可选

### 7.6.4 文件删除

要求：

- 必须二次确认。
- 必须填写原因。
- 必须记录操作日志。
- 不允许只删数据库记录。
- 必须调用云端 Rust api-server 的文件删除逻辑。
- 删除逻辑应同时处理 metadata 和物理文件。

建议接口：

```http
POST /api/admin/files/{fileId}/delete
```

---

## 7.7 IM Server 节点状态模块

### 7.7.1 功能说明

查看云端 IM Server 节点注册状态和会话负载。

### 7.7.2 数据来源

- 云端 Redis route registry
- im-server /health
- im-server /ready

### 7.7.3 页面字段

| 字段 | 说明 |
|---|---|
| server_id | 节点 ID |
| internal_http_url | 内部 HTTP 地址 |
| internal_ws_url | 内部 WebSocket 地址 |
| session_count | 当前会话数 |
| updated_at | 最近更新时间 |
| expires_at | 过期时间 |
| health | UP / DOWN |
| ready | READY / NOT_READY |
| 是否过期 | 根据 expires_at 判断 |

### 7.7.4 功能点

- 节点列表
- 节点详情
- 节点 health 检测
- 节点 ready 检测
- session_count 排序
- 过期节点标记
- 手动刷新

---

## 7.8 IM 在线用户查询模块

### 7.8.1 功能说明

查询 IM 用户是否在线、所在节点、路由过期时间，并支持强制下线。

### 7.8.2 查询方式

支持输入：

- 用户 ID
- 用户名
- 手机号
- 邮箱

### 7.8.3 数据来源

- 云端业务 MySQL 查询用户基础信息
- 云端 Redis 查询用户路由
- im-server /api/im/online-status 二次确认

### 7.8.4 页面字段

| 字段 | 说明 |
|---|---|
| 用户 ID | user_id |
| 用户名 | username |
| 昵称 | nickname |
| 在线状态 | 在线 / 离线 / 未知 |
| server_id | 所在 IM Server |
| internal_http_url | 节点 HTTP 地址 |
| route_expires_at | 路由过期时间 |
| session_count | 会话数 |
| 操作 | 强制下线 |

### 7.8.5 强制下线

同用户管理模块的强制下线逻辑。

---

## 7.9 云端服务状态模块

### 7.9.1 功能说明

查看云端业务服务健康状态。

### 7.9.2 服务范围

第一版至少支持：

- api-server
- im-server
- spring-ai，可选

### 7.9.3 检测内容

| 检测项 | 说明 |
|---|---|
| health | 服务是否存活 |
| ready | 是否可接收流量 |
| 响应耗时 | HTTP 请求耗时 |
| HTTP 状态码 | 200 / 500 / timeout |
| 最近错误 | 最近一次失败原因 |
| 最近检测时间 | checked_at |

### 7.9.4 页面能力

- 服务列表
- 单服务详情
- 手动刷新
- 自动刷新，可配置
- 状态颜色标识
- 失败原因展示

---

## 7.10 云端中间件状态模块

### 7.10.1 功能说明

查看云端 MySQL、Redis、文件存储和机器资源状态。

### 7.10.2 MySQL 状态

检测内容：

- SELECT 1 连通性
- 当前连接数
- 最大连接数
- 数据库大小
- 表大小排行
- 慢查询开关状态
- processlist，可选

### 7.10.3 Redis 状态

检测内容：

- PING
- used_memory
- connected_clients
- total_commands_processed
- keyspace
- route registry key 数量
- 用户在线 route key 数量
- stream 长度，可选

### 7.10.4 服务器资源状态

通过 SSH 执行命令获取：

- CPU 负载
- 内存使用
- 磁盘使用
- uptime
- 端口状态
- systemd / docker 进程状态

### 7.10.5 安全要求

- SSH 命令必须白名单化。
- 禁止前端传入任意 Shell 命令直接执行。
- 所有查看生产机器状态的操作记录日志。

---

## 7.11 生产日志查看模块

### 7.11.1 功能说明

通过本地后台查看云端服务生产日志。

### 7.11.2 支持日志源

- systemd journalctl
- docker logs
- 普通日志文件 tail

### 7.11.3 支持服务

- api-server
- im-server
- spring-ai，可选
- MySQL，可选
- Redis，可选

### 7.11.4 功能点

- 查看最近 100 / 300 / 500 / 1000 行
- 按服务筛选
- 按日志级别筛选，ERROR / WARN / INFO / DEBUG
- 关键词搜索
- 实时 tail，可后续实现
- 下载日志，可后续实现

### 7.11.5 安全要求

- 只允许执行预定义日志命令。
- 日志中敏感信息需要前端或后端脱敏展示。
- 查看生产日志需要权限控制。
- 查看日志必须记录操作日志。

---

## 8. 数据访问原则

### 8.1 查询类操作

以下操作允许本地后台直连云端 MySQL / Redis 查询：

- 用户列表
- 用户详情
- 群组列表
- 群详情
- 成员列表
- 文件列表
- 存储统计
- IM Server 节点状态
- 在线用户路由
- MySQL / Redis 状态

### 8.2 写入类操作

以下操作不允许本地后台直接修改云端业务数据库：

- 禁用用户
- 解禁用户
- 强制下线
- 解散群
- 删除文件

这些操作必须调用云端 Rust api-server 的管理接口，由云端主业务逻辑处理数据库、Redis、缓存、在线路由、文件、E2EE 等副作用。

### 8.3 原则总结

```text
查询可以直连数据库和 Redis。
危险写操作必须调用云端 Rust 管理接口。
本地后台不复制主业务状态变更逻辑。
```

---

## 9. 云端 Rust 管理接口需求

为了支持危险写操作，云端 api-server 需要新增极小管理接口。

建议接口：

```http
POST /api/admin/users/{userId}/disable
POST /api/admin/users/{userId}/enable
POST /api/admin/users/{userId}/force-offline
POST /api/admin/groups/{groupId}/dismiss
POST /api/admin/files/{fileId}/delete
GET  /api/admin/im/nodes
GET  /api/admin/im/users/{userId}/route
```

### 9.1 安全要求

- 不对公网普通用户开放。
- 只允许 SSH Tunnel / 内网 / 白名单访问。
- 使用 internal signature 或专用 admin token。
- 每个接口都必须记录云端审计日志。
- 所有请求必须带操作人、操作原因、request_id。

---

## 10. 菜单设计

建议菜单结构：

```text
系统管理
├── 后台管理员
├── 角色管理
├── 菜单管理
├── 权限管理
├── 操作日志
└── 登录日志

IM 业务管理
├── 用户管理
├── 群组管理
├── 文件管理
└── 存储统计

云端运维
├── 服务状态
├── 中间件状态
├── IM Server 节点
├── IM 在线用户
├── 生产日志
└── 云端连接配置
```

---

## 11. 非功能需求

### 11.1 性能要求

- 用户列表分页查询默认每页 20 条，最大 100 条。
- 群组列表分页查询默认每页 20 条，最大 100 条。
- 文件列表分页查询默认每页 20 条，最大 100 条。
- 服务状态刷新默认不小于 5 秒。
- 日志查询默认最多返回 1000 行。
- Redis SCAN 操作必须分页，禁止一次性 KEYS 全量扫描。

### 11.2 安全要求

- 本地后台默认只监听 127.0.0.1。
- 云端 MySQL / Redis 不允许裸露公网。
- 推荐通过 SSH Tunnel 或 VPN 访问云端中间件。
- 所有敏感字段脱敏展示。
- 所有危险操作二次确认。
- 所有危险操作必须填写原因。
- 所有危险操作记录操作日志。
- SSH 命令必须白名单化。

### 11.3 可靠性要求

- 云端服务不可用时，后台需要显示明确错误原因。
- 单个模块异常不能影响其他模块打开。
- 云端连接失败时，需要支持重新测试连接。
- 日志查看超时需要可取消。

### 11.4 可维护性要求

- RuoYi 原生模块与 IM 自定义模块分包管理。
- 自定义模块命名建议统一使用 im-admin 和 cloud-ops。
- 禁止在 RuoYi 原生系统模块中混写大量 IM 业务逻辑。
- 云端连接配置需要抽象为 Environment Profile。

---

## 12. 建议项目结构

```text
admin-console/
├── backend/
│   ├── ruoyi-admin/
│   ├── ruoyi-common/
│   ├── ruoyi-framework/
│   ├── ruoyi-system/
│   ├── im-admin/
│   │   ├── user/
│   │   ├── group/
│   │   ├── file/
│   │   └── online/
│   └── cloud-ops/
│       ├── service/
│       ├── middleware/
│       ├── logs/
│       ├── ssh/
│       └── config/
│
└── frontend/
    ├── src/
    │   ├── views/system/
    │   ├── views/im/user/
    │   ├── views/im/group/
    │   ├── views/im/file/
    │   ├── views/cloud/service/
    │   ├── views/cloud/middleware/
    │   ├── views/cloud/logs/
    │   └── views/cloud/config/
    └── package.json
```

---

## 13. 开发优先级

### 第一阶段：后台基础和连接能力

1. 引入 RuoYi-Vue3-TypeScript 与 Spring Boot 3 后端。
2. 保留登录、RBAC、菜单、角色、操作日志。
3. 删除或隐藏 RuoYi 默认在线用户、服务监控、缓存监控、连接池监控。
4. 新增云端连接配置。
5. 支持测试 MySQL、Redis、api-server、im-server、SSH 连接。

### 第二阶段：只读 IM 管理能力

1. 用户列表。
2. 用户详情。
3. 群组列表。
4. 群详情。
5. 群成员列表。
6. 文件列表。
7. 存储统计。

### 第三阶段：云端运维能力

1. 服务状态。
2. 中间件状态。
3. IM Server 节点状态。
4. IM 在线用户查询。
5. 生产日志查看。

### 第四阶段：危险写操作

1. 用户禁用。
2. 用户解禁。
3. 强制下线。
4. 解散群。
5. 删除文件。
6. 接入云端 Rust 管理接口。
7. 完善审计日志和二次确认。

---

## 14. 验收标准

### 14.1 基础后台

- 管理员可以登录。
- 不同角色看到不同菜单。
- 按钮权限生效。
- 操作日志正常记录。
- 登录日志正常记录。

### 14.2 IM 用户管理

- 可以分页查询用户。
- 可以按用户 ID、用户名、手机号、邮箱搜索。
- 可以查看用户详情。
- 可以查看用户在线状态。
- 禁用、解禁、强制下线必须二次确认并记录日志。

### 14.3 群组管理

- 可以分页查询群组。
- 可以查看群详情。
- 可以查看群成员。
- 解散群必须二次确认并记录日志。

### 14.4 文件管理

- 可以分页查询文件。
- 可以查看文件详情。
- 可以查看存储统计。
- 删除文件必须二次确认并记录日志。

### 14.5 云端运维

- 可以查看 api-server health / ready。
- 可以查看 im-server health / ready。
- 可以查看云端 MySQL 连通性和基础状态。
- 可以查看云端 Redis 连通性和基础状态。
- 可以查看 IM Server 节点列表。
- 可以查询指定用户在线状态。
- 可以查看云端生产日志最近 N 行。

---

## 15. 风险与约束

### 15.1 风险

1. 如果本地后台直接修改业务数据库，可能导致 Redis、IM 在线路由、缓存、文件状态不一致。
2. 如果云端 MySQL / Redis 暴露公网，会带来严重安全风险。
3. 如果 SSH 命令不做白名单，可能引入远程命令执行风险。
4. 如果生产日志不脱敏，可能泄露 token、手机号、邮箱、API Key 等敏感信息。
5. 如果 RuoYi 原生模块不裁剪，后台会显得臃肿。

### 15.2 约束

1. 后台不部署到云端。
2. 云端不新增常驻后台管理服务。
3. V1.0 以本地运维和只读查询为主。
4. 高危写操作必须依赖云端 Rust 管理接口。
5. RuoYi 默认监控模块不直接复用。

---

## 16. 最终结论

本项目后台不从 0 搭建，也不使用 RuoYi 默认监控作为最终能力，而是采用：

```text
RuoYi-Vue = RBAC / 登录 / 菜单 / 操作日志基础框架
IM Admin = 自定义 IM 用户、群组、文件管理模块
CloudOps = 自定义云端服务、日志、中间件、节点、在线用户运维模块
```

最终目标是用最小开发成本建立一个本地部署、云端轻量、权限完整、可审计、可运维的 IM 管理控制台。
