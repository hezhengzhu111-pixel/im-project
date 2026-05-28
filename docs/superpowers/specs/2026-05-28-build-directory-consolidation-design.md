# 根目录 build/ 统一编译产物 + 全面清理设计

## 概述

在项目根目录创建 `build/` 目录，将 Rust 和 Flutter 的编译产物集中存放。同时全面清理 backend 和 flutter 中所有非源码、非必要配置的文件（生成文件、缓存、构建产物等），确保这两个目录只保留源码和必要配置。

## 背景

当前 backend 和 flutter 中存在大量非源码文件：

### backend/ 清理清单

| 文件/目录 | 大小 | 类型 | 处理 |
|-----------|------|------|------|
| `target/` | ~25GB | Rust 编译产物 | 迁移到 `build/rust/` |

其余（`Cargo.toml`、`Cargo.lock`、`API.md`、`scripts/`、`spring-ai/`）均为源码和必要配置，保留。

### flutter/ 清理清单

| 文件/目录 | 大小 | 类型 | 处理 |
|-----------|------|------|------|
| `apps/web/build/` | ~154MB | Flutter 编译输出 | 迁移到 `build/flutter/web/` |
| `apps/web/.dart_tool/` | ~114MB | Dart 工具缓存 | 删除（`flutter pub get` 重新生成） |
| `apps/web/.flutter-plugins` | 1.5KB | 生成文件（含本机绝对路径） | 删除 |
| `apps/web/.flutter-plugins-dependencies` | 4KB | 生成文件 | 删除 |
| `apps/web/out.js` | 192KB | 残留编译产物 | 删除 |
| `apps/web/out.js.deps` | 11KB | 残留编译产物 | 删除 |
| `apps/web/out.js.map` | 85KB | 残留编译产物 | 删除 |
| `apps/web/coverage/` | 24KB | 测试覆盖率报告 | 删除（可重新生成） |
| `apps/web/pubspec.lock` | 25KB | 依赖锁文件 | 删除 |
| `packages/core/.dart_tool/` | - | Dart 工具缓存 | 删除 |
| `packages/core/.flutter-plugins` | - | 生成文件 | 删除 |
| `packages/core/.flutter-plugins-dependencies` | - | 生成文件 | 删除 |
| `packages/core/build/` | - | 编译产物 | 删除 |
| `packages/core/pubspec.lock` | 9KB | 依赖锁文件 | 删除 |
| `packages/ui/.dart_tool/` | - | Dart 工具缓存 | 删除 |
| `packages/ui/.flutter-plugins` | - | 生成文件 | 删除（如存在） |
| `packages/ui/.flutter-plugins-dependencies` | - | 生成文件 | 删除（如存在） |
| `packages/ui/build/` | - | 编译产物 | 删除 |
| `packages/ui/pubspec.lock` | 18KB | 依赖锁文件 | 删除 |
| `native/rust/target/` | ~566MB | Rust 编译产物 | 迁移到 `build/rust/` |
| `native/rust/Cargo.lock` | 31KB | 依赖锁文件 | 删除 |

### 清理后保留的文件

