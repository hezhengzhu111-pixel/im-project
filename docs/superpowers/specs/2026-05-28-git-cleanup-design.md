# Git 清理设计文档

## 概述

本文档描述了如何将编译文件、依赖文件等从 Git 中排除，只保留源码和脚本。采用分阶段执行方案，既要清理历史记录，也要防止未来提交。

## 背景

当前项目中有 **2850 个编译/依赖文件**被 Git 跟踪，主要集中在：
- `flutter/native` 目录（2818 个文件，主要是 Rust target）
- `flutter/apps` 目录（18 个文件，build 目录）
- `flutter/packages` 目录（13 个文件）
- `backend/e2ee-ffi` 目录（1 个文件）

这些文件：
- 不应该被版本控制
- 增加了仓库体积
- 导致克隆速度变慢
- 可能包含敏感信息（如本地配置）

## 方案选择

采用**分阶段执行方案**（方案 2），原因：
1. **安全性**：分步执行，可以随时停止
2. **可控性**：先阻止未来提交，再评估是否需要清理历史
3. **团队协作**：给团队时间适应，不需要立即重新克隆
4. **灵活性**：如果仓库体积可接受，可以只做第一阶段

## 阶段 1：阻止未来提交 + 移除当前跟踪

### 目标
- 更新所有 `.gitignore` 文件，确保编译文件和依赖文件不再被跟踪
- 使用 `git rm --cached` 移除当前已被跟踪的文件
- 提交变更，让仓库进入"干净"状态

### 步骤

#### 1. 全面扫描，识别需要排除的文件类型

扫描项目中所有目录，识别以下类型的文件/目录：

**编译输出目录：**
- `target/`（Rust 编译目录）
- `build/`（Flutter、Node.js 构建目录）
- `dist/`（前端构建输出）
- `.dart_tool/`（Dart 工具目录）
- `out/`（其他构建输出）

**依赖目录：**
- `node_modules/`（Node.js 依赖）
- `.venv/`、`venv/`（Python 虚拟环境）
- `Pods/`（iOS CocoaPods 依赖）
- `.gradle/`（Android Gradle 缓存）

**缓存文件：**
- `*.log`（日志文件）
- `*.tsbuildinfo`（TypeScript 编译缓存）
- `.cache`、`.parcel-cache`（各种缓存）
- `.eslintcache`、`.stylelintcache`（代码检查缓存）

**生成文件：**
- `*.g.dart`（Dart 代码生成）
- `*.freezed.dart`（Freezed 代码生成）
- `*.mocks.dart`（Mock 代码生成）
- `*.config.dart`（配置代码生成）

**其他：**
- `pubspec.lock`（Dart 依赖锁文件）
- `Cargo.lock`（Rust 依赖锁文件）- **决策：保留**，因为 Cargo.lock 对可重复构建很重要
- `.env`、`.env.local`（环境变量文件）
- `coverage/`（测试覆盖率报告）

#### 2. 更新 `.gitignore` 文件

需要更新的文件：

**根目录 `.gitignore`：**
添加通用规则，覆盖所有子项目：

```gitignore
# 编译输出
target/
build/
dist/
out/
.dart_tool/

# 依赖目录
node_modules/
.venv/
venv/
Pods/
.gradle/

# 缓存文件
*.log
*.tsbuildinfo
.cache
.parcel-cache
.eslintcache
.stylelintcache

# 生成文件
*.g.dart
*.freezed.dart
*.mocks.dart
*.config.dart

# 环境变量
.env
.env.local
.env.*.local

# 测试覆盖率
coverage/
.nyc_output

# 操作系统文件
.DS_Store
Thumbs.db
```

**`flutter/.gitignore`：**
已存在，但可能需要补充：
- 确保包含 `build/`、`.dart_tool/`、`pubspec.lock`
- 确保包含生成文件规则

**`frontend/apps/web/.gitignore`：**
已存在，但可能需要补充：
- 确保包含 `node_modules/`、`dist/`、`build/`
- 确保包含缓存文件规则

