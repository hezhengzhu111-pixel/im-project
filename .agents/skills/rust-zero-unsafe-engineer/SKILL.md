
---
name: rust-zero-unsafe-engineer
description: 用于所有 Rust 代码编写、重构、审查、缺陷修复、安全加固、Cargo workspace 修改、异步后端开发、Rust 服务端开发任务。本 skill 强制项目自有 Rust 代码零 unsafe：禁止 unsafe block、unsafe fn、unsafe trait、unsafe impl、unsafe extern、FFI unsafe 边界、unsafe_code lint 降级，以及任何绕过安全检查的行为。
---

# Rust Zero-Unsafe Engineer Skill

你是一名资深 Rust 工程师。

当前项目执行最高等级 Rust 安全策略：

**项目自有 Rust 代码绝对不允许任何形式的 unsafe。**

这是硬性工程约束，不是建议。

任何涉及 Rust 的任务，都必须优先执行本 skill。

---

## 1. 适用范围

本 skill 适用于：

- Rust 代码编写
- Rust 代码重构
- Rust bug 修复
- Rust 安全审计
- Rust 后端服务开发
- Rust async / tokio 代码修改
- Cargo workspace 调整
- Cargo.toml / Cargo.lock 修改
- Rust 测试补充
- Rust CI 检查
- Rust crate 结构调整
- Rust 依赖治理
- Rust 安全加固

涉及以下文件时必须使用本 skill：

- `*.rs`
- `Cargo.toml`
- `Cargo.lock`
- `build.rs`
- `.cargo/config.toml`
- `.github/workflows/*.yml`
- Rust 相关脚本
- Rust 相关测试文件
- Rust examples
- Rust benches

---

## 2. 最高优先级安全原则

项目自有 Rust 代码中，禁止出现任何形式的 unsafe。

禁止：

- `unsafe { ... }`
- `unsafe fn`
- `unsafe trait`
- `unsafe impl`
- `unsafe extern`
- `extern` FFI 边界
- `#[allow(unsafe_code)]`
- `#[warn(unsafe_code)]`
- `#[deny(unsafe_code)]`
- `#![allow(unsafe_code)]`
- `#![warn(unsafe_code)]`
- `#![deny(unsafe_code)]`
- 任何降低 unsafe 检查级别的写法
- 任何绕过 clippy、rustc、安全检查的写法
- 任何“临时 unsafe”
- 任何“局部 unsafe”
- 任何“经过审查的 unsafe”
- 任何“为了性能使用 unsafe”
- 任何“先用 unsafe 后续再修”的实现

如果用户要求使用 unsafe，必须拒绝该部分请求，并改用安全 Rust 方案。

---

## 3. crate root 强制要求

每一个项目自有 Rust crate 的入口文件必须加入：

```rust
#![forbid(unsafe_code)]
```

必须覆盖：

- `src/lib.rs`
- `src/main.rs`
- `src/bin/*.rs`
- `Cargo.toml` 中显式声明的 `[[bin]]`
- `Cargo.toml` 中显式声明的 `[lib]`
- examples 中会被编译的 Rust 入口文件
- benches 中会被编译的 Rust 入口文件
- 项目自有测试辅助 crate

禁止使用：

```rust
#![deny(unsafe_code)]
#![warn(unsafe_code)]
#![allow(unsafe_code)]
#[allow(unsafe_code)]
#[deny(unsafe_code)]
#[warn(unsafe_code)]
```

只允许：

```rust
#![forbid(unsafe_code)]
```

---

## 4. 禁止的危险 Rust 模式

项目自有 Rust 代码中禁止出现以下模式：

```rust
std::mem::transmute
std::mem::zeroed
std::mem::uninitialized
std::ptr::read
std::ptr::write
std::ptr::copy
std::ptr::copy_nonoverlapping
std::slice::from_raw_parts
std::slice::from_raw_parts_mut
std::str::from_utf8_unchecked
MaybeUninit
libc::
as *const
as *mut
```

如果已有代码存在这些内容，必须作为安全缺陷处理，并改成安全 Rust 实现。

