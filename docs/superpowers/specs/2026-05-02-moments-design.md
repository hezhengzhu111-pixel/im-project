# 朋友圈（Moments）功能设计文档

## 概述

为 NewIM 即时通讯平台新增微信朋友圈风格的社交动态功能。用户可以发布文字、图片、视频、链接类型的动态，浏览好友信息流，进行点赞和评论互动。

## 功能范围

- 发布动态（文字 + 图片 + 视频 + 链接）
- 浏览好友信息流（卡片式布局）
- 点赞 / 取消点赞
- 评论 / 回复评论 / 删除评论
- 查看某用户的朋友圈主页
- 互动通知（谁赞了/评论了我的动态）
- 删除自己的动态
- 每条动态独立设置可见性（公开/好友/仅自己）

## 架构方案

采用 **MySQL 持久化 + Redis Feed 缓存** 的混合方案：

- MySQL 存储所有动态、评论、点赞数据
- Redis Sorted Set 缓存用户 Feed（TTL 7 天）
- 发布时异步 fan-out 到好友的 Feed 缓存
- 读取优先走 Redis，缓存未命中回源 MySQL
- WebSocket 实时推送新动态和互动通知

## 数据模型

### moments_post — 动态表

| 字段 | 类型 | 说明 |
|---|---|---|
| id | BIGINT (Snowflake) | 主键 |
| user_id | BIGINT | 发布者 ID |
| content | TEXT | 文字内容 |
| visibility | TINYINT | 0=公开, 1=好友可见, 2=仅自己可见 |
| link_url | VARCHAR(512) | 链接 URL（可选，非空时表示分享链接） |
| link_title | VARCHAR(256) | 链接标题 |
| link_cover | VARCHAR(512) | 链接封面图 URL |
| location | VARCHAR(255) | 位置信息（可选） |
| status | TINYINT | 0=正常, 1=已删除 |
| created_at | DATETIME | 发布时间 |
| updated_at | DATETIME | 更新时间 |

索引：`idx_user_id_created` (user_id, created_at DESC), `idx_created` (created_at DESC)

### moments_media — 媒体资源表

| 字段 | 类型 | 说明 |
|---|---|---|
| id | BIGINT (Snowflake) | 主键 |
| post_id | BIGINT | 关联动态 ID |
| type | TINYINT | 0=图片, 1=视频 |
| url | VARCHAR(512) | 文件 URL |
| sort_order | TINYINT | 排序序号 |

索引：`idx_post_id` (post_id)

### moments_like — 点赞表

| 字段 | 类型 | 说明 |
|---|---|---|
| id | BIGINT | 主键 |
| post_id | BIGINT | 关联动态 ID |
| user_id | BIGINT | 点赞者 ID |
| created_at | DATETIME | 点赞时间 |

唯一约束：`UNIQUE(post_id, user_id)` 防止重复点赞
索引：`idx_post_id` (post_id), `idx_user_id` (user_id)

### moments_comment — 评论表

| 字段 | 类型 | 说明 |
|---|---|---|
| id | BIGINT (Snowflake) | 主键 |
| post_id | BIGINT | 关联动态 ID |
| user_id | BIGINT | 评论者 ID |
| parent_id | BIGINT | 回复的评论 ID（NULL=顶级评论） |
| content | TEXT | 评论内容 |
| created_at | DATETIME | 评论时间 |

索引：`idx_post_id_created` (post_id, created_at), `idx_parent_id` (parent_id)

## Redis 缓存策略

### Feed 缓存

- Key: `moments:feed:{user_id}`
- 类型: Sorted Set（score = Snowflake ID，天然按时间排序）
- TTL: 7 天（与现有消息热存储 TTL 一致）
- 写入时机: 好友发布动态时 push；自己发布时 push 到所有好友

### 动态详情缓存

- Key: `moments:post:{post_id}`
- 类型: Hash
- TTL: 24 小时
- 写入时机: 首次被访问时缓存

### 点赞集合缓存

- Key: `moments:likes:{post_id}`
- 类型: Set
- TTL: 24 小时

### 互动通知

- Key: `moments:notify:{user_id}`
- 类型: Sorted Set（score = 时间戳）
- TTL: 30 天

## API 接口

### 动态 CRUD

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/moments` | 发布动态（multipart/form-data，含文字/媒体/链接字段） |
| GET | `/api/moments/feed` | 获取信息流（cursor-based 分页） |
| GET | `/api/moments/{id}` | 获取单条动态详情 |
| DELETE | `/api/moments/{id}` | 删除自己的动态 |
| GET | `/api/moments/user/{user_id}` | 获取某用户的动态列表 |

### 互动

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/moments/{id}/like` | 点赞 |
| DELETE | `/api/moments/{id}/like` | 取消点赞 |
| GET | `/api/moments/{id}/likes` | 获取点赞列表 |
| POST | `/api/moments/{id}/comments` | 发表评论 |
| DELETE | `/api/moments/comments/{id}` | 删除自己的评论 |
| GET | `/api/moments/{id}/comments` | 获取评论列表 |