**其他子目录的 `.gitignore`：**
检查是否存在其他 `.gitignore` 文件，确保规则一致。

#### 3. 执行 `git rm --cached`

对每个需要排除的文件/目录执行：

```bash
# 移除 Rust 编译目录
git rm --cached -r backend/target/
git rm --cached -r backend/e2ee-ffi/target/
git rm --cached -r flutter/native/rust/target/

# 移除 Flutter 构建目录
git rm --cached -r flutter/apps/web/build/
git rm --cached -r flutter/apps/web/.dart_tool/
git rm --cached -r flutter/packages/core/build/
git rm --cached -r flutter/packages/core/.dart_tool/

# 移除其他编译/依赖文件
git rm --cached flutter/apps/web/pubspec.lock
# 注意：Cargo.lock 保留，不执行 git rm --cached backend/Cargo.lock

# 移除其他可能被跟踪的文件
git rm --cached -r $(git ls-files | grep -E "(target/|node_modules/|\.dart_tool/|build/|dist/)" | awk -F'/' '{print $1"/"$2}' | sort -u)
```

**注意：**
- `git rm --cached` 只是从 Git 跟踪中移除，不会删除本地文件
- 使用 `-r` 选项递归删除目录

#### 4. 提交变更

```bash
# 添加所有变更
git add .

# 提交
git commit -m "chore: remove build artifacts and dependencies from tracking

- Update .gitignore to exclude build outputs, dependencies, and caches
- Remove tracked build artifacts using git rm --cached
- Prevent future tracking of compiled files and dependencies

This change does not affect local development, only Git tracking."
```

### 预期结果
- 所有编译文件和依赖文件不再被 Git 跟踪
- 本地文件仍然存在，但 Git 不再管理它们
- 未来的新文件会自动被 `.gitignore` 排除
- 仓库进入"干净"状态

### 验证

执行以下命令验证：

```bash
# 检查是否还有编译文件被跟踪
git ls-files | grep -E "(target/|node_modules/|\.dart_tool/|build/|dist/|pubspec\.lock)"

# 应该返回空列表

# 检查 .gitignore 是否生效
git status

# 应该看不到编译文件的变更
```

## 阶段 2：清理 Git 历史（可选）

### 目标
- 使用 BFG Repo-Cleaner 从 Git 历史中彻底删除编译文件和依赖文件
- 减小仓库体积
- 让克隆仓库时不需要下载这些历史文件

### 前置条件
- 阶段 1 已完成并提交
- 仓库已备份（重要！）
- 所有协作者已知晓并同意重新克隆

### 步骤

#### 1. 备份仓库

```bash
# 备份当前仓库（本地备份）
cp -r .git .git.backup

# 或者更安全的方式：推送到远程仓库作为备份
git push origin main:backup-before-cleanup
```

#### 2. 创建需要删除的文件列表

```bash
# 生成文件列表
git ls-files | grep -E "(target/|node_modules/|\.dart_tool/|build/|dist/|pubspec\.lock)" > files-to-delete.txt

# 检查文件列表
cat files-to-delete.txt
```

#### 3. 使用 BFG 清理

```bash
# 下载 BFG（如果还没有）
# https://rtyley.github.io/bfg-repo-cleaner/

# 执行清理 - 按文件列表删除
java -jar bfg.jar --delete-files files-to-delete.txt .

# 或者按目录删除（更简单）
java -jar bfg.jar --delete-folders "target" .
java -jar bfg.jar --delete-folders "node_modules" .
java -jar bfg.jar --delete-folders ".dart_tool" .
java -jar bfg.jar --delete-folders "build" .
java -jar bfg.jar --delete-folders "dist" .
```

**BFG 命令说明：**
- `--delete-files`：按文件名删除
- `--delete-folders`：按目录名删除
- `.`：当前目录（仓库）

#### 4. 清理和推送

```bash
# 清理 Git 数据
git reflog expire --expire=now --all
git gc --prune=now --aggressive

# 推送清理后的历史（需要 force push）
git push origin --force --all
git push origin --force --tags
```

