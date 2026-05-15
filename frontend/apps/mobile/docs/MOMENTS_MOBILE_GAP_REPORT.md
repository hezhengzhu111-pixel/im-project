# 朋友圈移动端差异清单与占位补齐报告

> 任务编号: XM-08
> 生成日期: 2026-05-15
> 对比范围: Web 端 (Vue 3 + Pinia + Element Plus) vs 移动端 (React Native + Zustand)

---

## 一、Feed 展示能力差异

| 能力项 | Web 端 | 移动端 | 差异等级 |
|--------|--------|--------|----------|
| 文字内容展示 | 完整展示，支持换行 | 完整展示，支持换行 | 已实现 |
| 图片网格展示 | 1-9 张自适应网格 (1/2/3/4/6 列) | 响应式网格 (1/2/3/4 张 + 溢出计数) | 已补齐 |
| 视频播放器 | HTML5 video 标签 + controls | **未实现**，media type=1 过滤 | **高** |
| 用户头像展示 | el-avatar + 网络图片 | 首字母占位符 | 中 |
| 用户昵称展示 | 完整展示 | 完整展示 | 已实现 |
| 发布时间格式化 | formatTime 相对时间 | formatRelativeTime 相对时间 | 已补齐 |
| 位置信息展示 | icon + 文字 | 文字展示 | 已补齐 |
| 链接卡片预览 | linkCover 图片 + linkTitle | linkTitle 文字卡片（无封面图） | 低 |
| 骨架屏加载 | el-skeleton 5 行动画 | LoadingState ActivityIndicator | 已实现 |
| 空状态展示 | el-empty 组件 | EmptyState 组件 | 已实现 |
| 错误态展示 | ElMessage 错误提示 | ErrorState 组件 + 重试按钮 | 已实现 |
| 无限滚动加载 | scroll 事件触发 loadFeed | FlatList onEndReached + onEndReachedThreshold=0.3 | 已实现 |
| 底部"没有更多了" | hasMore 为 false 时展示 | "No more moments" 文字 | 已实现 |
| 点赞按钮交互 | 图标 + 计数 + 高亮状态 | 文本按钮 + liked 高亮 + 计数 | 已实现 |
| 评论按钮交互 | 图标 + 计数 | 文本 + 计数 | 已实现 |
| 点赞用户列表 | MomentsLikeBar 显示点赞人昵称 | likeCount 简单计数展示 | 已补齐 |
| 删除菜单 | Dropdown（仅本人可见） | 详情页按钮 | 低 |

---

## 二、发布动态能力差异

| 能力项 | Web 端 | 移动端 | 差异等级 |
|--------|--------|--------|----------|
| 文字输入 | textarea maxlength=1000 + 字数统计 | TextField multiline | 已实现 |
| 多图上传 | 最多 9 张，媒体预览网格 | 最多 9 张，预览网格 + 删除按钮 | 已补齐 |
| 单图上传 | el-upload | mediaService.pickImage | 已实现 |
| 视频上传 | 支持 image/video 类型区分 | "Coming soon" 占位 | **高** |
| 可见性设置 | 公开/好友可见/仅自己 选择器 | "Coming soon" 占位 | 中 |
| 位置信息输入 | 文本输入 | "Coming soon" 占位 | 低 |
| 链接 URL 输入 | 文本输入 | **缺失** | 低 |
| 上传进度反馈 | 进度条 | Alert 提示 | 低 |
| 发布后自动刷新 | loadFeed(true) | loadFeed(true) | 已实现 |
| 图片预览删除 | 缩略图 + 删除按钮 | 缩略图 + × 按钮 | 已补齐 |

---

## 三、图片上传能力差异

