# Git 清理实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将编译文件、依赖文件等从 Git 中排除，只保留源码和脚本，防止未来提交并清理当前跟踪的文件

**Architecture:** 采用分阶段执行方案：阶段 1 更新 `.gitignore` 并使用 `git rm --cached` 移除当前跟踪的文件；阶段 2（可选）使用 BFG Repo-Cleaner 清理 Git 历史

**Tech Stack:** Git, BFG Repo-Cleaner (阶段 2)

---

## 阶段 1：阻止未来提交 + 移除当前跟踪

### Task 1: 扫描项目，识别所有需要排除的文件

**Files:**
- 无文件创建/修改，仅执行扫描命令

- [ ] **Step 1: 扫描编译输出目录**

```bash
# 扫描所有 target/ 目录
find . -name "target" -type d 2>/dev/null

# 扫描所有 build/ 目录
find . -name "build" -type d 2>/dev/null

# 扫描所有 dist/ 目录
find . -name "dist" -type d 2>/dev/null

# 扫描所有 .dart_tool/ 目录
find . -name ".dart_tool" -type d 2>/dev/null
```

- [ ] **Step 2: 扫描依赖目录**

```bash
# 扫描所有 node_modules/ 目录
find . -name "node_modules" -type d 2>/dev/null

# 扫描所有 .venv/ 和 venv/ 目录
find . -name ".venv" -o -name "venv" -type d 2>/dev/null
```

- [ ] **Step 3: 扫描被 Git 跟踪的编译/依赖文件**

```bash
# 列出所有被跟踪的编译/依赖文件
git ls-files | grep -E "(target/|node_modules/|\.dart_tool/|build/|dist/|pubspec\.lock)"

# 统计数量
git ls-files | grep -E "(target/|node_modules/|\.dart_tool/|build/|dist/|pubspec\.lock)" | wc -l
```

- [ ] **Step 4: 记录扫描结果**

```bash
# 将扫描结果保存到临时文件
git ls-files | grep -E "(target/|node_modules/|\.dart_tool/|build/|dist/|pubspec\.lock)" > /tmp/files-to-remove.txt

# 检查文件列表
cat /tmp/files-to-remove.txt | head -20
```

- [ ] **Step 5: 提交扫描结果**

```bash
# 这个步骤只是记录，不需要提交
# 确认扫描结果后继续下一步
echo "扫描完成，发现 $(wc -l < /tmp/files-to-remove.txt) 个文件需要移除"
```

---

### Task 2: 更新根目录 .gitignore 文件

**Files:**
- Modify: `.gitignore`

- [ ] **Step 1: 读取当前 .gitignore 文件**

```bash
cat .gitignore
```

- [ ] **Step 2: 备份当前 .gitignore 文件**

```bash
cp .gitignore .gitignore.backup
```

- [ ] **Step 3: 更新 .gitignore 文件**

在 `.gitignore` 文件末尾添加以下内容：

```gitignore

# ===========================================
# 编译输出目录
# ===========================================
target/
build/
dist/
out/
.dart_tool/

# ===========================================
# 依赖目录
# ===========================================
node_modules/
.venv/
venv/
Pods/
.gradle/

# ===========================================
# 缓存文件
# ===========================================
*.log
*.tsbuildinfo
.cache
.parcel-cache
.eslintcache
.stylelintcache

# ===========================================
# 生成文件
# ===========================================
*.g.dart
*.freezed.dart
*.mocks.dart
*.config.dart

# ===========================================
# 环境变量文件
# ===========================================
.env
.env.local
.env.*.local

# ===========================================
# 测试覆盖率
# ===========================================
coverage/
.nyc_output

# ===========================================
# 操作系统文件
# ===========================================
.DS_Store
Thumbs.db
```

- [ ] **Step 4: 验证 .gitignore 更新**

```bash
# 检查文件是否已更新
tail -30 .gitignore
```

- [ ] **Step 5: 测试 .gitignore 是否生效**

```bash
# 创建一个测试文件
echo "test" > test-build.txt
git status test-build.txt

# 应该看到 "Untracked files" 中有 test-build.txt

# 删除测试文件
rm test-build.txt
```

---

### Task 3: 更新 flutter/.gitignore 文件

**Files:**
- Modify: `flutter/.gitignore`

- [ ] **Step 1: 读取当前 flutter/.gitignore 文件**

```bash
cat flutter/.gitignore
```

- [ ] **Step 2: 备份当前 flutter/.gitignore 文件**

