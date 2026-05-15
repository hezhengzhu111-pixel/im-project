# Android Release Gate Report

## GPT-01 Android Login Smoke Update (2026-05-15)

- Result: Android debug emulator login chain is now PASS for real login, persisted session, restoreSession, and entry into the main tab UI.
- Current config: `APP_CONFIG.API_BASE_URL=http://10.0.2.2:8082/api`; `APP_CONFIG.WS_BASE_URL=ws://10.0.2.2`; `IM_MOBILE_APP_ENV=dev-emulator`.
- Root cause: Android native reachability reported offline because system internet probes to Google/gstatic timed out, while the local API on `10.0.2.2:8082` was reachable. NetInfo now checks the configured API origin `/health` instead of relying on native public-internet reachability.
- Auth fixes: business-code 401 responses now share the same one-shot refresh-and-retry path as HTTP 401; stale Authorization headers are removed before retry; restoreSession restores mirrored cookies before parsing the access token; refreshed sessions no longer rehydrate a stale access token.
- Evidence:
  - Backend health: `http://localhost:8082/health` returned `{"service":"api-server-rs","status":"UP"}`.
  - Android debug build/install/launch: `npm run mobile:android -- --deviceId emulator-5554` exited 0.
  - Real login request completed and entered the Chats tab; screenshot: `frontend/apps/mobile/logs/gpt-01-after-login.png`.
  - Force-stop/relaunch restored the session and returned to the Chats tab; screenshot: `frontend/apps/mobile/logs/gpt-01-after-restart-final.png`.
  - Profile after restore displayed current user `GPT01 Smoke`; screenshot: `frontend/apps/mobile/logs/gpt-01-profile-after-restore-2.png`.
- Verification:
  - `npm run mobile:test`: PASS, 6 suites / 59 tests.
  - `npm run mobile:lint`: PASS.
  - `npm run mobile:typecheck`: FAIL on pre-existing out-of-scope error `src/screens/moments/MomentDetailScreen.tsx(46,26): Cannot find name 'useCallback'`.
- Remaining release gate blockers: release signing / release APK or AAB validation and full IM E2E flows remain outside GPT-01 and are still not release-ready evidence.

## 结论摘要

- 结论：**NO-GO，不建议当前进入 Android 内测发布阶段**
- 范围：`frontend/apps/mobile`
- 平台范围：**仅 Android**。iOS 工程存在但尚未 release-ready，不在本报告评估范围内。
- 执行日期：2026-05-13
- 执行环境：
  - Node.js / npm workspace：可用
  - Java：`JAVA_HOME=C:\Program Files\Microsoft\jdk-21.0.10.7-hotspot`
  - Android SDK：通过 `frontend/apps/mobile/android/local.properties` 发现 `sdk.dir=C:\Users\10954\AppData\Local\Android\Sdk`
  - 模拟器：`emulator-5554`

## 1. 构建状态

- `cd frontend && npm install`：**PASS**
  - 结果：依赖已是最新，无新增锁文件变更
  - 备注：`npm audit` 提示 `7 moderate severity vulnerabilities`，当前未阻塞本次 Android 门禁
- `cd frontend && npm run mobile:clean`：**PASS**
- `cd frontend && npm run mobile:android`：**PASS**
  - 结果：成功构建、安装并拉起 `app-debug.apk`
  - 证据：Gradle 输出 `Installed on 1 device`，并启动 `com.immobile/.MainActivity`
- `cd frontend/apps/mobile/android && .\gradlew.bat assembleRelease`：**FAIL**
  - 原因：缺少 `IM_MOBILE_RELEASE_STORE_FILE`、`IM_MOBILE_RELEASE_STORE_PASSWORD`、`IM_MOBILE_RELEASE_KEY_ALIAS`、`IM_MOBILE_RELEASE_KEY_PASSWORD`
- `cd frontend/apps/mobile/android && .\gradlew.bat bundleRelease`：**FAIL**
  - 原因：同上

## 2. 测试状态

- `cd frontend && npm run mobile:test`：**PASS**
- 结果：`6 suites / 59 tests` 全部通过
- 已覆盖证据：
  - 401 refresh 自动续期
  - 登录态恢复
  - WebSocket 消息分发
  - pending 重试与合并
  - FCM 未配置降级
  - E2EE 遮罩与禁发
  - debug diagnostics 脱敏与 debug gate

## 3. lint 状态

- `cd frontend && npm run mobile:lint`：**PASS**