| 能力项 | Web 端 | 移动端 | 差异等级 |
|--------|--------|--------|----------|
| 单图选择 | el-upload | mediaService.pickImage | 已实现 |
| 多图选择 | multiple 属性 | 循环 pickImage（最多 9 次） | 已补齐 |
| 图片压缩 | 浏览器原生 | **未实现** | 中 |
| 上传进度 | 进度条 | Alert 提示 | 低 |
| 图片预览 | 缩略图网格 + 删除 | 缩略图网格 + × 删除 | 已补齐 |

---

## 四、点赞 / 取消点赞差异

| 能力项 | Web 端 | 移动端 | 差异等级 |
|--------|--------|--------|----------|
| 点赞 API 调用 | momentsService.likePost | momentsService.likePost | 已实现 |
| 取消点赞 API | momentsService.unlikePost | momentsService.unlikePost | 已实现 |
| 乐观更新 | store toggleLike | store toggleLike | 已实现 |
| 点赞列表展示 | MomentsLikeBar 组件显示昵称列表 | 详情页显示点赞人昵称列表 | 已补齐 |
| 点赞用户头像 | Avatar 组件 | 纯文字昵称 | 低 |
| Feed 页点赞计数 | likeCount 显示 | likeCount 显示 | 已实现 |

---

## 五、评论 / 删除评论差异

| 能力项 | Web 端 | 移动端 | 差异等级 |
|--------|--------|--------|----------|
| 添加评论 API | momentsService.createComment | momentsService.createComment | 已实现 |
| 删除评论 API | momentsService.deleteComment | momentsService.deleteComment | 已实现 |
| 评论列表展示 | MomentsComments 完整列表 | 详情页评论列表 + 头像首字母 | 已补齐 |
| 回复评论 | parentId 支持 + replyTo UI | parentId 支持 + replyTo 横幅 + 取消 | 已补齐 |
| 评论者头像 | Avatar 组件 | 首字母占位符 | 低 |
| 评论时间格式化 | formatTime | formatRelativeTime | 已补齐 |
| 删除确认弹窗 | ElMessageBox.confirm | Alert.alert 确认 | 已补齐 |
| 删除按钮入口 | 评论右键菜单 | 评论下方 Delete 按钮 | 已补齐 |

---

## 六、删除动态差异

| 能力项 | Web 端 | 移动端 | 差异等级 |
|--------|--------|--------|----------|
| 删除 API 调用 | momentsService.deletePost | momentsService.deletePost | 已实现 |
| 删除确认弹窗 | ElMessageBox.confirm | Alert.alert (Cancel/Delete) | 已实现 |
| 删除后状态更新 | removePost | deletePost + filter | 已实现 |
| 删除菜单入口 | Dropdown（仅本人） | 详情页 PrimaryButton | 低 |

---

## 七、用户朋友圈主页差异

| 能力项 | Web 端 | 移动端 | 差异等级 |
|--------|--------|--------|----------|
| 用户资料头像 | el-avatar 64px + 网络图片 | 首字母占位符 (56px) | 中 |
| 用户昵称展示 | 从第一篇动态提取 | 从第一篇动态提取 | 已实现 |
| 动态计数 | 显示 | 显示 | 已实现 |
| 好友/自己标识 | Badge 组件 | "Profile coming soon" 占位 | 中 |
| 添加好友按钮 | 跳转联系人页 | **缺失** | 低 |
| 动态列表 | 完整 PostCard 渲染 | 文字 + 媒体网格 + 计数 | 已补齐 |
| 发布时间 | formatTime | formatRelativeTime | 已补齐 |
| 无限滚动 | scroll 事件 | FlatList onEndReached | 已实现 |
| 空状态 | el-empty | EmptyState 组件 | 已实现 |
| 骨架屏 | el-skeleton | LoadingState 组件 | 已实现 |
| 错误态 | ElMessage | ErrorState + 重试 | 已实现 |

---

## 八、通知能力差异