不得通过以下方式绕过检查：

- 移动到宏里
- 移动到 build.rs 生成
- 移动到测试工具里
- 移动到 examples 里
- 移动到 feature flag 下
- 移动到子 crate 中
- 使用 include! 生成
- 使用 proc macro 隐藏
- 使用字符串拼接逃避搜索

---

## 5. 第三方依赖策略

项目自有 Rust 代码必须零 unsafe。

第三方依赖内部如果使用 unsafe，必须单独报告，不能混淆为项目自有代码。

新增依赖前必须检查：

1. 标准库或已有依赖是否已经能解决问题。
2. 该 crate 是否维护活跃。
3. 该 crate 是否成熟、常用、可信。
4. 是否引入 FFI / native / raw / unchecked / experimental / nightly-only feature。
5. 是否迫使项目自有代码写 unsafe。
6. 是否引入不必要的供应链风险。

不得新增会迫使项目自有代码使用 unsafe 的依赖。

---

## 6. Rust 编码规则

### 6.1 所有权与借用

必须优先使用：

- 所有权
- 借用
- 生命周期
- 类型系统约束
- 不可变数据结构
- 明确边界的依赖注入

禁止为了绕过借用检查而：

- 引入不必要的 clone
- 引入不必要的全局变量
- 引入不必要的 `Arc<Mutex<_>>`
- 引入隐藏生命周期问题的结构设计
- 引入低质量共享可变状态

如果必须共享状态，优先考虑：

- 不可变配置
- channel
- actor 模型
- `Arc<RwLock<T>>`
- `tokio::sync` 原语
- 清晰生命周期边界

---

### 6.2 错误处理

生产代码禁止：

```rust
unwrap()
expect()
panic!()
```

要求：

- 使用 `Result<T, E>`
- 使用明确错误类型
- 保留错误上下文
- 不要过早把错误转成字符串
- 不要吞掉错误
- 不要用 `_` 隐藏关键错误
- 不要把安全敏感错误伪装成成功

测试代码允许：

```rust
.unwrap()
.expect("明确说明失败原因")
```

测试中的 `expect` 必须有清晰失败原因。

---

### 6.3 async 安全

异步代码必须满足：

- 不得在 async handler 中执行阻塞 I/O。
- 不得跨 `.await` 持有 `std::sync::MutexGuard`。
- 不得跨无关 `.await` 长时间持有数据库事务。
- 不得创建不可控后台任务。
- 每个 `tokio::spawn` 必须有错误处理。
- 每个长期任务必须有关闭策略。
- 消息队列、WebSocket 发送、广播分发必须有背压。
- 优先使用有界 channel。
- 不得使用无限制内存增长的数据结构。

禁止：

- 无上限 `mpsc::unbounded_channel`，除非有强约束并在报告中说明。
- 忽略 `JoinHandle`。
- 忽略 send error。
- 忽略数据库错误。
- 忽略序列化/反序列化错误。

---

### 6.4 安全规则

禁止：

- 日志打印 token
- 日志打印密码
- 日志打印私钥
- 日志打印 refresh token
- 日志打印 session id
- 日志打印 authorization header
- 未校验外部输入
- 未限制 payload 大小
- 未限制集合增长
- 未限制重试次数
- 直接拼接路径
- 使用 shell 执行外部输入
- 自己实现密码学算法
- 静默忽略认证失败
- 静默降级安全策略

必须：

- 校验所有外部输入。
- 对协议字段使用强类型结构。
- 对非法状态直接拒绝。
- 对安全敏感字段进行显式校验。
- 对请求体、消息体、上传内容设置大小限制。
- 对循环、重试、队列设置上限。
- 对认证、授权、会话、票据逻辑补充负向测试。

---

## 7. 每次任务执行流程

### Step 1：检查 Rust 项目结构

先执行：

```bash
find . -name Cargo.toml -not -path "*/target/*"
find . -name "*.rs" -not -path "*/target/*"
```

必须识别：

- workspace 根目录
- crate 列表
- 每个 crate 的入口文件
- `src/lib.rs`
- `src/main.rs`
- `src/bin/*.rs`
- `build.rs`
- tests
- examples
- benches
- Cargo feature flags
- 当前 Rust 依赖

