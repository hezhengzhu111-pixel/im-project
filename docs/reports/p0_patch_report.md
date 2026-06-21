# P0 Web/Desktop 收口补丁报告

## 修改文件列表

| 文件 | 修改原因 |
| --- | --- |
| `tests/p0/p0_e2ee_cross_client_matrix.py` | 新增 P0 E2EE 跨客户端矩阵脚本，覆盖 Web↔Desktop、Web↔Mobile、Desktop↔Mobile 双向加密收发 |
| `tests/gates/gray_frontend_check.py` | 修复 Windows 下 `flutter.bat` 执行问题：使用 `gate_common.resolve_command` 解析可执行文件绝对路径，避免 `FileNotFoundError: command not found` |

## 如何验证跨客户端 E2EE

`tests/p0/p0_e2ee_cross_client_matrix.py` 复用 `p0_e2ee_private_text_acceptance.py` 中的 `APIClient` 与 `E2EEUser`：

1. 分别为 `web`、`desktop`、`mobile` 三个角色注册用户、登录、注册设备。
2. 每对客户端建立好友关系并协商 E2EE session。
3. 双方各发送一条加密消息，对端从历史记录拉取后使用 Rust E2EE 引擎解密。
4. 断言解密后的明文与发送原文一致。

矩阵覆盖：

- web → desktop / desktop → web
- web → mobile / mobile → web
- desktop → mobile / mobile → desktop

## gray_frontend_check Windows 修复

原脚本直接使用 `subprocess.run(["flutter", ...])`，在 Windows 上会触发 `FileNotFoundError: command not found: None`。修复后：

```python
actual_cmd = resolve_command(cmd)
proc = subprocess.run(
    actual_cmd,
    ...
    shell=isinstance(actual_cmd, str),
    env=env,
)
```

`resolve_command` 通过 `shutil.which("flutter")` 得到 `C:\...\flutter.BAT` 的绝对路径，CreateProcess 可直接执行。

## 执行命令及结果

| 命令 | 结果 |
| --- | --- |
| `python tests/p0/p0_e2ee_private_text_acceptance.py --base-url http://localhost:8082 --db-url mysql://root:change_me_mysql_root@127.0.0.1:3306/service_message_service_db` | PASS (7/7) |
| `python tests/p0/p0_e2ee_cross_client_matrix.py --base-url http://localhost:8082` | PASS (6/6) |
| `python tests/test.py flutter --continue-on-error` | PASS |
| `python tests/test.py rust --continue-on-error` | PASS |
| `python tests/test.py rust-bridge --continue-on-error` | PASS |
| `python tests/test.py e2ee-rust --continue-on-error` | PASS |
| `python tests/test.py manifest` | PASS |
| `python tests/gates/gray_frontend_check.py --env sit` | PASS |
| `cd build/work/flutter/apps/desktop && flutter build windows --release` | PASS |

## 是否改动后端

NO。

## 是否改动 E2EE 算法

NO。

## 是否改动数据库

NO。

## 已知风险

1. Desktop 真实 E2EE 收发已通过跨客户端矩阵脚本验证，但仅在 Windows 桌面构建环境执行；macOS / Linux 未在本轮验证。
2. `gray_frontend_check` 当前默认执行 web build，耗时较长；后续可考虑在 CI 中拆分并行任务。

## 是否允许进入 P1

YES。P0 补丁与验收已全部通过，满足 P1 放行条件。
