# Flutter Web 页面 UI 修复与完善设计

## 背景

Flutter Web 应用的 5 个主要页面（聊天、联系人、群组、朋友圈、设置）在浏览器中运行时，所有 Material Icons 显示为破损占位符，部分页面布局存在异常。经排查，根本原因是 `pubspec.yaml` 中缺少 `uses-material-design: true` 配置。

## 问题分析

### 根本原因

Flutter Web 构建时，Material Icons 字体文件的打包由 `pubspec.yaml` 中 `flutter:` 段下的 `uses-material-design: true` 控制。当前项目中：

- `flutter/apps/web/pubspec.yaml` — 缺少该配置
- `flutter/packages/ui/pubspec.yaml` — 缺少该配置

缺少此配置时，Web 构建不会将 Material Icons 字体包含在产物中，导致浏览器中所有 `Icons.xxx` 渲染为空白方块/问号框。

### 受影响范围

项目中约 80+ 处使用了 `Icons.xxx`，覆盖所有页面：
- 聊天页：发送、录音、附件、搜索、返回、加密锁等图标
- 联系人页：搜索、添加好友、在线状态等图标
- 群组页：搜索、创建、群组列表等图标
- 朋友圈页：发布、评论、点赞等图标
- 设置页：导航项、开关、清除缓存、AI 助手等图标
- 导航栏：聊天、联系人、群组、朋友圈、设置 5 个 Tab 图标

### 次要问题

设置页面右侧辅助列在截图中显示内容重叠（"清理本地缓存"和"AI 助手"区域），需要在图标修复后验证布局。

## 设计方案

### 第一步：修复 Material Icons 字体引入（核心修复）

在以下两个 `pubspec.yaml` 文件的 `flutter:` 段下添加 `uses-material-design: true`：

**文件 1**: `flutter/apps/web/pubspec.yaml`
```yaml
flutter:
  generate: true
  uses-material-design: true  # 添加此行
```

**文件 2**: `flutter/packages/ui/pubspec.yaml`
```yaml
flutter:
  uses-material-design: true  # 添加此行
```

### 第二步：验证并修复设置页面布局

设置页面截图显示右侧辅助列内容可能重叠。需要检查 `settings_page.dart` 中桌面端三栏布局的宽度分配和滚动行为，确保：
- 左侧导航面板（216px）固定
- 主内容区自适应
- 右侧辅助列不与主内容重叠
- 各设置分区（账户、偏好、通知、隐私）间距正确

### 第三步：验证所有页面空状态显示

图标修复后，验证各页面空状态是否与 Vue 参考一致：
- 聊天页：左侧"暂无会话" + 右侧"选择一个会话开始聊天"
- 联系人页：好友列表为空时显示"暂无好友" + 好友请求 Tab
- 群组页：显示"暂无群组"
- 朋友圈页：封面 + "暂无动态" + 右侧个人信息面板

## 不涉及的范围

- 数据处理逻辑（Provider、API 调用、状态管理）
- 新增功能或页面
- 移动端布局适配
- E2EE 加密逻辑

## 验证方法

1. 运行 `flutter pub get` 确认依赖解析正常
2. 运行 `make dev` 构建 Web 版本
3. 在浏览器中逐一检查 5 个页面：
   - 所有图标正常显示（不再有破损占位符）
   - 设置页面布局无重叠
   - 各页面空状态文案和布局正确
   - 导航栏 5 个 Tab 图标正常
