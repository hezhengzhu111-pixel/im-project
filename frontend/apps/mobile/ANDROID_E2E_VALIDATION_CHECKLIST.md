# Android E2E Validation Checklist

## 状态说明

- `AUTO-PASS`：已在当前环境直接执行并确认通过。
- `AUTO-EVIDENCE`：已通过代码、单测、脚本或运行证据确认部分链路，但未完成真实双端交互。
- `MANUAL`：必须在模拟器/真机上手工联调。
- `BLOCKED`：当前环境或构建阻塞，需先解除阻塞再继续。

## 1. 环境准备

| 检查项 | 当前状态 | 执行方式 | 操作步骤 | 通过标准 | 当前证据 |
| --- | --- | --- | --- | --- | --- |
| Node 版本 | `AUTO-PASS` | 命令 | 在仓库根目录执行 `node -v` | Node `>= 22` | 当前为 `v24.14.1` |
| JDK 版本 | `AUTO-EVIDENCE` | 命令 | 执行 `java -version` | JDK 可供 Gradle 使用；优先 JDK 17，当前 JDK 21 也需验证兼容性 | 当前为 `OpenJDK 21.0.10 LTS`；Gradle `:app:tasks` 可跑 |
| Android SDK | `AUTO-PASS` | 文件 + 命令 | 检查 `android/local.properties` 与 `adb` 可执行文件 | 可解析出有效 SDK 路径，`platform-tools/adb` 存在 | `sdk.dir=C:\Users\10954\AppData\Local\Android\Sdk` |
| emulator / physical device | `AUTO-PASS` | 命令 | 执行 `adb devices` | 至少一个 `device` 状态设备在线 | 当前检测到 `emulator-5554` |
| adb reverse | `AUTO-PASS` | 命令 | `cd frontend && npm run mobile:reverse` | 输出成功，Metro 端口 `8081` 已反向代理 | 当前已执行成功 |
| 后端服务启动 | `AUTO-PASS` | 命令 | 访问 `http://localhost:8082/health` 与 `http://localhost:8083/health` | API 与 IM 服务健康 | 当前均返回 `UP` |
| Web 端启动 | `AUTO-PASS` | 命令 | 访问 `http://localhost:3000/` | Web dev server 可访问 | 当前返回 `200` |
| Metro 启动 | `AUTO-PASS` | 命令 | `cd frontend && npm run mobile:start` | `http://127.0.0.1:8081/status` 返回 `packager-status:running` | 当前已成功启动过 Metro |
| Android 安装/拉起 | `BLOCKED` | 命令 | `cd frontend && npm run mobile:android` | Debug 包成功安装并自动拉起 | 当前被 `react-native-worklets` native build 阻塞 |

## 2. 认证

| 检查项 | 当前状态 | 执行方式 | 操作步骤 | 通过标准 | 当前证据 |
| --- | --- | --- | --- | --- | --- |
| 登录成功 | `MANUAL` | Android + 后端 | 在 Android 输入有效账号登录 | 跳转会话页，`authStore.currentUser` 有值，WebSocket 建连 | 需种子账号 |
| 登录失败 | `MANUAL` | Android | 输入错误用户名/密码 | 页面保留登录态，出现错误提示，不写入 token | 需人工操作 |
| App 重启恢复登录态 | `AUTO-EVIDENCE` | 单测 + 手工 | 先登录，再杀进程重启 App | `restoreSession()` 成功恢复用户态并重新做 side effects | `mobile-core.spec.ts` 已覆盖 token parse 恢复；仍需设备实测 |
| token 失效 refresh | `AUTO-EVIDENCE` | 单测 + 手工 | 让接口先返回 401，再触发业务请求 | refresh 成功后原请求自动重试一次 | `mobile-core.spec.ts` 已覆盖 401 refresh retry；仍需联调真实后端 cookie |
| logout 清理状态 | `AUTO-EVIDENCE` | 代码 + 手工 | 登录后点击退出登录 | WebSocket 断开，chat/session/notification 绑定清空，token 与用户快照清理 | `authStore.logout()` 已调用 `disconnect()`、`clearRuntime()`、`clearSession()`；仍需设备实测 |

## 3. 会话

