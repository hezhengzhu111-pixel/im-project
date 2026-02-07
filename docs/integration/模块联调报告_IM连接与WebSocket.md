# 模块联调报告：IM 连接与 WebSocket

## 基线信息

- 网关地址: ${gateway_host}:${gateway_port}
- 验证时间: ${date}
- 版本号: ${version}
- 验证人: ${owner}

## 覆盖页面

- WebSocket 配置: `frontend/src/config/websocket.ts`
- WebSocket Store: `frontend/src/stores/websocket.ts`
- 聊天页连接入口: `frontend/src/pages/Chat.vue`

## 覆盖链路（经网关）

- WebSocket: `ws(s)://${gateway_host}:${gateway_port}/websocket/{userId}`
- IM REST（如有）: `GET/POST /api/im/**`

## 自动化验收

- 执行: `python test_im_complete.py --mode gateway --service im`
- 产物: `test_reports/run_*/im/report.json`

## 正向流程（至少 3 条）

1. 登录后建立 WebSocket → 接收实时消息
2. 断线重连（WiFi 切换/断网）→ 自动恢复会话
3. 多端登录（可选）→ 在线状态与消息一致

## 异常流程（至少 5 条）

1. 未登录直接连接 WebSocket（鉴权失败）
2. 错误 userId 连接（4xx/断开）
3. 网关 5xx（后端故障）下重连策略与提示
4. 3G 网络下连接超时（超时）
5. 网关限流触发后的退避重试（限流）

## 性能与稳定性

- Chrome DevTools 禁用缓存 + 模拟 3G:
  - 首屏加载: <2s（记录值: ${first_paint_ms}ms）
  - 交互响应: <300ms（记录值: ${interaction_ms}ms）
- 控制台报错: 无/有（截图: ${console_screenshot_path}）

## 证据留存

- Network/WS Frames 截图: ${ws_screenshot_path}
- 网关日志（升级握手/路由转发）: ${gateway_log_path}
- 录屏: ${video_path}

## 结论

- 结论: 通过/不通过
- 阻塞项:
  - ${blocker_1}
  - ${blocker_2}