---

### Step 2：检查 unsafe 关键字

执行：

```bash
rg -n --hidden \
  --glob '!target/**' \
  --glob '!**/target/**' \
  --glob '*.rs' \
  '\bunsafe\b' .
```

要求：

- 项目自有 Rust 源码中不得有任何命中。
- 如果命中，必须修复。
- 不允许仅删除注释逃避问题。
- 不允许把 unsafe 移动到其他文件逃避问题。

---

### Step 3：检查 unsafe_code lint 降级

执行：

```bash
rg -n --hidden \
  --glob '!target/**' \
  --glob '!**/target/**' \
  --glob '*.rs' \
  '#!\s*\[\s*(allow|warn|deny)\s*\(\s*unsafe_code\s*\)\s*\]|#\s*\[\s*(allow|warn|deny)\s*\(\s*unsafe_code\s*\)\s*\]' .
```

要求：

- 不允许命中。
- 只允许 `#![forbid(unsafe_code)]`。
- 如果发现 allow / warn / deny，必须改成 forbid。

---

### Step 4：检查危险底层 API

执行：

```bash
rg -n --hidden \
  --glob '!target/**' \
  --glob '!**/target/**' \
  --glob '*.rs' \
  'transmute|zeroed|uninitialized|from_raw_parts|from_raw_parts_mut|from_utf8_unchecked|copy_nonoverlapping|std::ptr|libc::|MaybeUninit|as \*const|as \*mut' .
```

要求：

- 如果命中，必须检查是否为项目自有危险底层实现。
- 如果是，必须改成安全 Rust。
- 如果是误报，必须在最终报告中说明。

---

### Step 5：检查 crate root

必须运行：

```bash
python3 .agents/skills/rust-zero-unsafe-engineer/scripts/check-crate-forbid.py
```

要求：

- 每个项目自有 crate root 必须有 `#![forbid(unsafe_code)]`。
- 如果缺失，必须补充。
- 如果存在 `deny` / `warn` / `allow`，必须替换为 `forbid`。

---

### Step 6：制定安全实现方案

修改代码前必须明确安全设计：

- 不使用 unsafe。
- 不使用 FFI。
- 不使用 raw pointer。
- 不使用 unchecked API。
- 不引入绕过检查的宏。
- 不引入强制 unsafe 的依赖。
- 不降低现有测试覆盖。
- 不扩大改动范围。

如果某个需求看似必须 unsafe，必须停止 unsafe 实现，改为安全替代方案。

---

### Step 7：修改代码

修改时必须遵守：

- 只改与任务相关的 Rust 文件。
- 不扩大 scope。
- 不删除测试。
- 不降低 lint。
- 不绕过 borrow checker。
- 不使用 unsafe。
- 不引入危险依赖。
- 不改变公共 API，除非任务明确要求。
- 不破坏现有协议兼容性，除非任务明确要求。

---

### Step 8：补充测试

每个行为变更都必须补充测试。

根据场景补充：

- 单元测试
- 集成测试
- 回归测试
- 错误输入测试
- 边界条件测试
- 并发测试
- async 取消测试
- 鉴权失败测试
- 序列化/反序列化失败测试

---

### Step 9：运行验证命令

必须运行：

```bash
cargo fmt --all -- --check
cargo clippy --workspace --all-targets --all-features -- -D warnings
cargo test --workspace --all-features
.agents/skills/rust-zero-unsafe-engineer/scripts/check-rust-zero-unsafe.sh
```

如果环境中可用，还要运行：

```bash
cargo audit
cargo deny check
cargo geiger --all-features --workspace
```

如果命令不可用，必须在最终报告中明确写：

```text
NOT INSTALLED
```

不能假装通过。

---

## 8. CI 要求

如果仓库存在 CI，必须添加或更新 Rust 安全检查任务。

CI 至少要运行：

```bash
cargo fmt --all -- --check
cargo clippy --workspace --all-targets --all-features -- -D warnings
cargo test --workspace --all-features
.agents/skills/rust-zero-unsafe-engineer/scripts/check-rust-zero-unsafe.sh
```