| 检查项 | 当前状态 | 执行方式 | 操作步骤 | 通过标准 | 当前证据 |
| --- | --- | --- | --- | --- | --- |
| 会话列表加载 | `MANUAL` | Android | 登录成功后进入 `SessionListScreen` | 会话列表展示服务端会话，且本地仓储同步写入 | `chatStore.refreshSessions()` 与 `messageRepository.upsertSession()` 已接线 |
| 联系人打开私聊 | `MANUAL` | Android | 从联系人页选择好友打开聊天 | 会构造私聊 `session.id` 并进入聊天页 | `chatStore.openPrivateSession()` 已接线 |
| 群列表打开群聊 | `MANUAL` | Android | 从群列表进入某个群 | 会构造 `group_{id}` session 并进入聊天页 | `chatStore.openGroupSession()` 已接线 |
| 会话排序 | `AUTO-EVIDENCE` | 代码 + 手工 | 制造新消息、置顶、进入列表 | 置顶优先，其次按 `lastActiveTime` 倒序 | `sessionStore.upsertSession()` 已实现排序规则 |
| 未读数显示 | `AUTO-EVIDENCE` | 单测 + 手工 | Web 或另一端发消息到非当前会话 | 非当前会话 unread 增加，进入会话后清零 | `mobile-core.spec.ts` 已覆盖 websocket 非当前消息累加 unread；仍需设备验证 UI |

## 4. 私聊

| 检查项 | 当前状态 | 执行方式 | 操作步骤 | 通过标准 | 当前证据 |
| --- | --- | --- | --- | --- | --- |
| Android 发给 Web | `MANUAL` | 双端联调 | Android 登录 userA，Web 登录 userB，在私聊中发文本 | Web 实时收到消息，顺序正确 | 需双端账号 |
| Web 发给 Android | `MANUAL` | 双端联调 | Web 发消息给 Android 当前账号 | Android 实时收消息并入会话列表/消息列表 | 需双端账号 |
| 历史消息加载 | `MANUAL` | Android | 进入已有私聊并下拉或首次打开 | 先显示缓存，再拉取服务端历史 | `messageStore.loadMessages()` 已接缓存 + HTTP |
| WebSocket 实时消息 | `AUTO-EVIDENCE` | 单测 + 手工 | 推送私聊消息事件 | `dispatchPayload()` 写入 store、更新会话、必要时通知 | `mobile-core.spec.ts` 已覆盖 websocket message dispatch |
| pending 替换 server message | `AUTO-EVIDENCE` | 单测 + 手工 | Android 发消息后等待服务端回包/echo | 本地 optimistic/pending 消息被 server message 合并替换 | `mobile-core.spec.ts` 已覆盖 optimistic、retry、echo merge |

## 5. 群聊

| 检查项 | 当前状态 | 执行方式 | 操作步骤 | 通过标准 | 当前证据 |
| --- | --- | --- | --- | --- | --- |
| Android 发群消息 | `MANUAL` | Android | 在群会话发送文本/媒体 | 服务端返回成功并写入当前列表 | 需有效群组 |
| Web 收群消息 | `MANUAL` | 双端联调 | Android 在群里发消息 | Web 群会话收到消息 | 需双端账号 + 群 |
| Web 发群消息 | `MANUAL` | 双端联调 | Web 在群里发消息 | Android 群会话实时收到 | 需双端账号 + 群 |
| Android 收群消息 | `MANUAL` | Android + Web | Android 不在当前群会话时接收群消息 | 会话列表更新 lastMessage / unreadCount | `websocketStore.dispatchPayload()` 已接线；需设备实测 |

## 6. 网络异常

| 检查项 | 当前状态 | 执行方式 | 操作步骤 | 通过标准 | 当前证据 |
| --- | --- | --- | --- | --- | --- |
| 断网发送 | `MANUAL` | Android | 关闭模拟器网络后发送消息 | 消息进入 pending / failed 路径，不崩溃 | 需设备操作 |
| pending 标记 | `AUTO-EVIDENCE` | 单测 + 手工 | 模拟发送失败 | 消息状态转为 `FAILED`，pending 队列保留记录 | `mobile-core.spec.ts` 已覆盖发送失败保留 pending |
| 网络恢复 retry | `AUTO-EVIDENCE` | 单测 + 手工 | 恢复网络并触发 retry | pending 被重新发送，成功后删除 pending | `mobile-core.spec.ts` 已覆盖 retryPending 成功删除 pending |
| WebSocket 重连 | `AUTO-EVIDENCE` | 代码 + 运行日志 | App 回前台或网络恢复 | 自动调用 `connect()` 并按退避重连 | `websocketStore` 已绑定 lifecycle/network resume；logcat 中可见重连告警 |