| 能力项 | Web 端 | 移动端 | 差异等级 |
|--------|--------|--------|----------|
| 通知列表 API | getNotifications | getNotifications | 已实现 |
| 标记已读 API | markNotificationsRead | markNotificationsRead（UI 已接入） | 已补齐 |
| 通知列表页面 | MomentsNotifications 完整页面 | 完整通知列表 | 已补齐 |
| 未读标记 | 红点 + 背景高亮 | 红点 + 背景高亮 | 已补齐 |
| 全部已读按钮 | 顶部链接 | "Mark all read" 按钮 | 已补齐 |
| 通知类型文案 | 赞了/评论了 动态 | liked/commented 文案 | 已补齐 |
| 通知时间显示 | formatTime | formatRelativeTime | 已补齐 |
| 通知点击跳转 | 跳转到对应动态 | 点击跳转 MomentDetailScreen | 已补齐 |
| 未读计数 badge | 侧边栏 badge | **未实现** | 中 |
| "coming soon" 提示 | 无 | **已移除** | 已补齐 |

---

## 九、当前移动端缺失项优先级汇总

### 高优先级（核心体验缺失）

| # | 缺失项 | 状态 |
|---|--------|------|
| 1 | 视频播放器 | 未实现，media type=1 被过滤，需后续任务实现 |
| 2 | 视频上传 | "Coming soon" 占位，需后续任务实现 |

### 中优先级（体验优化）

| # | 缺失项 | 状态 |
|---|--------|------|
| 3 | 真实头像展示 | 当前均为首字母占位符，需接入 avatar URL |
| 4 | 图片全屏查看器 | Web 端有 MomentsImageViewer，移动端未实现 |
| 5 | 未读计数 badge | store 未实现 unreadCount，Tab 无角标 |
| 6 | 可见性设置 UI | "Coming soon" 占位 |
| 7 | 数据规范化 | 移动端直接使用 response.data，未用 shared-normalizers |
| 8 | 好友/自己标识 | UserMomentsScreen 仅有 "Profile coming soon" 占位 |

### 低优先级（锦上添花）

| # | 缺失项 | 状态 |
|---|--------|------|
| 9 | 链接封面图展示 | 仅显示 linkTitle 文字 |
| 10 | 位置信息输入 | "Coming soon" 占位 |
| 11 | 添加好友按钮 | UserMomentsScreen 未实现 |
| 12 | 图片压缩 | 未实现 |
| 13 | 字数统计 | CreateMomentScreen 未显示字数 |

---

## 十、本次轻量补齐汇总

### 新增/修改文件清单

| 文件 | 改动类型 | 说明 |
|------|----------|------|
| `screens/moments/MomentsFeedScreen.tsx` | 修改 | 添加 MediaGrid 图片网格、formatRelativeTime 时间格式化、likeBar 点赞计数、metaRow 时间+位置行 |
| `screens/moments/CreateMomentScreen.tsx` | 修改 | 多图选择（最多 9 张）、图片预览网格 + 删除按钮、移除 "Multiple photos" 的 Coming soon |
| `screens/moments/MomentDetailScreen.tsx` | 修改 | 评论回复（replyTo 横幅）、评论删除按钮、评论时间、点赞用户列表、媒体网格、formatRelativeTime |
| `screens/moments/UserMomentsScreen.tsx` | 修改 | 添加 formatRelativeTime、媒体网格、发布时间显示 |
| `screens/moments/MomentsNotificationsScreen.tsx` | 修改 | 移除 "coming soon" 横幅、添加 "Mark all read" 按钮、时间显示、点击跳转动态详情 |
| `stores/momentsStore.ts` | 修改 | MomentPost.post 接口添加 createdAt 字段（轻量修复） |
| `docs/MOMENTS_MOBILE_GAP_REPORT.md` | 更新 | 本差异报告 |

### 未修改的核心链路确认

- 未修改 `stores/messageStore.ts`
- 未修改 `stores/chatStore.ts`
- 未修改 `stores/websocketStore.ts`
- 未修改 `services/chat/**`
- 未修改 `frontend/apps/web/**`
- 未修改 `backend/**`
- 未修改 `package.json` 和锁文件
