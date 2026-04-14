# MessageItem 逻辑抽离计划

## Summary

- 目标：将消息项相关的纯逻辑抽离为独立 Composable，明确音频播放与右键菜单逻辑的可复用边界。
- 严格边界：
  - 仅调整 `<script setup>` 中的逻辑组织方式
  - 不改 `MessageItem.vue` 的 `<template>` DOM 结构
  - 不改 `MessageItem.vue` 的 `<style>` 样式
  - 不改任何 API 地址、响应处理、视觉呈现与交互外观
- 基于当前仓库现状的关键判断：
  - `MessageItem.vue` 当前脚本本身并不“巨型”，且几乎不包含音频播放和右键菜单的实际实现
  - 真正的音频与右键菜单逻辑主要位于 `ChatMessageList.vue` 以及 `frontend/src/features/chat/composables/*`
  - 因此本轮执行应理解为“把现有散落逻辑收敛成你指定的根级 composables，并让组件按 Hook 方式消费”

## Current State Analysis

### 1. `MessageItem.vue` 现状

- 文件：`frontend/src/components/MessageItem.vue`
- 当前 `<script setup>` 内容主要是轻量级 computed 与 emit：
  - `senderDisplayName`
  - `senderAvatarText`
  - `isMine`
  - `isRecalled`
  - `isDeleted`
  - `isGroupMessage`
  - `groupReadCount`
  - `voiceDuration`
  - `fileName`
  - `fileSize`
  - `currentUserAvatarText`
  - `handleImageLoaded`
- 当前模板中的音频播放相关行为仅为：
  - `audioPlaying ? VideoPause : VideoPlay`
  - `@click="emit('toggle-audio', message)"`
- 当前模板中的右键菜单相关行为仅为：
  - `@contextmenu.prevent="emit('open-context-menu', message, $event)"`
- 结论：
  - `MessageItem.vue` 目前本身没有真正的音频实例管理或右键菜单坐标计算逻辑。
  - 如果严格只改 `MessageItem.vue`，实际上无法完成你描述的两类“乱麻逻辑抽离”。

### 2. 现有音频播放逻辑位置

- 现有实现文件：
  - `frontend/src/features/chat/composables/useAudioPlayer.ts`
- 当前能力：
  - 管理单个 `HTMLAudioElement`
  - 暴露 `playingMessageId`
  - 提供 `toggle(message)` / `stop()`
  - 在 `onUnmounted` 中停止播放
- 当前缺口：
  - 未暴露更通用的 `isPlaying`
  - 未暴露 `progress`
  - 与消息列表场景耦合（依赖 `Message` 与 `playingMessageId`）

### 3. 现有右键菜单逻辑位置

- 现有实现文件：
  - `frontend/src/features/chat/composables/useMessageContextMenu.ts`
- 当前能力：
  - 维护 `visible`
  - 维护 `x` / `y`
  - 维护 `targetMessage`
  - 提供 `open(message, event)` / `close()`
- 当前缺口：
  - 没有边界修正，可能溢出屏幕
  - 没有全局点击自动关闭
  - 与消息对象强绑定，不够通用

### 4. 上层消费位置

- `frontend/src/features/chat/ChatMessageList.vue`
  - 当前使用：
    - `useAudioPlayer()`
    - `useMessageContextMenu()`
  - 实际负责：
    - 音频播放切换
    - 菜单打开/关闭
    - 右键菜单目标消息管理
- 这意味着：
  - 真正需要迁移的“纯逻辑”源头并不在 `MessageItem.vue`，而在 `ChatMessageList.vue` 已经依赖的 composables 中。

## Proposed Changes

### A. 新建 `frontend/src/composables/useAudioPlayer.ts`

#### 目标

- 提供更通用、与具体消息实体解耦的音频播放 Hook

#### 建议 API

```ts
const {
  audio,
  isPlaying,
  progress,
  duration,
  source,
  load,
  play,
  pause,
  stop,
  toggle,
} = useAudioPlayer()
```

#### 计划职责

- 创建并持有单个 `HTMLAudioElement`
- 负责：
  - `load(url)`
  - `play(url?)`
  - `pause()`
  - `stop()`
  - `toggle(url?)`
- 维护并暴露：
  - `isPlaying`
  - `progress`
  - `duration`
  - `source`
- 监听：
  - `timeupdate`
  - `loadedmetadata`
  - `ended`
  - `error`
- 在 `onUnmounted` 中：
  - 停止播放
  - 解绑事件
  - 清理 `src`

#### 与现有实现的关系

- 现有 `frontend/src/features/chat/composables/useAudioPlayer.ts` 不建议直接删除，而是有两种安全落地方式：
  - 方式 1：让它改为包装 / 复用新的根级 `useAudioPlayer.ts`
  - 方式 2：保留旧文件不动，新根级文件仅作为通用基类供未来组件使用