```bash
cp flutter/.gitignore flutter/.gitignore.backup
```

- [ ] **Step 3: 检查是否需要补充规则**

```bash
# 检查是否已包含必要的规则
grep -E "(build/|\.dart_tool/|pubspec\.lock)" flutter/.gitignore
```

- [ ] **Step 4: 更新 flutter/.gitignore 文件（如果需要）**

如果缺少某些规则，在文件末尾添加：

```gitignore

# ===========================================
# 补充规则（从根目录 .gitignore 继承）
# ===========================================
build/
.dart_tool/
pubspec.lock

# 生成文件
*.g.dart
*.freezed.dart
*.mocks.dart
*.config.dart
```

- [ ] **Step 5: 验证 flutter/.gitignore 更新**

```bash
# 检查文件是否已更新
tail -20 flutter/.gitignore
```

---

### Task 4: 更新 frontend/apps/web/.gitignore 文件

**Files:**
- Modify: `frontend/apps/web/.gitignore`

- [ ] **Step 1: 读取当前 frontend/apps/web/.gitignore 文件**

```bash
cat frontend/apps/web/.gitignore
```

- [ ] **Step 2: 备份当前 frontend/apps/web/.gitignore 文件**

```bash
cp frontend/apps/web/.gitignore frontend/apps/web/.gitignore.backup
```

- [ ] **Step 3: 检查是否需要补充规则**

```bash
# 检查是否已包含必要的规则
grep -E "(node_modules/|dist/|build/)" frontend/apps/web/.gitignore
```

- [ ] **Step 4: 更新 frontend/apps/web/.gitignore 文件（如果需要）**

如果缺少某些规则，在文件末尾添加：

```gitignore

# ===========================================
# 补充规则（从根目录 .gitignore 继承）
# ===========================================
node_modules/
dist/
build/

# 缓存文件
*.tsbuildinfo
.cache
.parcel-cache
.eslintcache
.stylelintcache
```

- [ ] **Step 5: 验证 frontend/apps/web/.gitignore 更新**

```bash
# 检查文件是否已更新
tail -20 frontend/apps/web/.gitignore
```

---

### Task 5: 检查其他 .gitignore 文件

**Files:**
- 无文件创建/修改，仅检查

- [ ] **Step 1: 列出所有 .gitignore 文件**

```bash
find . -name ".gitignore" -type f 2>/dev/null
```

- [ ] **Step 2: 检查每个 .gitignore 文件的内容**

```bash
# 检查 backend/.gitignore（如果存在）
cat backend/.gitignore 2>/dev/null || echo "backend/.gitignore 不存在"

# 检查 scripts/.gitignore（如果存在）
cat scripts/.gitignore 2>/dev/null || echo "scripts/.gitignore 不存在"

# 检查 tests/.gitignore（如果存在）
cat tests/.gitignore 2>/dev/null || echo "tests/.gitignore 不存在"
```

- [ ] **Step 3: 确认所有必要的 .gitignore 文件已更新**

```bash
# 确认根目录 .gitignore 已更新
grep -E "(target/|build/|dist/|node_modules/)" .gitignore

# 确认 flutter/.gitignore 已更新
grep -E "(build/|\.dart_tool/|pubspec\.lock)" flutter/.gitignore

# 确认 frontend/apps/web/.gitignore 已更新
grep -E "(node_modules/|dist/|build/)" frontend/apps/web/.gitignore
```

---

### Task 6: 使用 git rm --cached 移除当前跟踪的文件

**Files:**
- 无文件创建/修改，仅执行 Git 命令

- [ ] **Step 1: 移除 Rust 编译目录**

```bash
# 移除 backend/target/
git rm --cached -r backend/target/ 2>/dev/null || echo "backend/target/ 未被跟踪"

# 移除 backend/e2ee-ffi/target/
git rm --cached -r backend/e2ee-ffi/target/ 2>/dev/null || echo "backend/e2ee-ffi/target/ 未被跟踪"

# 移除 flutter/native/rust/target/
git rm --cached -r flutter/native/rust/target/ 2>/dev/null || echo "flutter/native/rust/target/ 未被跟踪"
```

- [ ] **Step 2: 移除 Flutter 构建目录**

