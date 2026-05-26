# MomentsPostCard 微信风格布局重构

**日期**: 2026-05-26
**状态**: 已确认
**目标**: 将单条朋友圈帖子卡片从"卡片式"重构为微信经典"左侧头像 + 右侧内容"扁平布局

## 概述

重构 `MomentsPostCard.vue` 的 template、SCSS 和部分 TS 逻辑，实现微信朋友圈级别的视觉还原。保持数据流和 API 交互不变。

## 整体结构

```
moments-post-card (无圆角、无阴影、纯白背景)
├── post-layout (display: flex; gap: 12px)
│   ├── post-avatar (40×40, flex-shrink: 0, border-radius: 4px)
│   └── post-main (flex: 1; min-width: 0)
│       ├── 昵称 (#576B95)
│       ├── 正文 (最多6行 + "全文"按钮)
│       ├── 图片网格 / 视频 / 链接卡片 (保持现有逻辑)
│       ├── 位置信息 (保持现有)
│       ├── post-meta (时间左 + 互动按钮右, space-between)
│       └── (底部分割线: border-bottom #F0F0F0)
└── post-social (点赞栏 + 评论区, 浅灰背景)
    ├── MomentsLikeBar
    └── MomentsComments
```

## 模板变更

### 移除

- 卡片级 `<div class="moments-post-card">` 上的任何视觉依赖（仅保留根容器）
- `post-header` 区域的头像 → 头像提升到 `post-layout` 左侧
- "更多"按钮（`el-dropdown`）— 删除入口移至详情页（后续处理）
- `post-actions` 区域的 `border-top` 分割线

### 新增

- `post-layout` Flex 容器包裹 `post-avatar` + `post-main`
- "全文"展开按钮（当文本超过 6 行时显示）
- `post-meta` 行（时间 + 互动按钮，`space-between`）
- `post-social` 容器（LikeBar + Comments，浅灰背景）

### 保持

- 图片网格（`media-grid`）逻辑和 grid class 计算
- 视频播放器
- 链接预览卡片（`post-link`）
- 位置信息（`post-location`）
- 图片查看器（`MomentsImageViewer`）
- 点赞/评论按钮的 store 交互逻辑

## SCSS 变更

### 移除样式

```scss
// 删除以下全部
.moments-post-card {
  background: var(--el-bg-color);
  border-radius: 12px;
  padding: 16px;
  margin-bottom: 12px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
}
.post-actions {
  border-top: 1px solid var(--el-border-color-lighter);
}
```

### 新增样式

```scss
.moments-post-card {
  background: var(--moments-bg);
}

.post-layout {
  display: flex;
  gap: 12px;
  padding: 0 20px;
}

.post-avatar {
  width: 40px;
  height: 40px;
  border-radius: 4px;
  flex-shrink: 0;
  object-fit: cover;
  cursor: pointer;
}

.post-main {
  flex: 1;
  min-width: 0;
  padding-bottom: 20px;
  margin-bottom: 20px;
  border-bottom: 1px solid #F0F0F0;
}

// 昵称 — 微信蓝
.post-nickname {
  font-size: 15px;
  font-weight: 600;
  color: #576B95;
  line-height: 1.4;
  margin-bottom: 4px;
  cursor: pointer;
  transition: opacity 0.15s ease;
  &:hover { opacity: 0.7; }
}

// 正文 — 黑色，支持6行截断
.post-content {
  font-size: 15px;
  line-height: 1.6;
  color: #111111;
  margin-bottom: 8px;
  white-space: pre-wrap;
  word-break: break-word;

  &.is-truncated {
    display: -webkit-box;
    -webkit-line-clamp: 6;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
}

// "全文"按钮
.post-expand {
  color: #576B95;
  font-size: 15px;
  cursor: pointer;
  margin-bottom: 8px;
  display: inline-block;
  &:hover { opacity: 0.7; }
}

// 时间 + 互动行
.post-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.post-time {
  font-size: 12px;
  color: #B0B0B0;
}

.post-actions {
  display: flex;
  gap: 20px;

  .action-btn {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    color: #B0B0B0;
    font-size: 14px;
    border: none;
    background: none;
    cursor: pointer;
    padding: 4px 0;
    transition: opacity 0.15s ease;
    &:hover { opacity: 0.7; }
    &.is-liked { color: #576B95; }
  }
  .action-count { font-size: 13px; }
}

// 点赞栏 + 评论区 — 浅灰背景
.post-social {
  margin-top: -12px;
  margin-bottom: 20px;
  margin-left: 52px;
  background: #F7F7F7;
  border-radius: 4px;
  padding: 6px 8px;
}
```

### 移动端适配

```scss
@media (max-width: 768px) {
  .post-layout {
    padding: 0 12px;
  }
  .post-avatar {
    width: 36px;
    height: 36px;
  }
  .post-main {
    padding-bottom: 16px;
    margin-bottom: 16px;
  }
  .post-nickname { font-size: 14px; }
  .post-content { font-size: 15px; }
  .post-social {
    margin-left: 48px;  // 36px头像 + 12px间距
  }
}
```

## TS 逻辑变更

### 移除

- `handleMoreAction` 函数
- `MoreFilled`、`Delete` 图标导入
- `ElMessageBox` 导入
- `el-dropdown` 相关模板

### 新增

```ts
const shouldTruncate = computed(() => {
  const content = props.post.post.content
  if (!content) return false
  // 中文字符约 33 字/行 × 6 行 ≈ 200 字符为截断阈值
  return content.length > 200
})
const isExpanded = ref(false)

function handleExpand() {
  isExpanded.value = true
}
```

### 保持

- 所有已有 store 交互（`useMomentsStore`, `useUserStore`）
- 图片网格计算逻辑（`gridClass`）
- 点赞/评论切换逻辑
- 图片查看器逻辑
- 时间格式化（`formattedTime`）
- 头像文字兜底（`avatarText`）

## 不在范围内

- 朋友圈详情页（"更多"按钮的删除入口迁移目标）
- MomentsLikeBar 或 MomentsComments 组件内部重构
- 链接预览卡片样式
- MomentsImageViewer
- 后端 API

## 验收标准

1. 帖子卡片无圆角、无外阴影、纯白背景
2. 左侧 40px 头像 + 右侧 flex:1 内容区
3. 昵称显示为 #576B95 蓝色，加粗，hover 变淡
4. 正文黑色 15px，line-height 1.6，超过 200 字符截断为 6 行 + 显示"全文"
5. 点击"全文"展开全部内容
6. 时间和互动按钮同行（space-between），无分割线
7. 右侧内容区底部仅一条 1px #F0F0F0 细线
8. 点赞栏和评论区浅灰背景（#F7F7F7），左侧对齐内容区
9. "更多"按钮已移除
10. 移动端头像 36px，margin-left 相应调整
