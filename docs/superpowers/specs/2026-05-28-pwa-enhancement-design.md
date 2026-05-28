# PWA 增强设计文档

## 概述

本文档描述为 Flutter Web 增加生产可用 PWA 基础能力的设计方案。采用增量改进策略，在现有实现基础上补充缺失部分并改进质量。

## 现有实现分析

### 已实现的功能

1. **manifest.json** - 完整配置
   - name: "IM Messenger"
   - short_name: "IM"
   - start_url: "/"
   - display: "standalone"
   - theme_color: "#1a1a2e"
   - background_color: "#16213e"
   - icons: 192x192 和 512x512

2. **service_worker.js** - 完整实现
   - Precache: index.html, main.dart.js, flutter.js 等
   - API 请求: NetworkFirst 策略
   - 图片请求: CacheFirst 策略
   - 静态资源: StaleWhileRevalidate 策略
   - 导航请求: NetworkFirst + 离线降级

3. **NetworkStatusProvider** - 网络状态监听
   - 监听 online/offline 事件
   - 定期检查服务器可达性（每分钟）
   - 提供 isOnlineProvider 便捷访问

4. **MessageOutbox** - 消息离线队列
   - 使用 idb_shim 的 IndexedDB 存储
   - 支持 enqueue、retry、failed 状态
   - 指数退避重试策略（最大 5 次）
   - 网络恢复自动重试

5. **ChatNotifierWithOutbox** - 集成 outbox
   - 发送失败自动入队
   - 监听 outbox 事件更新状态
   - 网络恢复自动触发重试

6. **NetworkStatusBanner** - UI 组件
   - 显示离线状态
   - 显示 pending/failed 消息数量
   - 提供重试按钮

### 缺失的部分

1. **图标文件** - manifest 引用的 icons/icon-192.png 和 icons/icon-512.png 不存在
2. **集成测试** - 现有测试只覆盖 OutboxMessage 数据模型，缺少集成测试
3. **验证文档** - 缺少浏览器验证步骤

## 设计方案

### 1. 图标生成

**方案**：使用在线工具生成占位图标

**步骤**：
1. 访问 https://favicon.io/ 或类似工具
2. 生成 192x192 和 512x512 的 PNG 图标
3. 下载并放到 `flutter/apps/web/web/icons/` 目录

**图标要求**：
- 格式: PNG
- 尺寸: 192x192 和 512x512
- 背景: 透明或与 theme_color (#1a1a2e) 匹配
- 内容: 简单的 IM 标志（如字母 M 或对话气泡）

### 2. 集成测试

**测试框架**：flutter_test + mockito

**测试范围**：核心路径测试（8-10 个测试用例）

**测试用例**：

#### 2.1 Outbox 入队测试
```dart
test('enqueue adds message to outbox', () async {
  // 准备
  final outbox = MessageOutbox(...);
  await outbox.initialize();
  
  // 执行
  final message = await outbox.enqueue(
    sessionKey: 'session-1',
    receiverId: 'user-2',
    content: 'Hello',
    clientMessageId: 'client-1',
  );
  
  // 验证
  expect(message.status, OutboxMessageStatus.pending);
  expect(await outbox.getPendingCount(), 1);
});
```

#### 2.2 重试成功测试
```dart
test('retry succeeds after network restore', () async {
  // 准备
  final outbox = MessageOutbox(
    messageApi: mockApi,
    isOnline: () => true,
  );
  await outbox.initialize();
  
  // 入队消息
  await outbox.enqueue(...);
  
  // Mock API 返回成功
  when(mockApi.sendPrivateMessage(any)).thenAnswer((_) async => serverMessage);
  
  // 触发重试
  outbox.onNetworkAvailable();
  
  // 等待异步操作
  await Future.delayed(Duration(seconds: 1));
  
  // 验证
  expect(await outbox.getPendingCount(), 0);
});
```

#### 2.3 重试失败测试
```dart
test('retry fails after max retries', () async {
  // 准备
  final outbox = MessageOutbox(
    messageApi: mockApi,
    isOnline: () => true,
  );
  await outbox.initialize();
  
  // Mock API 返回错误
  when(mockApi.sendPrivateMessage(any)).thenThrow(Exception('Network error'));
  
  // 入队消息
  await outbox.enqueue(...);
  
  // 多次重试
  for (int i = 0; i < 6; i++) {
    outbox.onNetworkAvailable();
    await Future.delayed(Duration(seconds: 1));
  }
  
  // 验证
  expect(await outbox.getFailedCount(), 1);
});
```

#### 2.4 网络切换测试
```dart
test('network restoration triggers retry', () async {
  // 准备
  final outbox = MessageOutbox(
    messageApi: mockApi,
    isOnline: () => false, // 初始离线
  );
  await outbox.initialize();
  
  // 入队消息
  await outbox.enqueue(...);
  
  // 验证消息未发送
  expect(await outbox.getPendingCount(), 1);
  
  // 恢复在线
  outbox.onNetworkAvailable();
  
  // 等待
  await Future.delayed(Duration(seconds: 1));
  
  // 验证消息已发送
  expect(await outbox.getPendingCount(), 0);
});
```

### 3. 代码审查和改进

**改进点**：

1. **service_worker.js**
   - 添加缓存版本管理
   - 优化 API 缓存策略
   - 添加离线页面降级

2. **MessageOutbox**
   - 改进错误处理
   - 添加批量操作优化
   - 添加清理过期消息功能

3. **NetworkStatusProvider**
   - 添加连接质量检测
   - 优化重试间隔
   - 添加事件去重

### 4. 验证文档

**格式**：图文验证指南

**内容**：
1. PWA 安装验证
2. Service Worker 注册验证
3. 离线功能验证
4. 消息发送验证
5. 网络恢复验证

## 实施计划

### 阶段 1：图标生成（1 小时）
1. 使用在线工具生成图标
2. 放到 web/icons/ 目录
3. 验证 manifest.json 引用正确

### 阶段 2：集成测试（3 小时）
1. 添加 mockito 依赖
2. 编写 MessageOutbox 集成测试
3. 编写 NetworkStatusProvider 测试
4. 运行测试并修复问题

### 阶段 3：代码改进（2 小时）
1. 审查并改进 service_worker.js
2. 优化 MessageOutbox 错误处理
3. 优化 NetworkStatusProvider

### 阶段 4：验证文档（1 小时）
1. 编写浏览器验证步骤
2. 截图关键界面
3. 整理验证文档

## 风险评估

1. **图标生成** - 低风险，在线工具稳定
2. **集成测试** - 中风险，需要 mock 外部依赖
3. **代码改进** - 低风险，增量修改
4. **验证文档** - 低风险，纯文档工作

## 成功标准

1. 图标文件存在且 manifest 引用正确
2. 集成测试覆盖核心路径
3. 现有功能无回归
4. 验证文档完整可用