**警告：**
- `--force` 会覆盖远程仓库的历史
- 所有协作者必须重新克隆

#### 5. 通知协开发者

发送消息通知所有协作者：

```
Git 仓库历史已清理，需要重新克隆：

1. 删除旧的本地仓库
2. 重新克隆：git clone <repo-url>
3. 不要尝试 pull 或 merge 旧分支

清理内容：编译文件、依赖目录、缓存文件
```

所有协作者需要执行：

```bash
# 删除旧的本地仓库
rm -rf <repo>

# 重新克隆
git clone <repo-url>
```

### 预期结果
- 仓库历史中不再包含编译文件和依赖文件
- 仓库体积显著减小（可能减少 50-90%）
- 新克隆的仓库更小、更快
- 克隆时间显著减少

### 风险和注意事项

**破坏性操作：**
- 会重写 Git 历史
- 所有旧的 commit hash 会改变
- 分支和标签会指向新的 commit

**需要 force push：**
- 会影响所有协作者
- 必须通知所有人重新克隆

**不可逆：**
- 一旦执行，无法恢复旧历史
- 备份是唯一的安全网

**需要所有协作者重新克隆：**
- 不能使用 `git pull` 或 `git merge`
- 必须删除旧仓库，重新克隆

### 回滚方案

如果清理后出现问题：

```bash
# 使用备份恢复
rm -rf .git
mv .git.backup .git

# 或者从远程备份恢复
git push origin --force backup-before-cleanup:main
```

## 文件列表

### 需要更新的 `.gitignore` 文件

1. `/.gitignore`（根目录）
2. `/flutter/.gitignore`
3. `/frontend/apps/web/.gitignore`
4. 其他子目录的 `.gitignore`（如果存在）

### 需要排除的文件类型

**编译输出目录：**
- `target/`
- `build/`
- `dist/`
- `out/`
- `.dart_tool/`

**依赖目录：**
- `node_modules/`
- `.venv/`
- `venv/`
- `Pods/`
- `.gradle/`

**缓存文件：**
- `*.log`
- `*.tsbuildinfo`
- `.cache`
- `.parcel-cache`
- `.eslintcache`
- `.stylelintcache`

**生成文件：**
- `*.g.dart`
- `*.freezed.dart`
- `*.mocks.dart`
- `*.config.dart`

**其他：**
- `pubspec.lock`
- `.env`
- `.env.local`
- `.env.*.local`
- `coverage/`
- `.nyc_output`
- `.DS_Store`
- `Thumbs.db`

## 验证清单

### 阶段 1 验证

- [ ] 所有 `.gitignore` 文件已更新
- [ ] `git rm --cached` 已执行
- [ ] 变更已提交
- [ ] `git ls-files | grep -E "(target/|node_modules/|\.dart_tool/|build/|dist/)"` 返回空
- [ ] `git status` 看不到编译文件变更

### 阶段 2 验证（如果执行）

- [ ] 仓库已备份
- [ ] 协作者已通知
- [ ] BFG 已执行
- [ ] Git 数据已清理
- [ ] 已 force push
- [ ] 所有协作者已重新克隆
- [ ] 仓库体积已减小

## 时间估算

### 阶段 1
- 全面扫描：10-15 分钟
- 更新 `.gitignore`：5-10 分钟
- 执行 `git rm --cached`：5-10 分钟
- 提交和验证：5 分钟
- **总计：25-40 分钟**

### 阶段 2（可选）
- 备份：5 分钟
- 生成文件列表：5 分钟
- 执行 BFG：10-30 分钟（取决于仓库大小）
- 清理和推送：10-20 分钟
- 通知协作者：5 分钟
- **总计：35-65 分钟**

## 总结

本方案采用分阶段执行，先阻止未来提交，再评估是否需要清理历史。这样可以：
1. 立即获得好处（不再跟踪编译文件）
2. 给团队时间适应
3. 灵活决定是否需要彻底清理历史

建议先执行阶段 1，观察一段时间后，如果仓库体积仍然太大，再执行阶段 2。