```bash
# 移除 flutter/apps/web/build/
git rm --cached -r flutter/apps/web/build/ 2>/dev/null || echo "flutter/apps/web/build/ 未被跟踪"

# 移除 flutter/apps/web/.dart_tool/
git rm --cached -r flutter/apps/web/.dart_tool/ 2>/dev/null || echo "flutter/apps/web/.dart_tool/ 未被跟踪"

# 移除 flutter/packages/core/build/
git rm --cached -r flutter/packages/core/build/ 2>/dev/null || echo "flutter/packages/core/build/ 未被跟踪"

# 移除 flutter/packages/core/.dart_tool/
git rm --cached -r flutter/packages/core/.dart_tool/ 2>/dev/null || echo "flutter/packages/core/.dart_tool/ 未被跟踪"
```

- [ ] **Step 3: 移除其他编译/依赖文件**

```bash
# 移除 pubspec.lock 文件
git rm --cached flutter/apps/web/pubspec.lock 2>/dev/null || echo "flutter/apps/web/pubspec.lock 未被跟踪"
git rm --cached flutter/packages/core/pubspec.lock 2>/dev/null || echo "flutter/packages/core/pubspec.lock 未被跟踪"

# 注意：Cargo.lock 保留，不执行 git rm --cached backend/Cargo.lock
```

- [ ] **Step 4: 移除其他可能被跟踪的文件**

```bash
# 使用循环移除所有匹配的文件
for file in $(git ls-files | grep -E "(target/|node_modules/|\.dart_tool/|build/|dist/)"); do
    git rm --cached "$file" 2>/dev/null
done
```

- [ ] **Step 5: 验证移除结果**

```bash
# 检查是否还有编译文件被跟踪
git ls-files | grep -E "(target/|node_modules/|\.dart_tool/|build/|dist/|pubspec\.lock)"

# 应该返回空列表
```

---

### Task 7: 提交变更

**Files:**
- 无文件创建/修改，仅执行 Git 命令

- [ ] **Step 1: 检查当前 Git 状态**

```bash
git status
```

- [ ] **Step 2: 添加所有变更到暂存区**

```bash
git add .
```

- [ ] **Step 3: 检查暂存区内容**

```bash
git status
```

- [ ] **Step 4: 提交变更**

```bash
git commit -m "chore: remove build artifacts and dependencies from tracking

- Update .gitignore to exclude build outputs, dependencies, and caches
- Remove tracked build artifacts using git rm --cached
- Prevent future tracking of compiled files and dependencies

This change does not affect local development, only Git tracking."
```

- [ ] **Step 5: 验证提交**

```bash
git log --oneline -1
```

---

### Task 8: 验证阶段 1 结果

**Files:**
- 无文件创建/修改，仅执行验证命令

- [ ] **Step 1: 验证编译文件不再被跟踪**

```bash
# 检查是否还有编译文件被跟踪
git ls-files | grep -E "(target/|node_modules/|\.dart_tool/|build/|dist/|pubspec\.lock)"

# 应该返回空列表
```

- [ ] **Step 2: 验证 .gitignore 生效**

```bash
# 创建测试文件
echo "test" > test-build.txt
echo "test" > test-node-modules.txt

# 检查 git status
git status

# 应该看到测试文件在 "Untracked files" 中

# 删除测试文件
rm test-build.txt test-node-modules.txt
```

- [ ] **Step 3: 验证本地文件仍然存在**

```bash
# 检查本地文件是否仍然存在
ls -la backend/target/
ls -la flutter/apps/web/build/
ls -la flutter/native/rust/target/
```

- [ ] **Step 4: 检查仓库状态**

```bash
# 检查 Git 状态
git status

# 应该看到 "nothing to commit, working tree clean"
```

- [ ] **Step 5: 记录阶段 1 完成**

```bash
echo "阶段 1 完成："
echo "- .gitignore 文件已更新"
echo "- 编译文件已从 Git 跟踪中移除"
echo "- 本地文件仍然存在"
echo "- 未来的新文件会被 .gitignore 排除"
```

---

## 阶段 2：清理 Git 历史（可选）

**注意：** 阶段 2 是可选的。如果仓库体积已经可以接受，可以跳过此阶段。

### Task 9: 备份仓库（阶段 2 前置条件）

**Files:**
- 无文件创建/修改，仅执行备份命令

- [ ] **Step 1: 本地备份 .git 目录**

```bash
# 备份当前 .git 目录
cp -r .git .git.backup

# 验证备份
ls -la .git.backup
```

- [ ] **Step 2: 推送到远程仓库作为备份（可选但推荐）**

```bash
# 推送当前分支到远程备份分支
git push origin main:backup-before-cleanup

# 验证远程备份
git branch -r | grep backup-before-cleanup
```

