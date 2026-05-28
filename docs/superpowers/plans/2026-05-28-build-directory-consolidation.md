# Build Directory Consolidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将所有编译产物集中到根目录 `build/`，清理 backend 和 flutter 中所有非源码文件，只保留源码和必要配置。

**Architecture:** Rust 编译通过 `CARGO_TARGET_DIR` 环境变量重定向到 `build/rust/`，Flutter 编译通过 `--output-dir` 参数重定向到 `build/flutter/web/`。同时删除所有生成文件、缓存和残留编译产物。

**Tech Stack:** Cargo (Rust), Flutter/Dart, melos (monorepo), bash scripts

---

## File Structure

| 操作 | 文件 | 说明 |
|------|------|------|
| Create | `build/.gitkeep` | 确保空目录被 git 跟踪 |
| Create | `scripts/set-build-env.sh` | 设置 CARGO_TARGET_DIR 环境变量 |
| Modify | `flutter/melos.yaml:11` | build:web 添加 --output-dir |
| Modify | `.gitignore` | 添加 build/ 规则，清理重复项 |
| Delete | `backend/target/` | Rust 编译产物 (~25GB) |
| Delete | `backend/e2ee-ffi/target/` | Rust 编译产物 (64KB) |
| Delete | `flutter/native/rust/target/` | Rust 编译产物 (~566MB) |
| Delete | `flutter/apps/web/build/` | Flutter 编译产物 (~154MB) |
| Delete | `flutter/apps/web/.dart_tool/` | Dart 工具缓存 (~114MB) |
| Delete | `flutter/apps/web/.flutter-plugins` | 生成文件 |
| Delete | `flutter/apps/web/.flutter-plugins-dependencies` | 生成文件 |
| Delete | `flutter/apps/web/out.js` + `.deps` + `.map` | 残留编译产物 |
| Delete | `flutter/apps/web/coverage/` | 测试覆盖率 |
| Delete | `flutter/apps/web/pubspec.lock` | 依赖锁文件 |
| Delete | `flutter/packages/core/.dart_tool/` | Dart 工具缓存 |
| Delete | `flutter/packages/core/.flutter-plugins` | 生成文件 |
| Delete | `flutter/packages/core/.flutter-plugins-dependencies` | 生成文件 |
| Delete | `flutter/packages/core/build/` | 编译产物 |
| Delete | `flutter/packages/core/pubspec.lock` | 依赖锁文件 |
| Delete | `flutter/packages/ui/.dart_tool/` | Dart 工具缓存 |
| Delete | `flutter/packages/ui/.flutter-plugins` | 生成文件（如存在） |
| Delete | `flutter/packages/ui/.flutter-plugins-dependencies` | 生成文件（如存在） |
| Delete | `flutter/packages/ui/build/` | 编译产物 |
| Delete | `flutter/packages/ui/pubspec.lock` | 依赖锁文件 |
| Delete | `flutter/native/rust/Cargo.lock` | 依赖锁文件 |

---

### Task 1: 创建 build 目录结构

**Files:**
- Create: `build/.gitkeep`

- [ ] **Step 1: 创建目录结构**

```bash
mkdir -p build/rust build/flutter
touch build/.gitkeep
```

- [ ] **Step 2: 确认目录存在**

```bash
ls -la build/
```

Expected: `rust/` 和 `flutter/` 目录存在

- [ ] **Step 3: Commit**

```bash
git add build/.gitkeep
git commit -m "chore: create unified build directory structure"
```

---

### Task 2: 创建 CARGO_TARGET_DIR 脚本

**Files:**
- Create: `scripts/set-build-env.sh`

- [ ] **Step 1: 创建脚本**

```bash
cat > scripts/set-build-env.sh << 'EOF'
#!/bin/bash
# 设置 Rust 编译产物输出目录
# 用法: source scripts/set-build-env.sh
#
# 设置后所有 cargo build 的产物会输出到项目根目录的 build/rust/ 下
# 适用于 backend workspace 和 flutter/native/rust

export CARGO_TARGET_DIR="$(git rev-parse --show-toplevel)/build/rust"
echo "CARGO_TARGET_DIR=$CARGO_TARGET_DIR"
EOF
chmod +x scripts/set-build-env.sh
```

- [ ] **Step 2: 验证脚本内容**

```bash
cat scripts/set-build-env.sh
```

Expected: 脚本内容正确，包含 `export CARGO_TARGET_DIR=...`

- [ ] **Step 3: Commit**

```bash
git add scripts/set-build-env.sh
git commit -m "chore: add CARGO_TARGET_DIR setup script for unified build directory"
```

---

### Task 3: 更新 melos.yaml 的 build:web 命令

**Files:**
- Modify: `flutter/melos.yaml:11`

- [ ] **Step 1: 修改 build:web 脚本**

将 `flutter/melos.yaml` 第 11 行：

