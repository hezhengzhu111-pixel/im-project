# P2 后台管理系统计划

> 本文档定义 P2 阶段的后台管理系统建设计划。

---

## 一、P2 总体目标

建设 IM 项目的后台管理系统，为运营、客服、管理员、审核人员提供：
- 用户管理
- 群聊管理
- 消息治理
- 文件治理
- 设备会话管理
- 系统监控
- 审计日志
- 配置管理
- 灰度管理
- 安全运营

---

## 二、P2 阶段划分

### 阶段 1：后台管理系统基线与权限模型（当前）
- 梳理现有 admin-console 结构
- 建立管理员身份模型
- 建立 RBAC 权限模型
- 建立审计日志模型
- 建立 Admin API 鉴权边界
- 建立后台前端基线
- 建立 P2 报告

### 阶段 2：用户管理
- 用户列表、详情、搜索
- 用户状态管理
- 封禁/解封
- 强制下线
- 用户设备查看

### 阶段 3：群聊管理
- 群列表、详情
- 成员管理
- 群状态管理
- 解散群

### 阶段 4：消息与内容治理
- 消息查询
- 撤回/屏蔽违规消息
- 文件下架
- 内容审计

### 阶段 5：设备、会话、通知与风控
- 在线设备管理
- 强制下线
- 登录记录
- 异常检测

### 阶段 6：系统监控、配置与灰度
- 系统 Dashboard
- 统计数据
- 配置管理
- 功能灰度

### 阶段 7：P2 总验收与收口
- P2 acceptance
- 后台 smoke
- Admin API integration tests
- RBAC 测试
- 审计日志测试
- 安全脱敏测试
- P0/P1 全回归
- P2 总报告

---

## 三、RBAC 权限模型

### 角色定义

| 角色 | 说明 | 权限范围 |
| --- | --- | --- |
| SUPER_ADMIN | 超级管理员 | 全部权限 |
| ADMIN | 管理员 | 除系统配置外的全部权限 |
| OPERATOR | 运营人员 | 内容治理、用户管理（只读） |
| AUDITOR | 审计员 | 只读访问 + 审计日志 |
| SUPPORT | 客服人员 | 用户基础信息（只读） |
| READ_ONLY | 只读用户 | 只读访问 |

### 权限点

| 权限 | 说明 |
| --- | --- |
| user:read | 查看用户列表和详情 |
| user:update | 更新用户信息 |
| user:ban | 封禁/解封用户 |
| user:force_logout | 强制用户下线 |
| group:read | 查看群组列表和详情 |
| group:update | 更新群组信息 |
| group:dissolve | 解散群组 |
| message:read | 查看消息 |
| message:recall | 撤回消息 |
| file:read | 查看文件 |
| file:takedown | 下架文件 |
| device:read | 查看设备 |
| device:force_logout | 强制设备下线 |
| audit:read | 查看审计日志 |
| config:read | 查看系统配置 |
| config:update | 更新系统配置 |
| system:read | 查看系统状态 |

---

## 四、Admin API 设计

### 路径前缀
所有 Admin API 使用 `/api/admin/` 前缀。

### 鉴权
- 使用 JWT token 鉴权
- 普通用户 token 不得访问 Admin API
- Admin token 不得直接冒充普通用户调用用户侧 API

### 审计日志
所有写操作必须记录审计日志，包含：
- adminId
- action
- targetType
- targetId
- reason
- ip
- userAgent
- createdAt

---

## 五、安全要求

### 数据脱敏
默认不展示：
- password hash
- token / refresh token
- WebSocket ticket
- E2EE private key / envelope 原文
- device secret
- mediaUrl / downloadUrl 原始完整 URL

### 权限控制
- 未登录返回 401
- 无权限返回 403
- 普通用户 token 访问 Admin API 返回 403
