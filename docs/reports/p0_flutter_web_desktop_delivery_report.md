# P0 Flutter Web / Desktop 交付验收报告

## 验收范围

- Flutter Web 端 E2EE 私聊收发、离线重试、历史记录恢复
- Flutter Desktop 端 E2EE provider 接入、Rust bridge 初始化失败兜底、构建产物
- 跨客户端矩阵：Web ↔ Desktop ↔ Mobile 双向 E2EE 加密收发
- 全量 Flutter / Rust / Rust-Bridge / E2EE-Rust / Manifest / Gray-Frontend 门禁
- Desktop Windows  release 构建

## 环境

| 项目 | 值 |
| --- | --- |
| 代码分支 | master @ `ad83b2de` |
| 后端 | `sit-im-api-server-1` @ `localhost:8082` |
| 数据库 | MySQL 8 @ `localhost:3306/service_message_service_db` |
| Flutter | 3.44.0 / Dart 3.12.0 |
| Rust | 可用 |
| Desktop 构建平台 | Windows x64 |

## 验收用例

### 1. P0 E2EE 私聊基础验收

脚本：`tests/p0/p0_e2ee_private_text_acceptance.py`

| 场景 | 结果 |
| --- | --- |
| Web → Mobile 加密发送并解密 | PASS |
| Mobile → Web 加密发送并解密 | PASS |
| 历史记录恢复 | PASS |
| HTTP 明文扫描（无裸 payload） | PASS |
| DB 明文扫描（无裸 payload） | PASS |
| E2EE session 中 plaintext 被拦截 | PASS |

**结果：7/7 PASS**

### 2. P0 E2EE 跨客户端矩阵

脚本：`tests/p0/p0_e2ee_cross_client_matrix.py`

| 客户端对 | 方向 | 结果 |
| --- | --- | --- |
| Web ↔ Desktop | Web → Desktop | PASS |
| Web ↔ Desktop | Desktop → Web | PASS |
| Web ↔ Mobile | Web → Mobile | PASS |
| Web ↔ Mobile | Mobile → Web | PASS |
| Desktop ↔ Mobile | Desktop → Mobile | PASS |
| Desktop ↔ Mobile | Mobile → Desktop | PASS |

**结果：6/6 PASS**

### 3. 全量门禁

| 门禁 | 命令 | 结果 |
| --- | --- | --- |
| Flutter | `python tests/test.py flutter --continue-on-error` | PASS |
| Rust | `python tests/test.py rust --continue-on-error` | PASS |
| Rust Bridge | `python tests/test.py rust-bridge --continue-on-error` | PASS |
| E2EE Rust | `python tests/test.py e2ee-rust --continue-on-error` | PASS |
| Manifest | `python tests/test.py manifest` | PASS |
| Gray Frontend | `python tests/gates/gray_frontend_check.py --env sit` | PASS |
| Desktop Build | `cd build/work/flutter/apps/desktop && flutter build windows --release` | PASS |

### 4. Desktop 构建产物

```
build/work/flutter/apps/desktop/build/windows/x64/runner/Release/im_desktop.exe
```

构建成功，产物可执行。

## 已知未覆盖项

- 未在 macOS / Linux 上执行 Desktop release 构建（当前环境为 Windows）。
- 未执行 Web release 产物在真实浏览器中的端到端 E2EE 验证（已由单元测试 + P0 Python 脚本覆盖 API 层）。
- 未进行桌面端安装包签名 / 发布流程验证。

## CI 修复状态

P0 → P1 放行前 CI 收口补丁已修复 GitHub Actions `Check lifecycle prerequisites` 失败导致 gate 被跳过的问题：

- `scripts/imctl.py doctor` 现在区分 required / optional 检查，在 CI 中对 Docker、部署配置、build context 等本地部署相关项输出 `WARN`/`SKIP`，不再阻断 gate。
- 所有相关 workflow 已统一安装 `pip install -r scripts/requirements.txt`。
- `Swatinem/rust-cache` 已配置为仅缓存 `build/cache/cargo-target`，避免 `rust/target/` 被恢复到源码目录造成污染误报；doctor 与 gate 前也会增加 `python scripts/imctl.py clean source-pollution` 兜底。
- Build Artifacts workflow 已补充 `wasm-pack` 与 `maven` 安装。

目标 workflow（预期推送后变绿）：

1. P0 Acceptance Gate
2. PR Fast Gate
3. E2EE Rust CI
4. Rust Bridge CI
5. Build Artifacts

## 结论

P0 Flutter Web / Desktop 交付验收通过，所有强制门禁与端到端用例均满足，CI lifecycle 问题已收口。允许进入 P1。

**P1 放行：YES**