## 7. App 生命周期

| 检查项 | 当前状态 | 执行方式 | 操作步骤 | 通过标准 | 当前证据 |
| --- | --- | --- | --- | --- | --- |
| 后台 | `MANUAL` | Android | App 切后台，等待推送或消息 | 返回前台后状态可恢复，无崩溃 | 需设备操作 |
| 回前台 | `AUTO-EVIDENCE` | 代码 + 手工 | 后台后切回前台 | 自动 retry pending 并重连 WebSocket | `websocketStore.bindResumeHooks()` 已接线 |
| 杀进程重启 | `AUTO-EVIDENCE` | 代码 + 手工 | 登录后杀进程重启 | 本地 token/用户快照恢复或安全清空 | `authStore.restoreSession()` 已接线；需设备实测 |

## 8. 已读

| 检查项 | 当前状态 | 执行方式 | 操作步骤 | 通过标准 | 当前证据 |
| --- | --- | --- | --- | --- | --- |
| 进入会话本地未读清零 | `AUTO-EVIDENCE` | 单测 + 手工 | 进入有未读的会话 | 当前 session unread 立即归零 | `messageStore.markRead()` 成功后调用 `sessionStore.markRead()`；已有单测 |
| 服务端未读清零 | `MANUAL` | Android + Web/后端 | 进入私聊或群聊后刷新另一端会话/接口 | 服务端 unread/read cursor 同步更新 | 需真实后端联调 |
| Web 与 Android 未读一致 | `MANUAL` | 双端联调 | 在 Web/Android 之间互发并分别进入会话 | 两端会话 unread 计数最终一致 | 需双端账号 |

## 9. 通知

| 检查项 | 当前状态 | 执行方式 | 操作步骤 | 通过标准 | 当前证据 |
| --- | --- | --- | --- | --- | --- |
| 非当前会话通知 | `AUTO-EVIDENCE` | 单测 + 手工 | 非当前会话收到消息 | Notifee 本地通知显示 | `mobile-core.spec.ts` 已覆盖非当前消息触发通知 |
| 当前会话不通知 | `AUTO-EVIDENCE` | 单测 + 手工 | 当前会话收到消息 | 不展示本地通知 | `mobile-core.spec.ts` 已覆盖当前会话不通知 |
| 点击通知跳转 | `MANUAL` | Android | 点击本地通知或 FCM 通知 | 跳转到目标页面/会话 | `notificationService.handleNotificationOpen()` 已接线，需设备实测 |
| FCM 未配置降级 | `AUTO-EVIDENCE` | 单测 + 代码 | 缺少 `google-services.json` 或 Firebase 不可用 | 记录 warning，不阻塞本地通知与主流程 | `notificationService.getMessaging()` 与单测已覆盖 |

## 10. E2EE 降级

| 检查项 | 当前状态 | 执行方式 | 操作步骤 | 通过标准 | 当前证据 |
| --- | --- | --- | --- | --- | --- |
| 加密消息遮罩 | `AUTO-EVIDENCE` | 单测 + 手工 | 接收 `encrypted=true` 消息 | 显示受限提示，不显示原文 | `mobile-core.spec.ts` 已覆盖 masking |
| 加密会话禁止发送 | `AUTO-EVIDENCE` | 单测 + 手工 | 在加密会话尝试发送 | 阻止发送并给出提示 | `mobile-core.spec.ts` 已覆盖阻断 |
| 不展示密文 | `AUTO-EVIDENCE` | 单测 + 手工 | 接收带密文字段的消息 | UI 不直接暴露密文内容 | `maskEncryptedMessage()` 单测已覆盖 |

## 当前建议执行顺序

1. 先解除 `mobile:android` 的 Windows native build 阻塞。
2. 用已知测试账号完成认证与会话手动冒烟。
3. 用 Android + Web 双端完成私聊、群聊、已读、通知的主链路联调。
4. 用 `node apps/mobile/scripts/collect-android-logs.cjs --serial emulator-5554 --minutes 15` 收集联调期 logcat。
