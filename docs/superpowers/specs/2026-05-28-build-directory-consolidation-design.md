# 根目录 build/ 统一编译产物目录设计

## 概述

在项目根目录创建 `build/` 目录，将 Rust（backend、e2ee-ffi、flutter-native）和 Flutter 的编译产物集中存放，替代各模块内部散落的 `target/`、`build/` 目录。

## 背景

当前编译产物分散在多个位置：

| 路径 | 大小 | 说明 |
|------|------|------|
| `backend/target/` | ~25GB | Rust workspace 编译产物 |
| `backend/e2ee-ffi/target/` | 64KB | 独立 Rust crate |
| `flutter/native/rust/target/` | ~566MB | flutter_rust_bridge 编译产物 |
| `flutter/apps/web/build/` | ~154MB | Flutter web 编译输出 |
| `flutter/apps/web/out.js` 等 | 零散 | 残留编译文件 |

**问题：**
- 产物散落，磁盘占用不直观
- `flutter/apps/web/out.js` 等文件残留在源码目录
- `.gitignore` 重复定义多个相同规则

## 目标结构

```
new-im-project/
├── build/                              ← 统一编译产物目录
│   ├── rust/
│   │   ├── backend/                    ← backend workspace 产物
│   │   ├── e2ee-ffi/                  ← e2ee-ffi 产物
│   │   └── flutter-native/            ← flutter/native/rust 产物
│   └── flutter/
│       └── web/                        ← Flutter web 编译输出
├── backend/
│   ├── api-server-rs/
│   ├── im-server-rs/
│   ├── e2ee-core/
│   ├── e2ee-ffi/
│   ├── e2ee-wasm/
│   └── common/
├── flutter/
│   ├── apps/web/
│   ├── native/rust/
│   └── packages/
```

## 实现方式

### 1. Rust 编译产物重定向

通过 `CARGO_TARGET_DIR` 环境变量将 Rust 编译产物重定向到 `build/rust/` 下。

Cargo 的 `CARGO_TARGET_DIR` 只能通过环境变量设置（不支持 `.cargo/config.toml`），因此采用 shell 脚本包装。

创建 `scripts/set-build-env.sh`，在开发前 source：

```bash
# scripts/set-build-env.sh
export CARGO_TARGET_DIR="$(git rev-parse --show-toplevel)/build/rust"
```

各模块构建命令示例：

```bash
source scripts/set-build-env.sh
cd backend && cargo build               # 产物 → build/rust/
cd flutter/native/rust && cargo build   # 产物 → build/rust/（共享缓存）
```

`CARGO_TARGET_DIR` 是全局环境变量，workspace 成员（包括 `e2ee-wasm`）都会使用同一路径。Cargo 会根据 workspace 根自动组织子目录结构。

### 2. Flutter 编译产物重定向

在 `flutter/melos.yaml` 的 `build:web` 脚本中添加 `--output-dir`：

```yaml
scripts:
  build:web:
    run: melos exec --scope="im_web" -- flutter build web --output-dir=../../build/flutter/web
```

### 3. 清理残留编译文件

删除 `flutter/apps/web/` 下的残留编译文件：

- `out.js`
- `out.js.deps`
- `out.js.map`

### 4. 更新 .gitignore

在根目录 `.gitignore` 中添加：

```gitignore
# 统一编译产物目录
build/
```

同时清理重复规则，合并为一份干净的 `.gitignore`。

### 5. 清理旧的编译目录

迁移完成后删除旧目录：

```bash
rm -rf backend/target/
rm -rf backend/e2ee-ffi/target/
rm -rf flutter/native/rust/target/
rm -rf flutter/apps/web/build/
```

## 注意事项

### 构建脚本兼容性

- `start_web.sh` / `start_web.py` 需要检查是否受影响
- CI/CD 脚本（`.github/workflows/`）需要同步更新
- Docker 构建不受影响（Docker 内有独立的文件系统）

### e2ee-wasm 模块

`backend/e2ee-wasm/` 是 workspace 成员（在 `Cargo.toml` 的 `members` 列表中），`CARGO_TARGET_DIR` 对它同样生效，产物会自动进入 `build/rust/`。

## 执行步骤

1. 创建 `build/` 目录结构
2. 创建 `scripts/set-build-env.sh`
3. 更新 `flutter/melos.yaml` 的 `build:web` 命令
4. 清理 `flutter/apps/web/` 残留编译文件
5. 更新根目录 `.gitignore`（添加 `build/`，清理重复规则）
6. 删除旧的编译目录（`backend/target/` 等）
7. 验证构建正常

## 验证清单

- [ ] `build/rust/` 目录存在
- [ ] `CARGO_TARGET_DIR` 设置后 `cargo build` 输出到 `build/rust/`
- [ ] `melos build:web` 输出到 `build/flutter/web/`
- [ ] `flutter/apps/web/out.js` 等残留文件已清理
- [ ] `.gitignore` 包含 `build/` 规则
- [ ] 旧的 `target/`、`build/` 目录已删除
- [ ] 后端和 Flutter 构建均正常