```yaml
    run: melos exec --scope="im_web" -- flutter build web
```

改为：

```yaml
    run: melos exec --scope="im_web" -- flutter build web --output-dir=../../build/flutter/web
```

- [ ] **Step 2: 验证修改**

```bash
grep -A1 "build:web" flutter/melos.yaml
```

Expected: 输出包含 `--output-dir=../../build/flutter/web`

- [ ] **Step 3: Commit**

```bash
git add flutter/melos.yaml
git commit -m "chore: redirect Flutter web build output to root build/ directory"
```

---

### Task 4: 清理旧的 Rust 编译目录

**Files:**
- Delete: `backend/target/` (~25GB)
- Delete: `backend/e2ee-ffi/target/` (64KB)
- Delete: `flutter/native/rust/target/` (~566MB)

- [ ] **Step 1: 删除 backend/target/**

```bash
rm -rf backend/target/
```

- [ ] **Step 2: 删除 backend/e2ee-ffi/target/**

```bash
rm -rf backend/e2ee-ffi/target/
```

- [ ] **Step 3: 删除 flutter/native/rust/target/**

```bash
rm -rf flutter/native/rust/target/
```

- [ ] **Step 4: 确认已删除**

```bash
ls backend/target/ 2>&1 || echo "backend/target/ 已删除"
ls backend/e2ee-ffi/target/ 2>&1 || echo "backend/e2ee-ffi/target/ 已删除"
ls flutter/native/rust/target/ 2>&1 || echo "flutter/native/rust/target/ 已删除"
```

Expected: 三个目录都不存在

- [ ] **Step 5: Commit**

```bash
git add -u backend/target/ backend/e2ee-ffi/target/ flutter/native/rust/target/
git commit -m "chore: remove old Rust target directories (will use build/rust/)"
```

注意：这些目录已被 .gitignore 排除，可能不需要 git add。如果 git status 没有显示变更，跳过此 commit。

---

### Task 5: 清理 Flutter 生成文件和残留产物

**Files:**
- Delete: `flutter/apps/web/.dart_tool/` (~114MB)
- Delete: `flutter/apps/web/.flutter-plugins`
- Delete: `flutter/apps/web/.flutter-plugins-dependencies`
- Delete: `flutter/apps/web/out.js` + `.deps` + `.map`
- Delete: `flutter/apps/web/coverage/`
- Delete: `flutter/apps/web/pubspec.lock`
- Delete: `flutter/packages/core/.dart_tool/`
- Delete: `flutter/packages/core/.flutter-plugins`
- Delete: `flutter/packages/core/.flutter-plugins-dependencies`
- Delete: `flutter/packages/core/build/`
- Delete: `flutter/packages/core/pubspec.lock`
- Delete: `flutter/packages/ui/.dart_tool/`
- Delete: `flutter/packages/ui/.flutter-plugins` (如存在)
- Delete: `flutter/packages/ui/.flutter-plugins-dependencies` (如存在)
- Delete: `flutter/packages/ui/build/`
- Delete: `flutter/packages/ui/pubspec.lock`
- Delete: `flutter/native/rust/Cargo.lock`

- [ ] **Step 1: 删除 flutter/apps/web/ 生成文件**

```bash
rm -rf flutter/apps/web/.dart_tool/
rm -f flutter/apps/web/.flutter-plugins
rm -f flutter/apps/web/.flutter-plugins-dependencies
rm -f flutter/apps/web/out.js flutter/apps/web/out.js.deps flutter/apps/web/out.js.map
rm -rf flutter/apps/web/coverage/
rm -f flutter/apps/web/pubspec.lock
```

- [ ] **Step 2: 删除 flutter/packages/core/ 生成文件**

```bash
rm -rf flutter/packages/core/.dart_tool/
rm -f flutter/packages/core/.flutter-plugins
rm -f flutter/packages/core/.flutter-plugins-dependencies
rm -rf flutter/packages/core/build/
rm -f flutter/packages/core/pubspec.lock
```

- [ ] **Step 3: 删除 flutter/packages/ui/ 生成文件**

```bash
rm -rf flutter/packages/ui/.dart_tool/
rm -f flutter/packages/ui/.flutter-plugins
rm -f flutter/packages/ui/.flutter-plugins-dependencies
rm -rf flutter/packages/ui/build/
rm -f flutter/packages/ui/pubspec.lock
```

- [ ] **Step 4: 删除 flutter/native/rust/Cargo.lock**

```bash
rm -f flutter/native/rust/Cargo.lock
```

- [ ] **Step 5: 确认清理完成**

```bash
# 检查 flutter/apps/web/ 下是否还有非源码文件
ls -la flutter/apps/web/ | grep -E "\.dart_tool|\.flutter-plugins|out\.js|coverage|pubspec\.lock"
```

Expected: 无输出（所有生成文件已删除）

```bash
# 检查 flutter/packages/ 下是否还有生成文件
find flutter/packages/ -name ".dart_tool" -o -name ".flutter-plugins" -o -name "build" -o -name "pubspec.lock" 2>/dev/null
```

Expected: 无输出

- [ ] **Step 6: Commit**

```bash
git add -u flutter/
git commit -m "chore: clean up Flutter generated files, caches, and stale build artifacts

Remove .dart_tool/, .flutter-plugins*, build/, coverage/, pubspec.lock,
out.js and related files from flutter/ directory."
```

---

### Task 6: 更新根目录 .gitignore

**Files:**
- Modify: `.gitignore`

- [ ] **Step 1: 读取当前 .gitignore**

```bash
cat .gitignore
```

- [ ] **Step 2: 重写 .gitignore**

将根目录 `.gitignore` 重写为干净版本，合并重复规则：

```gitignore
# ===========================================
# 环境变量文件
# ===========================================
.env
.env.local
.env.*.local
.env.bak

# ===========================================
# 日志和运行时数据
# ===========================================
logs/
*.log

# ===========================================
# Python
# ===========================================
__pycache__/
*.py[cod]
.venv/
venv/

# ===========================================
# Rust 编译产物
# ===========================================
target/

# ===========================================
# 统一编译产物目录
# ===========================================
build/

# ===========================================
# Flutter/Dart 生成文件和缓存
# ===========================================
.dart_tool/
.flutter-plugins
.flutter-plugins-dependencies
pubspec.lock

# ===========================================
# 编译残留
# ===========================================
out.js
out.js.deps
out.js.map

# ===========================================
# 测试覆盖率
# ===========================================
coverage/
.nyc_output

# ===========================================
# 前端（未来移除）
# ===========================================
frontend/node_modules/
frontend/apps/*/node_modules/
frontend/packages/*/node_modules/
frontend/apps/*/dist/
frontend/packages/*/dist/
frontend/apps/*/coverage/
frontend/packages/*/coverage/
frontend/apps/mobile/android/.gradle/
frontend/apps/mobile/android/build/
frontend/apps/mobile/android/app/build/
frontend/apps/mobile/ios/Pods/
frontend/apps/mobile/ios/build/

# ===========================================
# IDE 和操作系统
# ===========================================
.idea/
.vscode/
.DS_Store
Thumbs.db

# ===========================================
# 临时文件
# ===========================================
tmp/
.deploy-tools/
init.md
.superpowers/

# ===========================================
# 生成文件
# ===========================================
*.g.dart
*.freezed.dart
*.mocks.dart
*.config.dart
*.tsbuildinfo
.cache
.parcel-cache
.eslintcache
.stylelintcache
```

- [ ] **Step 3: 验证新 .gitignore 包含关键规则**

```bash
grep -c "build/" .gitignore
grep -c "target/" .gitignore
grep -c "\.dart_tool/" .gitignore
grep -c "\.flutter-plugins" .gitignore
grep -c "pubspec\.lock" .gitignore
```

Expected: 每个 grep 返回 ≥1

- [ ] **Step 4: Commit**

```bash
git add .gitignore
git commit -m "chore: clean up root .gitignore, add build/ exclusion, remove duplicates"
```

---

### Task 7: 验证构建正常

**Files:**
- 无文件修改，纯验证

- [ ] **Step 1: 验证 Rust 构建（设置环境变量后）**

```bash
source scripts/set-build-env.sh
cd backend && cargo check 2>&1 | tail -5
```

Expected: 编译成功，产物输出到 `build/rust/`

- [ ] **Step 2: 确认 Rust 产物在 build/rust/ 下**

```bash
ls build/rust/
```

Expected: 看到 backend 相关的编译目录

- [ ] **Step 3: 验证 Flutter pub get 正常**

```bash
cd flutter/apps/web && flutter pub get 2>&1 | tail -5
```

Expected: 成功，`.flutter-plugins` 等文件被重新生成

- [ ] **Step 4: 清理 Step 3 重新生成的文件（这些是本地缓存，不需要提交）**

```bash
rm -f flutter/apps/web/.flutter-plugins
rm -f flutter/apps/web/.flutter-plugins-dependencies
rm -rf flutter/apps/web/.dart_tool/
rm -rf flutter/packages/core/.dart_tool/
rm -rf flutter/packages/ui/.dart_tool/
```

- [ ] **Step 5: 最终确认目录结构**

```bash
echo "=== backend/ ==="
ls backend/ | grep -v "^target"
echo ""
echo "=== flutter/ ==="
ls flutter/ | grep -v "^target\|^build"
echo ""
echo "=== flutter/apps/web/ ==="
ls flutter/apps/web/ | grep -v "\.dart_tool\|\.flutter-plugins\|out\.js\|coverage\|pubspec\.lock\|^build$"
echo ""
echo "=== build/ ==="
ls build/
```

Expected: backend 和 flutter 只显示源码和配置文件，build/ 目录存在