- [ ] **Step 3: 确认备份完成**

```bash
echo "备份完成："
echo "- 本地备份：.git.backup"
echo "- 远程备份：backup-before-cleanup"
```

---

### Task 10: 生成需要删除的文件列表

**Files:**
- Create: `files-to-delete.txt`（临时文件）

- [ ] **Step 1: 生成文件列表**

```bash
# 生成需要删除的文件列表
git ls-files | grep -E "(target/|node_modules/|\.dart_tool/|build/|dist/|pubspec\.lock)" > files-to-delete.txt

# 检查文件列表
cat files-to-delete.txt
```

- [ ] **Step 2: 统计文件数量**

```bash
# 统计文件数量
wc -l files-to-delete.txt
```

- [ ] **Step 3: 验证文件列表**

```bash
# 检查文件列表是否包含 Cargo.lock（不应该包含）
grep "Cargo.lock" files-to-delete.txt

# 应该返回空，因为 Cargo.lock 被保留
```

---

### Task 11: 使用 BFG 清理 Git 历史

**Files:**
- 无文件创建/修改，仅执行 BFG 命令

- [ ] **Step 1: 下载 BFG Repo-Cleaner（如果还没有）**

```bash
# 检查是否已下载 BFG
ls -la bfg*.jar 2>/dev/null || echo "BFG 未下载"

# 如果未下载，从 Maven Central 下载
wget https://repo1.maven.org/maven2/com/madgag/bfg/2.2.29/bfg-2.2.29.jar -O bfg.jar
```

- [ ] **Step 2: 按目录删除（推荐方式）**

```bash
# 删除 target/ 目录
java -jar bfg.jar --delete-folders "target" .

# 删除 node_modules/ 目录
java -jar bfg.jar --delete-folders "node_modules" .

# 删除 .dart_tool/ 目录
java -jar bfg.jar --delete-folders ".dart_tool" .

# 删除 build/ 目录
java -jar bfg.jar --delete-folders "build" .

# 删除 dist/ 目录
java -jar bfg.jar --delete-folders "dist" .
```

- [ ] **Step 3: 或者按文件列表删除（替代方式）**

```bash
# 使用文件列表删除
java -jar bfg.jar --delete-files files-to-delete.txt .
```

- [ ] **Step 4: 清理 Git 数据**

```bash
# 清理 reflog
git reflog expire --expire=now --all

# 清理未使用的对象
git gc --prune=now --aggressive
```

- [ ] **Step 5: 验证清理结果**

```bash
# 检查仓库大小变化
du -sh .git

# 检查历史中是否还有编译文件
git log --all --pretty=format: --name-only --diff-filter=A | grep -E "(target/|node_modules/|\.dart_tool/|build/|dist/)" | head -10

# 应该返回空或很少的结果
```

---

### Task 12: 推送清理后的历史

**Files:**
- 无文件创建/修改，仅执行 Git 命令

- [ ] **Step 1: 推送所有分支**

```bash
# 推送所有分支（需要 force push）
git push origin --force --all
```

- [ ] **Step 2: 推送所有标签**

```bash
# 推送所有标签（需要 force push）
git push origin --force --tags
```

- [ ] **Step 3: 验证推送成功**

```bash
# 检查远程分支
git branch -r

# 检查远程标签
git tag -l
```

---

### Task 13: 通知协开发者

**Files:**
- 无文件创建/修改，仅发送通知

- [ ] **Step 1: 准备通知消息**

```bash
cat << 'EOF'
Git 仓库历史已清理，需要重新克隆：

1. 删除旧的本地仓库
2. 重新克隆：git clone <repo-url>
3. 不要尝试 pull 或 merge 旧分支

清理内容：
- 编译文件（target/, build/, dist/）
- 依赖目录（node_modules/）
- 缓存文件（.dart_tool/）

注意事项：
- 所有旧的 commit hash 已改变
- 分支和标签已指向新的 commit
- 必须重新克隆，不能使用 pull 或 merge
EOF
```

- [ ] **Step 2: 记录通知完成**

```bash
echo "通知已发送给所有协开发者"
echo "请确保所有人已知晓并同意重新克隆"
```

---

### Task 14: 验证阶段 2 结果

**Files:**
- 无文件创建/修改，仅执行验证命令

- [ ] **Step 1: 验证历史清理结果**

```bash
# 检查历史中是否还有编译文件
git log --all --pretty=format: --name-only --diff-filter=A | grep -E "(target/|node_modules/|\.dart_tool/|build/|dist/)" | wc -l

# 应该返回 0 或很少的结果
```