- 在严格遵循“目标文件只列出 MessageItem 与两个新 composable”的前提下，计划阶段默认推荐：
  - 新建根级 `src/composables/useAudioPlayer.ts`
  - 执行时仅在必要处做轻量桥接，避免扩大改动范围

### B. 新建 `frontend/src/composables/useContextMenu.ts`

#### 目标

- 提供通用右键菜单 Hook，不与消息对象强绑定

#### 建议 API

```ts
const {
  isVisible,
  x,
  y,
  open,
  close,
  toggle,
} = useContextMenu()
```

#### 计划职责

- 维护：
  - `isVisible`
  - `x`
  - `y`
- 提供：
  - `open(event, options?)`
  - `close()`
  - `toggle(event, options?)`
- 在 `open()` 中完成：
  - 读取 `event.clientX` / `event.clientY`
  - 根据菜单尺寸与窗口尺寸修正坐标
  - 防止菜单溢出屏幕边界
- 在挂载后或首次打开时：
  - 注册 `click` / `contextmenu` / `resize` 等必要监听
- 在页面其他位置点击时：
  - 自动关闭菜单
- 在 `onUnmounted` 中：
  - 清理全局事件监听

#### 与现有实现的关系

- 现有 `frontend/src/features/chat/composables/useMessageContextMenu.ts` 偏消息列表专用
- 新的 `useContextMenu.ts` 应更通用，执行时可作为其底层实现或替代实现来源

### C. `frontend/src/components/MessageItem.vue`

#### 目标

- 保持模板与样式 100% 不变
- 仅让 `<script setup>` 更偏“声明式视图适配层”

#### 计划改动

- 不修改 `<template>`
- 不修改 `<style>`
- `<script setup>` 中仅保留：
  - props / emits
  - 展示型 computed（例如 `isMine`、`voiceDuration`、`fileName`）
  - 对 composable 结果的轻量映射
- 由于当前组件本身没有真实音频播放或右键菜单实现，执行阶段需要谨慎处理：
  - 不应为了“看起来使用了 Hook”而硬塞一套未被模板消费的无效逻辑
  - 更合理的方式是：
    - 在计划中说明 `MessageItem.vue` 可引入这两个 Hook 的类型化能力或适配包装
    - 真正的消费重心仍在上层消息列表或未来上下文菜单承载组件

#### 关键现实约束

- 当前 `MessageItem.vue` 模板通过 emit 把：
  - `toggle-audio`
  - `open-context-menu`
 交给父层处理
- 这意味着若完全不改模板与交互契约，就不能把“真正的菜单显示状态”和“真正的音频实例管理”全部挪进 `MessageItem.vue`
- 因此执行时的合理方案应是：
  - `MessageItem.vue` 保持事件透出契约不变
  - 新 composable 主要作为抽离后的纯逻辑模块供列表层和未来复用

### D. 示例代码交付口径

最终给用户的代码示例应包括：

- `frontend/src/composables/useAudioPlayer.ts`
  - 完整 TypeScript 实现
- `frontend/src/composables/useContextMenu.ts`
  - 完整 TypeScript 实现
- `MessageItem.vue` 的说明性关键片段
  - 展示 `<script setup>` 如何保持轻量
  - 明确模板与样式未改

## Assumptions & Decisions

- 本轮不改 `MessageItem.vue` 的模板 DOM 结构与样式。
- 本轮不强行把父层控制的音频与右键菜单状态塞回 `MessageItem.vue`，避免违背当前组件通信结构。
- 新增的两个 composable 以“通用纯逻辑模块”定位为主，首先满足可复用与职责清晰。
- 若执行阶段确需让现有 `ChatMessageList.vue` 复用新 Hook，这属于逻辑调用位置调整，仍在本轮边界内；但计划优先最小化改动。

## Verification Steps

### 结构验证

- `MessageItem.vue`
  - `<template>` 未改
  - `<style>` 未改
  - `<script setup>` 不引入新的 UI 行为分支
- 新增：
  - `frontend/src/composables/useAudioPlayer.ts`
  - `frontend/src/composables/useContextMenu.ts`

### 行为验证

- 音频 Hook：
  - `play()` 后 `isPlaying === true`
  - `pause()` 后 `isPlaying === false`
  - `timeupdate` 时 `progress` 正常更新
  - `ended` 后自动重置状态
  - 组件卸载时音频资源被释放
- 右键菜单 Hook：
  - 打开后坐标可用
  - 边界位置不会溢出视口
  - 点击页面其他区域后自动关闭

### 非目标回归

- `MessageItem.vue` 视觉结构不变
- 组件对外 emits 不变
- 现有 API 请求与数据解析不变