## 4. debug 真机/模拟器状态

- 模拟器状态：**PARTIAL**
  - `mobile:android` 已成功安装并启动
  - `adb dumpsys` 显示 `com.immobile/.MainActivity` 处于 resumed 前台状态
  - 截图 [release-gate-debug-screen-2.png](file:///d:/project/new-im-project/frontend/apps/mobile/logs/release-gate-debug-screen-2.png) 显示 App 已进入登录页
  - 但登录页顶部出现 `Network unavailable. Changes will retry when online.` 提示
- 真机状态：**未验证**
  - 本轮仅验证模拟器，未执行物理设备冒烟

## 5. release APK 状态

- 状态：**FAIL**
- 失败原因：release 签名变量未提供，Gradle 在配置阶段直接 fail-fast
- 影响：当前**不能**进入 release APK 内测分发

## 6. AAB 状态

- 状态：**FAIL**
- 失败原因：与 release APK 相同，缺少 release 签名变量
- 影响：当前**不能**进入 Play Console / AAB 内测上传阶段

## 7. 登录链路状态

- 状态：**NOT PASSED**
- 已验证：
  - 登录页可正常打开
  - 用户名/密码输入框和登录按钮已显示
- 未通过原因：
  - 本轮没有可用测试账号执行真实登录
  - 当前登录页存在 `Network unavailable` 明显告警，说明认证前置链路仍存在风险
- 判定：
  - 按门禁规则，登录链路未完成通过，不满足进入内测条件

## 8. 私聊链路状态

- 状态：**NOT PASSED**
- 说明：
  - 单元测试与 parity matrix 表明私聊发送链路实现完成
  - 但本轮未完成 Android <-> Web 或 Android <-> Android 的真实私聊双向收发验证
  - 受登录未打通影响，无法给出发布通过结论

## 9. 群聊链路状态

- 状态：**NOT PASSED**
- 说明：
  - 代码与 parity matrix 标记群聊主链路已实现
  - 但本轮未完成真实群聊收发与已读联调
  - 受登录未打通影响，无法判定可发布

## 10. 媒体消息状态

- 状态：**NOT PASSED**
- 说明：
  - 文档与测试显示图片、文件、语音链路已接入，视频播放为 `PARTIAL`
  - 但本轮未完成真实媒体选择、上传、发送、接收、播放的端到端验证
  - 不能作为内测发布通过证据

## 11. 离线 pending 状态

- 状态：**PARTIAL**
- 已验证：
  - 单测覆盖 pending 持久化、失败保留、恢复重试与服务端 echo 合并
- 未验证：
  - 真机或模拟器下断网发送、恢复网络后自动/手动 retry 的真实端到端行为

## 12. WebSocket 状态

- 状态：**NOT PASSED**
- 已验证：
  - 后端 `im-server` 健康检查通过：`http://localhost:8083/health`
  - 模拟器可连通宿主机 `10.0.2.2`
  - 模拟器可连通宿主机 `10.0.2.2:8082`
- 未验证：
  - 业务 WebSocket 需要登录成功后才能建立并验证收发
- 日志说明：
  - 本轮 logcat 中出现的是 React Native DevSupport 对 `ws://10.0.2.2:8081/message` 的重连日志，不是 IM 业务 WebSocket
  - 因此它不能证明 IM WS 正常，也不能替代业务 WS 冒烟

## 13. 通知状态

- 状态：**PARTIAL**
- 已验证：
  - 客户端 Notifee、本地通知、点击路由、通知事件 SQLite 记录、FCM token 获取降级均已在文档和测试中体现
- 未验证：
  - 真实前台通知展示
  - 后台通知
  - 通知点击跳转
  - 离线推送

## 14. Push 后端依赖状态

- 状态：**PARTIAL / 非前台 IM 阻塞**
- 核对结果：
  - 后端代码中已存在 `/api/push/devices/register`、`/unregister`、`/token`、`/settings` 路由
  - 证据见 [push_routes.rs](file:///d:/project/new-im-project/backend/api-server-rs/src/routes/push_routes.rs)
- 风险：
  - `PUSH_BACKEND_CONTRACT.md` 仍写着后端 `BACKEND_REQUIRED`，与当前代码实现不一致，文档已过时
  - 本轮未做 Firebase + 后端 push device 的真实联调
- 判定：
  - 按规则，FCM/离线推送缺失**不阻塞前台 IM 内测**
  - 但必须在报告中标记为离线推送能力未完成验证

## 15. E2EE 状态

- 状态：**非阻塞，但未实现**
- 说明：
  - E2EE 不在本轮范围
  - parity matrix 标记为 `BLOCKED_BY_SCOPE` / `DEFERRED`
  - 当前策略是：加密会话不做真实 E2EE 收发，客户端以遮罩和禁发方式降级
- 判定：
  - 不阻塞明文 IM 内测
  - 但必须确保加密会话入口继续保持明确禁用/遮罩

## 16. 安全 / 隐私 / 权限状态

- 状态：**PARTIAL**
- 已满足：
  - `AndroidManifest.xml` 设置 `android:allowBackup="false"`
  - release 构建默认 `usesCleartextTraffic=false`
  - debug / release 环境地址分离，release 禁止静默落到 `10.0.2.2`
  - release 签名通过环境变量注入，不提交 keystore 和密码
  - Firebase 生产配置不入库
  - 诊断日志已做敏感信息脱敏，不记录 token / cookie / password / api key / authorization
- 仍需人工确认：
  - 最终 Firebase 配置
  - release keystore 与签名变量
  - Play Console 版本与包名
  - Android 13+ 通知权限与媒体/麦克风权限的真实设备回归

## 17. 是否建议进入内测

- 结论：**不建议当前进入 Android 内测发布阶段**
- 补充判断：
  - **可继续 debug 联调**
  - **不可进入 release APK / AAB 内测分发**

## 18. 不建议进入内测的阻塞项

- 阻塞项 1：release APK / AAB 无法构建
  - 缺少 4 个 release signing 变量，导致 `assembleRelease` 和 `bundleRelease` 均失败
- 阻塞项 2：登录链路未通过
  - 当前仅验证到登录页展示，未完成真实登录
  - 登录页同时显示 `Network unavailable. Changes will retry when online.`
- 阻塞项 3：私聊 / 群聊 / 媒体 / pending / 业务 WebSocket 端到端未通过
  - 由于未登录成功，核心 IM 主链路没有形成发布级通过证据

## 附加证据

- 后端健康检查：
  - `http://localhost:8082/health`：`{"service":"api-server-rs","status":"UP"}`
  - `http://localhost:8083/health`：`{"status":"UP","service":"im-server",...}`
- 模拟器网络探测：
  - `ping 10.0.2.2`：PASS
  - `nc -z 10.0.2.2 8082`：PASS
- debug 界面证据：
  - [release-gate-debug-screen-2.png](file:///d:/project/new-im-project/frontend/apps/mobile/logs/release-gate-debug-screen-2.png)
- logcat 证据：
  - [android-logcat-20260513-210937.txt](file:///d:/project/new-im-project/frontend/apps/mobile/logs/android-logcat-20260513-210937.txt)

## 首阶段平台范围结论

> **"功能代码存在"不等于"发布验证通过"。**

### Android（优先平台）

当前第一阶段以 Android debug 联调和 Android release 内测准备为主。Android 是唯一进入内测的候选平台。当前阻塞项：

1. **release signing 变量** — 4 个签名变量未提供，release APK/AAB 无法构建
2. **登录链路真实验证** — 登录页存在 `Network unavailable` 告警，未完成真实登录
3. **私聊 / 群聊 / 媒体 / pending / WebSocket 端到端验证** — 受登录未打通影响，核心链路无发布级证据

### iOS（不在当前发布范围）

iOS 工程文件存在（`apps/mobile/ios/`），但不应默认视为 release-ready。iOS 需单独完成：

- 权限声明（Info.plist）
- native runtime config
- 推送配置（APNs）
- 真机冒烟
- archive / TestFlight 验证

详见 `MOBILE_RELEASE_SCOPE.md`。

## 建议下一步

1. 提供本地 release keystore 和 4 个签名变量，先打通 `assembleRelease` / `bundleRelease`。
2. 排查登录页 `Network unavailable` 的应用内根因，优先检查：
   - App 首屏网络状态判定
   - 首次认证请求是否真正发出
   - Metro/debug bundle 切换后是否残留旧状态
3. 提供两组测试账号和一个测试群，执行发布前最小人工冒烟：
   - 登录
   - 私聊双向收发
   - 群聊双向收发
   - 媒体消息
   - 断网 pending 重试
   - 已读
   - WebSocket 重连
4. 若要进入真正内测包阶段，再补：
   - Firebase 非生产配置
   - 通知点击回归
   - release APK 安装后脱离 Metro 的启动验证