- [ ] **Step 2: 验证仓库大小**

```bash
# 检查 .git 目录大小
du -sh .git

# 对比清理前的大小（如果有记录）
```

- [ ] **Step 3: 验证克隆速度**

```bash
# 测试克隆速度（可选）
time git clone --depth 1 <repo-url> /tmp/test-clone

# 清理测试目录
rm -rf /tmp/test-clone
```

- [ ] **Step 4: 确认所有协开发者已重新克隆**

```bash
echo "请确认所有协开发者已重新克隆仓库"
echo "如果有任何人仍在使用旧仓库，请通知他们重新克隆"
```

---

## 回滚方案（如果需要）

### Task 15: 回滚阶段 1（如果需要）

**Files:**
- 无文件创建/修改，仅执行回滚命令

- [ ] **Step 1: 恢复 .gitignore 文件**

```bash
# 恢复根目录 .gitignore
cp .gitignore.backup .gitignore

# 恢复 flutter/.gitignore
cp flutter/.gitignore.backup flutter/.gitignore

# 恢复 frontend/apps/web/.gitignore
cp frontend/apps/web/.gitignore.backup frontend/apps/web/.gitignore
```

- [ ] **Step 2: 重新添加文件到 Git 跟踪**

```bash
# 重新添加所有文件
git add .

# 提交回滚
git commit -m "revert: restore build artifacts tracking"
```

- [ ] **Step 3: 验证回滚结果**

```bash
# 检查文件是否重新被跟踪
git ls-files | grep -E "(target/|build/|dist/)" | head -10
```

---

### Task 16: 回滚阶段 2（如果需要）

**Files:**
- 无文件创建/修改，仅执行回滚命令

- [ ] **Step 1: 使用本地备份恢复**

```bash
# 删除当前 .git 目录
rm -rf .git

# 恢复备份
mv .git.backup .git

# 验证恢复
git log --oneline -5
```

- [ ] **Step 2: 使用远程备份恢复（如果本地备份失败）**

```bash
# 强制推送远程备份到 main 分支
git push origin --force backup-before-cleanup:main
```

- [ ] **Step 3: 通知协开发者回滚**

```bash
echo "Git 仓库已回滚到清理前的状态"
echo "请通知所有协开发者恢复使用旧仓库"
```

---

## 完成确认

### Task 17: 最终验证和清理

**Files:**
- Delete: `files-to-delete.txt`（临时文件）
- Delete: `*.backup` 文件（可选）

- [ ] **Step 1: 最终验证阶段 1 结果**

```bash
# 检查编译文件是否不再被跟踪
git ls-files | grep -E "(target/|node_modules/|\.dart_tool/|build/|dist/|pubspec\.lock)"

# 应该返回空列表

# 检查 .gitignore 是否生效
git status

# 应该看到 "nothing to commit, working tree clean"
```

- [ ] **Step 2: 清理临时文件**

```bash
# 删除临时文件列表
rm -f files-to-delete.txt

# 删除备份文件（可选）
rm -f .gitignore.backup
rm -f flutter/.gitignore.backup
rm -f frontend/apps/web/.gitignore.backup
```

- [ ] **Step 3: 记录完成状态**

```bash
cat << 'EOF'
Git 清理完成！

阶段 1（已完成）：
✓ .gitignore 文件已更新
✓ 编译文件已从 Git 跟踪中移除
✓ 本地文件仍然存在
✓ 未来的新文件会被 .gitignore 排除

阶段 2（可选，未执行）：
- 如果需要彻底清理历史，可以执行阶段 2
- 阶段 2 需要通知所有协开发者重新克隆

下一步建议：
1. 监控仓库大小变化
2. 如果体积仍然太大，考虑执行阶段 2
3. 通知团队成员新的 Git 工作流程
EOF
```

---

## 总结

本实施计划分为两个阶段：

**阶段 1（必须执行）：**
- 更新所有 `.gitignore` 文件
- 使用 `git rm --cached` 移除当前跟踪的编译文件
- 提交变更，让仓库进入"干净"状态
- 预计时间：25-40 分钟

**阶段 2（可选执行）：**
- 使用 BFG Repo-Cleaner 清理 Git 历史
- 减小仓库体积
- 需要通知所有协开发者重新克隆
- 预计时间：35-65 分钟

建议先执行阶段 1，观察一段时间后，如果仓库体积仍然太大，再执行阶段 2。
