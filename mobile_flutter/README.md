# IM Flutter 移动端

## 已对齐能力
- 登录与 token/refreshToken 持久化
- 401 自动刷新并重放请求
- 会话列表、消息历史、文本消息发送
- 历史消息分页加载（向上加载更早消息）
- 图片/文件上传并发送媒体消息
- 上传进度展示与取消上传
- 发送失败消息重发
- 会话进入自动已读上报
- WebSocket 已读回执展示（单聊已读/群聊已读人数）
- 会话未读总数与底部导航角标
- 聊天页离底检测与一键回到底部
- WebSocket 实时消息接收、心跳、自动重连
- 好友列表、群组列表、从好友/群组直接发起会话
- 个人页连接状态展示与手动重连、退出登录

## 运行方式
1. 安装 Flutter SDK
2. 在本目录执行 `flutter pub get`
3. 运行：
   - Android/iOS 模拟器：`flutter run`
   - 自定义后端地址：
     - `flutter run --dart-define=API_BASE_URL=http://localhost:8080/api --dart-define=WS_BASE_URL=ws://localhost:8080/websocket`

## 目录说明
- `lib/state` 状态管理
- `lib/services` HTTP 与 WebSocket
- `lib/ui/screens` 页面
- `lib/models` 数据模型
