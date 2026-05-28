# 网络状态手动回归步骤

## 前置条件

- Flutter Web 应用运行在 development 模式：`cd flutter/apps/web && flutter run -d chrome`
- 浏览器 DevTools 可用

## 测试步骤

### 1. 模拟断网

1. 打开 Chrome DevTools（F12）
2. 切换到 **Network** 标签
3. 勾选 **Offline** 复选框

### 2. 发送私聊消息

1. 在聊天界面选择一个会话
2. 发送一条文本消息

**预期结果：**
- 消息显示 **PENDING** 状态（通常带有时钟图标）
- 顶部 NetworkStatusBanner 显示红色"已断线"提示
- 消息不会消失，留在输入区域或显示为待发送

### 3. 恢复网络

1. DevTools → Network → 取消 **Offline** 勾选
2. 等待几秒

**预期结果：**
- NetworkStatusBanner 消失
- 消息从 PENDING 变为 SENT
- 如果消息发送失败，会显示重试按钮

### 4. 验证 limited 状态（可选）

1. DevTools → Network → 在 **Throttling** 下拉中选择 **Slow 3G**
2. 等待 1-2 分钟（等待 health check 超时）

**预期结果：**
- 顶部显示"连接受限"提示
- 新消息仍然可以输入，但会进入待发送队列
- 不会自动重试已有待发消息

### 5. 恢复正常网络

1. DevTools → Network → Throttling 选择 **No throttling**
2. 等待 health check 通过

**预期结果：**
- 所有待发消息自动重试并发送成功
- "连接受限"提示消失

## 自动化验证

运行单元测试确认核心逻辑：

```bash
cd flutter/apps/web
flutter test test/core/network/network_status_provider_test.dart
flutter test test/core/network/network_status_outbox_test.dart
```