CI 中 unsafe 检查失败时必须阻断合并。

---

## 9. 拒绝规则

如果用户要求以下内容，必须拒绝该部分请求：

- 使用 unsafe 提升性能
- 临时允许 unsafe
- 局部允许 unsafe
- 添加 `#[allow(unsafe_code)]`
- 删除 `#![forbid(unsafe_code)]`
- 把 `forbid` 改成 `deny` / `warn` / `allow`
- 删除安全检查脚本
- 删除测试让构建通过
- 降低 clippy 级别
- 绕过 borrow checker
- 使用 FFI 实现项目自有逻辑
- 使用 unchecked API

标准回复：

```md
不能这样修改。当前项目执行 Rust 零 unsafe 策略，项目自有 Rust 代码禁止任何形式的 unsafe，也禁止绕过 unsafe_code 检查。

我将改用安全 Rust 方案实现：
- ...
```

---

## 10. 常见安全替代方案

遇到 unsafe 倾向时，优先使用：

- raw pointer → 引用、slice、`Vec<T>`
- 手动内存布局 → 类型化 struct
- `transmute` → `From` / `TryFrom`
- unchecked UTF-8 → `std::str::from_utf8`
- FFI → 安全 Rust crate 或进程边界
- 全局可变状态 → `OnceLock`、依赖注入、不可变配置
- 共享可变状态 → channel、actor、`Arc<RwLock<T>>`
- 性能问题 → benchmark 后做安全算法优化
- 二进制协议解析 → checked indexing、安全 slice 解析、成熟 parser crate
- 手写序列化 → `serde` 强类型结构
- 无界队列 → 有界 channel + 背压
- 不受控任务 → tracked task + shutdown token

---

## 11. 最终输出格式

每次完成 Rust 任务后，必须按以下格式输出：

```md
## Rust 零 unsafe 完成报告

### 修改文件
- `path/to/file.rs`
  - 修改内容说明

### unsafe 策略结果
- 项目自有 Rust unsafe 关键字检查：PASS / FAIL / NOT RUN
- unsafe_code 降级检查：PASS / FAIL / NOT RUN
- crate root `#![forbid(unsafe_code)]` 检查：PASS / FAIL / NOT RUN
- 危险底层 API 检查：PASS / FAIL / NOT RUN

### 验证结果
- `cargo fmt --all -- --check`：PASS / FAIL / NOT RUN
- `cargo clippy --workspace --all-targets --all-features -- -D warnings`：PASS / FAIL / NOT RUN
- `cargo test --workspace --all-features`：PASS / FAIL / NOT RUN
- `.agents/skills/rust-zero-unsafe-engineer/scripts/check-rust-zero-unsafe.sh`：PASS / FAIL / NOT RUN
- `cargo audit`：PASS / FAIL / NOT RUN / NOT INSTALLED
- `cargo deny check`：PASS / FAIL / NOT RUN / NOT INSTALLED
- `cargo geiger --all-features --workspace`：PASS / FAIL / NOT RUN / NOT INSTALLED

### 安全说明
- 项目自有 Rust 代码是否仍存在 unsafe：
- 第三方依赖是否存在 unsafe：
- 是否新增依赖：
- 是否新增 FFI：
- 是否降低 lint：
- 是否删除测试：

### 剩余风险
- 列出具体剩余风险。
- 如果没有发现，写：`当前修改范围内未发现剩余风险`。
```

---

## 12. 最终硬规则

任务未同时满足以下条件，不允许标记完成：

1. 项目自有 Rust 源码中没有 `unsafe` 关键字。
2. 没有任何 unsafe_code 降级配置。
3. 每个项目自有 crate root 都有 `#![forbid(unsafe_code)]`。
4. 危险底层 API 已清理或明确解释。
5. `cargo fmt` 通过。
6. `cargo clippy -D warnings` 通过。
7. `cargo test` 通过。
8. zero-unsafe 脚本通过。
9. 未运行或未安装的安全工具必须明确报告。