### 通知

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/moments/notifications` | 获取互动通知 |
| PUT | `/api/moments/notifications/read` | 标记通知已读 |

所有接口复用现有 JWT 认证机制。Feed 接口使用 cursor-based 分页（与现有消息历史一致）。

## 前端架构

### 组件结构

```
frontend/src/features/moments/
├── MomentsContainer.vue          # 顶层容器
├── MomentsFeed.vue               # 信息流列表（卡片布局，无限滚动）
├── MomentsPostCard.vue           # 单条动态卡片（文字/图片/视频/链接卡片）
├── MomentsComposer.vue           # 发布动态面板
├── MomentsComments.vue           # 评论区组件
├── MomentsLikeBar.vue            # 点赞栏
├── MomentsNotifications.vue      # 互动通知列表
├── MomentsUserProfile.vue        # 某用户的朋友圈主页
├── composables/
│   ├── useMomentsFeed.ts         # 信息流加载、分页、刷新
│   ├── useMomentsInteractions.ts # 点赞/评论操作
│   └── useMomentsComposer.ts     # 发布逻辑
└── dialogs/
    ├── MomentsImageViewer.vue    # 图片全屏查看器
    └── MomentsVisibilityPicker.vue # 可见性选择器
```

### 状态管理

新增 Pinia Store: `stores/moments.ts`
- 动态列表（Feed）
- 点赞状态缓存
- 评论缓存
- 通知计数

### 入口

侧边栏新增第 4 个 Tab（聊天/通讯录/群组/朋友圈），点击后右侧显示朋友圈信息流。

### 样式

复用现有 glassmorphism 设计系统 + CSS 自定义属性（深色模式兼容）。

## 核心流程

### 发布动态

1. 用户填写内容 → 调用 `POST /api/moments`（multipart/form-data：content, visibility, location, link_url, link_title, link_cover, media_files[]）
2. `api-server-rs` 写入 MySQL（moments_post + moments_media）
3. 异步 fan-out：通过 Redis Streams 将动态 ID 推送到好友的 `moments:feed:{friend_id}`
4. WebSocket 向在线好友推送 `MOMENT_NEW` 事件

### Feed 读取

1. 用户打开朋友圈 → `GET /api/moments/feed?cursor=xxx&limit=20`
2. 查 Redis `moments:feed:{user_id}` 获取动态 ID 列表
3. 批量获取动态详情（优先 Redis 缓存，未命中查 MySQL）
4. 组装返回（发布者信息、点赞数、评论预览）

### 实时推送

- 新动态: WebSocket 新增 `MOMENT_NEW` 消息类型
- 点赞通知: WebSocket 新增 `MOMENT_LIKE` 消息类型
- 评论通知: WebSocket 新增 `MOMENT_COMMENT` 消息类型
- 复用现有 WebSocket 连接和重连机制

## 可见性规则

| 动态可见性 | 谁能看到 | 评论可见性 |
|---|---|---|
| 公开 (0) | 所有用户 | 所有能看到动态的人 |
| 好友可见 (1) | 互为好友 | 所有能看到动态的人 |
| 仅自己 (2) | 仅发布者 | 不适用 |

评论对所有能看到该动态的用户可见（非微信模式）。

## 错误处理与边界情况

- 发布/删除/评论操作校验：只能操作自己的内容
- Feed 可见性过滤：根据 visibility + 好友关系过滤
- 删除动态：级联删除点赞、评论，清理 Redis 缓存
- 好友解除关系：不清除对方 Feed 缓存（TTL 自然过期）
- 大量好友 fan-out：异步批量写入 Redis（复用 background_publisher）
- 空 Feed：返回空列表 + 引导文案

## 与现有功能集成

- 用户资料页（Profile.vue）新增"TA 的朋友圈"入口
- 聊天中可分享朋友圈动态链接
- 通知中心整合朋友圈互动通知

## 实现约束

- Snowflake ID 复用现有 `im-rs-common::ids` 模块
- 文件上传复用现有 `file_api.rs` 的 5 种上传类型
- WebSocket 消息类型扩展复用现有 `ImEventType` 枚举
- 前端组件遵循现有 Vue 3 + TypeScript + Element Plus 规范
- 数据库迁移使用增量 SQL 脚本（参照现有 `20260417_upgrade_*.sql` 模式）
