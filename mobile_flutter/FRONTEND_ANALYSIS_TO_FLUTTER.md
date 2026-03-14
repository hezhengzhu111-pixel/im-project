# 前端能力分析与 Flutter 映射

## 1. Web 前端核心架构
- 技术栈：Vue3 + Pinia + Vue Router + Axios + WebSocket
- 模块分层：pages 负责页面编排，stores 负责状态，services 负责接口
- 网络链路：HTTP 走 `/api` 网关，实时消息走 `/websocket/{userId}?token=...`
- 鉴权闭环：登录返回 token/refreshToken，401 自动 refresh 后重放请求

## 2. 核心业务流程
- 登录注册：`/user/login`、`/user/register`
- 会话与消息：`/message/conversations`、历史消息接口、私聊/群聊发送接口
- 联系人与群组：好友列表/申请、群组列表/成员
- 实时消息：WebSocket 推送 `MESSAGE/ONLINE_STATUS/READ_RECEIPT/SYSTEM`

## 3. Flutter 端对齐策略
- P0：认证闭环、会话列表、聊天页、消息收发、WebSocket 重连与心跳
- P0：联系人列表、群组列表、基本资料页与退出登录
- P1：图片/文件上传、离线缓存、群已读详情、设置页完整能力

## 4. 本次移动端实现范围
- 已实现：登录、token 持久化、401 刷新、会话列表、私聊/群聊文本发送、历史消息加载
- 已实现：图片/文件上传并发送、发送失败重发、好友/群组发起会话
- 已实现：消息向上分页加载、进入会话自动已读上报
- 已实现：WebSocket 已读回执展示、会话未读数与总未读角标
- 已实现：聊天页离底检测与一键回到底部
- 已实现：WebSocket 实时接收、心跳、自动重连、连接状态展示与手动重连
- 已实现：上传进度可视化与取消上传
- 预留：语音/视频消息、复杂设置项、全量离线仓库
