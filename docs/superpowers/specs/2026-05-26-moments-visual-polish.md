# 朋友圈视觉效果精细化

**日期**: 2026-05-26
**状态**: 已确认
**目标**: 在已有微信风格布局基础上，增加 CSS 三角形尖角、头像立体阴影、图片亮度滤镜、桌面画廊约束、统一过渡曲线

## 概述

对 `MomentsContainer.vue`、`MomentsUserProfile.vue`、`MomentsPostCard.vue` 进行视觉精细化增强。不改动业务逻辑，仅增强 CSS 表现层。

## 变更文件

| 文件 | 操作 | 说明 |
|------|------|------|
| `MomentsContainer.vue` | 修改 | 新增 page-wrapper 包裹层，桌面画廊约束 |
| `MomentsUserProfile.vue` | 修改 | 同 Container，新增 page-wrapper |
| `MomentsPostCard.vue` | 修改 | 头像阴影、尖角、图片滤镜、过渡曲线 |
| `tokens.scss` | 检查 | 确认所有变量已存在，无新增需求 |

## MomentsContainer.vue 变更

### Template

新增最外层 `<div class="moments-page-wrapper">`：

```html
<template>
  <div class="moments-page-wrapper">
    <div class="moments-container">
      <!-- 原有内容不变 -->
    </div>
  </div>
</template>
```

### SCSS 新增

```scss
.moments-page-wrapper {
  width: 100%;
  height: 100vh;
  display: flex;
  justify-content: center;
  background-color: #F0F0F0;
}

.moments-container {
  width: 100%;
  max-width: 600px;
  height: 100%;
  background: var(--moments-bg);
  border-left: 1px solid #ECECEC;
  border-right: 1px solid #ECECEC;
  box-shadow: 0 0 20px rgba(0, 0, 0, 0.08);
  position: relative;
  overflow: hidden;
}

@media (max-width: 768px) {
  .moments-page-wrapper {
    background-color: var(--moments-bg);
  }
  .moments-container {
    max-width: 100%;
    border-left: none;
    border-right: none;
    box-shadow: none;
  }
}
```

即 `height: 100%` 改为 `height: 100vh`，并增加上述 gallery 样式。原 SCSS 中的 `.moments-topbar`、`.moments-scroll` 等保持不变。

## MomentsUserProfile.vue 变更

同 `MomentsContainer`，在最外层添加 `.moments-page-wrapper`，`.moments-user-profile` 增加同样的 gallery 约束。

## MomentsPostCard.vue 变更

### 头像 (`.post-avatar`)

```scss
.post-avatar {
  width: 40px;
  height: 40px;
  border-radius: 4px;
  flex-shrink: 0;
  object-fit: cover;
  cursor: pointer;
  border: 2px solid #FFFFFF;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
}
```

### 图片 Hover (`.media-image`)

```scss
.media-image {
  width: 100%;
  height: 100%;
  transition: filter 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  &:hover {
    filter: brightness(0.95);
  }
}
```

### 社交区三角形尖角 (`.post-social`)

```scss
.post-social {
  margin-top: -12px;
  margin-bottom: 20px;
  margin-left: 52px;
  background: #F7F7F7;
  border-radius: 4px;
  padding: 6px 10px;
  position: relative;

  &::before {
    content: '';
    position: absolute;
    top: -6px;
    left: 12px;
    width: 0;
    height: 0;
    border-left: 6px solid transparent;
    border-right: 6px solid transparent;
    border-bottom: 6px solid #F7F7F7;
  }
}
```

### 全局过渡曲线统一

所有 `transition` 从 `ease` 改为 `cubic-bezier(0.4, 0, 0.2, 1)`（Material Design 标准缓出曲线），涉及：

| 选择器 | 属性 | 持续 |
|--------|------|------|
| `.post-nickname` | opacity | 0.15s |
| `.post-expand` | opacity | 0.15s |
| `.media-image` | filter | 0.2s |
| `.post-link` | background | 0.2s |
| `.action-btn` | opacity | 0.15s |

### 移动端头像

```scss
@media (max-width: 768px) {
  .post-avatar {
    border: 1.5px solid #FFFFFF;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.15);
  }
}
```

移动端头像阴影略减（36px 头像配更轻阴影），白边框从 2px 缩到 1.5px。

## tokens.scss 检查

经检查，所有需要的变量已存在：
- `--moments-bg` (#FFFFFF) ✅
- `--moments-cover-height` ✅
- `--moments-avatar-size` ✅
- `--surface-sunken` (#EDEDED) ✅
- `--surface-secondary` (#F7F7F7) ✅
- `--text-primary` (#111111) ✅
- `--text-tertiary` (#B0B0B0) ✅

硬编码品牌色（设计固定值，不适合抽象为变量）：
- `#576B95` — 微信蓝（昵称、全文、已点赞）
- `#F0F0F0` — 分割线
- `#F7F7F7` — 社交区背景
- `#B0B0B0` — 辅助文字灰
- `#ECECEC` — 画廊边框
- `#FFFFFF` — 头像边框

无新增变量需求。

## 不在范围内

- 业务逻辑变更
- 后端 API
- MomentsCover 或 MomentsFeed 组件
- LikeBar / Comments 内部重构

## 验收标准

1. 桌面端（>768px）朋友圈容器 max-width 600px 居中，左右 1px #ECECEC 边框，外部 #F0F0F0 浅灰背景
2. 移动端（≤768px）全屏纯白，无边框无阴影
3. 头像有 2px 白色边框 + `box-shadow: 0 1px 3px rgba(0,0,0,0.2)`
4. 社交区左上角有 CSS 三角形尖角（`left: 12px`，指向评论容器上方）
5. 图片 Hover 使用 `filter: brightness(0.95)`，非 scale 变形
6. 所有过渡使用 `cubic-bezier(0.4, 0, 0.2, 1)`
7. MomentsUserProfile 同样享有画廊约束
