# Android E2E Validation Report

## 1. 执行时间与范围

- 执行日期：2026-05-13
- 执行目标：把 Android App 从“可进入认证入口”推进到“核心 IM 主链路可验证”
- 执行边界：不改后端业务逻辑、不改 Web 业务逻辑、不重写 store、不重写 WebSocket、不实现 E2EE

## 2. 已执行项

### 2.1 环境与服务探测

- `node -v`：`v24.14.1`
- `java -version`：`OpenJDK 21.0.10 LTS`
- Android SDK：`C:\Users\10954\AppData\Local\Android\Sdk`
- `adb devices`：检测到 `emulator-5554`
- `cd frontend && npm run mobile:reverse`：PASS
- `http://localhost:8082/health`：PASS，`{"service":"api-server-rs","status":"UP"}`
- `http://localhost:8083/health`：PASS，`{"status":"UP","service":"im-server",...}`
- `http://localhost:3000/`：PASS，返回 `200`

### 2.2 Android 运行面验证

- `cd frontend && npm run mobile:start`：PASS，Metro 成功启动
- 通过 `adb shell monkey -p com.immobile -c android.intent.category.LAUNCHER 1` 成功拉起模拟器内已安装的 `com.immobile`
- 通过 `adb exec-out uiautomator dump /dev/tty` 成功抓取 UI 层级
- 通过 `adb shell screencap` + `adb pull` 成功导出当前画面截图
- 通过 `node apps/mobile/scripts/collect-android-logs.cjs --serial emulator-5554 --minutes 15` 成功生成过滤后的 logcat 文件

### 2.3 自动校验与测试

- `cd frontend && npm run mobile:typecheck`：PASS
- `cd frontend && npm run mobile:test`：PASS，`2 suites / 32 tests`
- `cd frontend && npm run mobile:lint`：PASS
- 现有单测已提供以下链路证据：
  - 401 refresh 自动重试
  - token parse 恢复登录态
  - websocket 消息分发
  - 非当前会话通知 / 当前会话不通知
  - pending 失败保留、网络恢复重试、echo 合并
  - 已读参数语义与本地 unread 清零
  - FCM 未配置降级
  - E2EE 遮罩与禁止发送

## 3. 未执行项

- 登录成功 / 登录失败 / 真正退出登录
- App 重启后真实恢复登录态
- 真正的 token 过期后 refresh 与 cookie 联调
- 会话列表真实加载与排序可视验证
- Android <-> Web 私聊互发
- Android <-> Web 群聊互发
- 历史消息拉取
- 真实 WebSocket 消息端到端收发
- 断网发送 / 恢复重试 / 回前台重连的设备态实操
- 已读服务端清零与双端 unread 一致性
- 通知点击跳转

以上项都需要测试账号、测试好友/群组、以及真实 UI 交互，因此保留为手动联调步骤。

## 4. 失败项

### 4.1 `npm run mobile:android`

- 结果：FAIL
- 阶段：Android native build / installDebug
- 失败点：`react-native-worklets` C++/ninja 构建失败
- 当前影响：
  - 无法在本轮直接重新安装最新 debug 包
  - 只能复用模拟器里已经安装的旧包做 UI 与运行态取证

### 4.2 当前模拟器 UI 网络提示

- 结果：FAIL / 待定位
- 现象：当前 UI dump 停留在 `Register` 页面，并显示 `Network unavailable. Changes will retry when online.`
- 当前影响：
  - 尚不能证明 App 已与本机后端完成真实认证链路打通
  - 需要在修复 Android 安装阻塞后，复测 Metro、后端地址和模拟器网络可达性

## 5. 失败日志

### 5.1 `mobile:android` 构建失败摘要

```text
BUILD FAILED
Caused by: com.android.ide.common.process.ProcessException:
ninja: Entering directory `...react-native-worklets\android\.cxx\Debug\...\arm64-v8a`
C++ build system [build] failed while executing ninja ... worklets
ninja: fatal: GetOverlappedResult: ...
```

### 5.2 运行期日志摘要

```text
E/unknown:ReconnectingWebSocket: Error occurred, shutting down websocket connection: Websocket exception
W/unknown:ReconnectingWebSocket: Couldn't connect to "ws://10.0.2.2:8081/message?...app=com.immobile..."
```

说明：

- 上述 `ws://10.0.2.2:8081/message` 属于 React Native DevSupport / 调试连接重连日志，不是 IM 后端 WebSocket 主业务地址。
- 当前未看到 `com.immobile` 进程级 `FATAL EXCEPTION`。

## 6. 截图路径或 logcat 摘要

- UI 截图：
  - `frontend/apps/mobile/logs/android-ui-20260513-1815.png`
- logcat 文件：
  - `frontend/apps/mobile/logs/android-logcat-20260513-181259.txt`
- logcat 收集摘要：
  - `collect-android-logs.cjs` 成功输出 `1080` 条过滤日志
  - 摘要计数：`fatal=10`、`error=92`、`warning=188`
- UI dump 关键信息：
  - 当前可见页面标题为 `Register`
  - 页面出现文案 `Network unavailable. Changes will retry when online.`
  - 表单中可见 `Username`、`Nickname`、`Email`、`Phone`、`Password`
  - 存在 `Back to login` 按钮，说明认证导航仍可回到登录入口
- logcat 摘要：
  - 成功拉起 `com.immobile/.MainActivity`
  - 未发现当前会话中的 `FATAL EXCEPTION`
  - 可见 React Native DevSupport WebSocket 重连告警

## 7. 需要后端配合项

- 提供稳定的 Android/Web 双端联调测试账号，至少 `userA`、`userB`
- 提供至少一个双方已在群内的测试群组
- 提供可复现的 refresh token 过期/失效场景
- 协助确认 Android 进入会话后的服务端 unread/read-cursor 变化
- 若后续要验证离线推送，需要补全 `PUSH_BACKEND_CONTRACT.md` 中的 push-device 后端接口

## 8. 下一步修复建议

1. 优先修复 Windows 下 `react-native-worklets` native build / ninja 阻塞，恢复 `npm run mobile:android` 的可用性。
2. 修复后立即复跑：
   - `npm run mobile:reverse`
   - `npm run mobile:android`
   - 登录 -> 会话列表 -> 私聊 -> 群聊 -> 已读 -> 通知
3. 用固定测试账号做一轮 Android + Web 主链路冒烟：
   - 登录
   - 私聊双向收发
   - 群聊双向收发
   - 历史消息
   - 已读同步
4. 在每轮联调后执行：
   - `node apps/mobile/scripts/collect-android-logs.cjs --serial emulator-5554 --minutes 15`
5. 如果 `Network unavailable` 仍存在，优先检查：
   - 模拟器是否能访问 `10.0.2.2:8082`
   - Metro/`adb reverse` 是否仍有效
   - App 当前实际加载的 bundle 是否为最新
   - `networkStatus` 与 HTTP 请求日志是否一致
