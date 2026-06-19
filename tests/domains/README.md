# tests/domains — 按业务域组织的测试

本目录包含 IM 核心业务域的独立测试 runner 与 SIT 脚本。

## 目录结构

```
tests/domains/
├── common/          # 公共 helper：ApiClient、fixtures、runner_base
├── auth/            # 认证
├── user/            # 用户资料/设置/账号
├── message_private/ # 单聊
├── message_group/   # 群聊
├── social/          # 联系人/好友/群组
├── moments/         # 朋友圈
├── file/            # 文件传输
├── push/            # 推送
├── e2ee/            # 端到端加密
└── websocket/       # WebSocket 实时消息
```

每个业务域包含：
- `runner.py`：统一入口，接收 `--base-url`、`--ws-base`、`--db-url` 等参数。
- `sit.py`：业务域 SIT 用例实现，返回 `list[StepResult]`。

## 运行方式

通过顶层入口运行单个业务域：

```bash
python tests/test.py auth --base-url http://localhost:8082
python tests/test.py message-private --base-url http://localhost:8082
python tests/test.py e2ee --base-url http://localhost:8082 --db-url mysql://root:root123@127.0.0.1:3306/service_message_service_db
python tests/test.py websocket --base-url http://localhost:8082 --ws-base ws://localhost:8083
```

也可以直接调用 runner：

```bash
python tests/domains/auth/runner.py --base-url http://localhost:8082
```

## 设计原则

- 每个业务域独立可运行，便于定位失败。
- `common/api_client.py` 与 `common/fixtures.py` 统一封装注册、登录、加好友、建群等通用 fixture。
- SIT 脚本默认假设本地运行时服务已启动（`python scripts/imctl.py up`）。
- 依赖服务不可用时，runner 应返回 SKIP 而非 FAIL，避免阻塞 PR 门禁。