**backend/** 只保留：
```
backend/
├── Cargo.toml              # workspace 配置
├── Cargo.lock              # 依赖锁文件（可重复构建）
├── .dockerignore           # Docker 配置
├── API.md                  # 文档
├── scripts/                # 构建脚本
├── spring-ai/              # Spring AI 模块（源码 + Maven 配置）
├── api-server-rs/          # 源码
├── im-server-rs/           # 源码
├── e2ee-core/              # 源码
├── e2ee-ffi/               # 源码
├── e2ee-wasm/              # 源码
└── common/                 # 源码
```

**flutter/** 只保留：
```
flutter/
├── .gitignore
├── melos.yaml              # monorepo 管理配置
├── flutter_rust_bridge.yaml # FRB 配置
├── start_web.py            # 开发启动脚本
├── start_web.sh            # 开发启动脚本
├── docs/
├── apps/web/
│   ├── lib/                # 源码
│   ├── test/               # 测试
│   ├── integration_test/   # 集成测试
│   ├── web/                # Web 资源
│   ├── pubspec.yaml        # 依赖声明
│   ├── l10n.yaml           # 国际化配置
│   └── Makefile            # 构建命令
├── packages/core/
│   ├── lib/                # 源码
│   ├── test/               # 测试
│   └── pubspec.yaml        # 依赖声明
├── packages/ui/
│   ├── lib/                # 源码
│   ├── test/               # 测试
│   └── pubspec.yaml        # 依赖声明
└── native/rust/
    ├── Cargo.toml          # Rust 配置
    └── src/                # 源码
```

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
├── backend/                            ← 只有源码 + 配置
├── flutter/                            ← 只有源码 + 配置
└── frontend/                           ← 不动（未来迁移后删除）
```

## 实现方式

### 1. Rust 编译产物重定向

通过 `CARGO_TARGET_DIR` 环境变量将 Rust 编译产物重定向到 `build/rust/` 下。

Cargo 的 `CARGO_TARGET_DIR` 只能通过环境变量设置，因此采用 shell 脚本包装。

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

`CARGO_TARGET_DIR` 是全局环境变量，workspace 成员（包括 `e2ee-wasm`）都会使用同一路径。

### 2. Flutter 编译产物重定向

在 `flutter/melos.yaml` 的 `build:web` 脚本中添加 `--output-dir`：

```yaml
scripts:
  build:web:
    run: melos exec --scope="im_web" -- flutter build web --output-dir=../../build/flutter/web
```

### 3. 删除旧的编译目录

```bash
# Rust
rm -rf backend/target/
rm -rf flutter/native/rust/target/

# Flutter
rm -rf flutter/apps/web/build/
rm -rf flutter/apps/web/.dart_tool/
rm -rf flutter/packages/core/.dart_tool/
rm -rf flutter/packages/core/build/
rm -rf flutter/packages/ui/.dart_tool/
rm -rf flutter/packages/ui/build/
```

### 4. 删除生成文件

这些文件由 `flutter pub get` 自动生成，删除后会重新生成：

```bash
# Flutter apps/web
rm -f flutter/apps/web/.flutter-plugins
rm -f flutter/apps/web/.flutter-plugins-dependencies
rm -f flutter/apps/web/out.js flutter/apps/web/out.js.deps flutter/apps/web/out.js.map
rm -rf flutter/apps/web/coverage/

# Flutter packages
rm -f flutter/packages/core/.flutter-plugins
rm -f flutter/packages/core/.flutter-plugins-dependencies
rm -f flutter/packages/ui/.flutter-plugins
rm -f flutter/packages/ui/.flutter-plugins-dependencies

# Flutter packages lock files
rm -f flutter/apps/web/pubspec.lock
rm -f flutter/packages/core/pubspec.lock
rm -f flutter/packages/ui/pubspec.lock
```

### 5. 删除 native/rust Cargo.lock

```bash
rm -f flutter/native/rust/Cargo.lock
```

### 6. 更新 .gitignore

在根目录 `.gitignore` 中确保包含：

```gitignore
# 统一编译产物目录
build/

# Rust
target/

# Flutter 生成文件
.flutter-plugins
.flutter-plugins-dependencies
.dart_tool/
pubspec.lock

# 编译残留
out.js
out.js.deps
out.js.map

# 测试覆盖率
coverage/
```

同时清理根 `.gitignore` 中的重复规则，合并为一份干净的配置。

## 注意事项

### 生成文件删除安全性

以下文件删除后会由工具自动重新生成，不影响功能：
- `.flutter-plugins` / `.flutter-plugins-dependencies` — `flutter pub get` 生成
- `.dart_tool/` — `flutter pub get` 生成
- `pubspec.lock` — `flutter pub get` 生成（仅库包；应用包建议保留）
- `coverage/` — `flutter test --coverage` 生成

### 构建脚本兼容性

- `start_web.sh` / `start_web.py` 需要检查是否受影响
- CI/CD 脚本（`.github/workflows/`）需要同步更新
- Docker 构建不受影响（Docker 内有独立的文件系统）

### e2ee-wasm 模块

`backend/e2ee-wasm/` 是 workspace 成员，`CARGO_TARGET_DIR` 对它同样生效，产物会自动进入 `build/rust/`。

## 执行步骤

1. 创建 `build/` 目录结构
2. 创建 `scripts/set-build-env.sh`
3. 更新 `flutter/melos.yaml` 的 `build:web` 命令
4. 删除旧的 Rust 编译目录（`backend/target/`、`flutter/native/rust/target/`）
5. 删除旧的 Flutter 编译目录（`build/`、`.dart_tool/`）
6. 删除生成文件（`.flutter-plugins*`、`out.js` 等）
7. 删除库包的 `pubspec.lock`
8. 删除 `flutter/native/rust/Cargo.lock`
9. 更新根目录 `.gitignore`（添加 `build/`，清理重复规则）
10. 验证：`flutter pub get` + `cargo build` + `melos build:web` 均正常

## 验证清单

- [ ] `build/rust/` 目录存在且 Rust 构建输出到此
- [ ] `build/flutter/web/` 目录存在且 Flutter 构建输出到此
- [ ] `backend/` 下无 `target/` 目录
- [ ] `flutter/` 下无 `target/`、`build/`、`.dart_tool/`、`.flutter-plugins*` 等
- [ ] `flutter/apps/web/out.js` 等残留文件已清理
- [ ] `.gitignore` 包含 `build/` 规则
- [ ] `flutter pub get` 正常运行并重新生成所需文件
- [ ] 后端 `cargo build` 正常
- [ ] Flutter `melos build:web` 正常
