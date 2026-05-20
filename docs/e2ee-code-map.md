# E2EE 代码阅读索引

大模型 / 开发者快速定位文件指南。所有路径相对于仓库根目录。

---

## 1. 调用链总览（移动端）

```
frontend/apps/mobile/src/e2ee/runtime/mobileRustE2eeRuntime.ts   (TS 运行时)
  → NativeModules.RustE2eeModule
    → Android:
        frontend/apps/mobile/android/app/src/main/java/com/immobile/RustE2eeModule.kt  (Android Bridge)
        → frontend/apps/mobile/android/app/src/main/java/com/im/e2ee/e2ee_ffi.kt       (UniFFI 生成)
        → backend/e2ee-ffi/src/e2ee_ffi.udl                                             (接口定义)
        → backend/e2ee-ffi/src/session/mod.rs                                           (FFI 实现)
        → backend/e2ee-core/src/*                                                        (核心加密逻辑)
    → iOS:
        frontend/apps/mobile/ios/ImMobile/RustE2eeModule.m                              (iOS ObjC Bridge)
        frontend/apps/mobile/ios/ImMobile/RustE2eeModule.swift                          (iOS Swift Bridge)
        → iOS UniFFI generated binding / Rust static library binding，具体文件按构建产物生成
        → backend/e2ee-ffi/src/e2ee_ffi.udl                                             (接口定义)
        → backend/e2ee-ffi/src/session/mod.rs                                           (FFI 实现)
        → backend/e2ee-core/src/*                                                        (核心加密逻辑)
```

---

## 2. 生成文件（不要手动修改）

| 文件 | 说明 |
|------|------|
| `frontend/apps/mobile/android/app/src/main/java/com/im/e2ee/e2ee_ffi.kt` | UniFFI 根据 UDL 自动生成的 Kotlin 绑定。审计时只按需读取必要片段，**严禁手动编辑**。 |

---

## 3. Rust FFI 层

| 文件 | 角色 |
|------|------|
| `backend/e2ee-ffi/src/e2ee_ffi.udl` | UniFFI 接口定义——SessionManager 的构造函数、方法签名、错误类型。**大模型审计起点**。 |
| `backend/e2ee-ffi/src/session/mod.rs` | FFI 层的 Rust 实现：将 UDL 中定义的方法桥接到 `e2ee-core` 的加密逻辑。 |
| `backend/e2ee-ffi/src/session/tests.rs` | FFI 层集成测试。 |
| `backend/e2ee-ffi/src/lib.rs` | Crate 入口，绑定 UniFFI 宏。 |

---

## 4. Rust Core 层

所有加密协议逻辑集中在此，按子模块组织，每个子模块都有 `mod.rs + tests.rs`：

| 模块 | 文件 | 职责 |
|------|------|------|
| primitives | `backend/e2ee-core/src/primitives/mod.rs` | 底层加密原语（密钥生成、加解密、签名等） |
| | `backend/e2ee-core/src/primitives/tests.rs` | 原语单元测试 |
| x3dh | `backend/e2ee-core/src/x3dh/mod.rs` | X3DH 密钥协商协议 |
| | `backend/e2ee-core/src/x3dh/tests.rs` | X3DH 单元测试 |
| ratchet | `backend/e2ee-core/src/ratchet/mod.rs` | Double Ratchet 协议实现 |
| | `backend/e2ee-core/src/ratchet/tests.rs` | Ratchet 单元测试 |
| state | `backend/e2ee-core/src/state/mod.rs` | 会话状态管理（持久化、恢复） |
| | `backend/e2ee-core/src/state/tests.rs` | 状态管理单元测试 |
| — | `backend/e2ee-core/src/errors.rs` | 错误类型定义 |
| — | `backend/e2ee-core/src/lib.rs` | Crate 入口 |

---

## 5. 移动端 Bridge 层

| 文件 | 角色 |
|------|------|
| `frontend/apps/mobile/android/app/src/main/java/com/immobile/RustE2eeModule.kt` | Android 原生桥接——通过 React Native NativeModule 机制暴露 Kotlin 方法给 JS/TS 侧。 |
| `frontend/apps/mobile/android/app/src/main/java/com/immobile/RustE2eePackage.kt` | React Native Package 注册。 |
| `frontend/apps/mobile/ios/ImMobile/RustE2eeModule.m` | iOS 原生桥接（ObjC —— RCT_EXTERN_MODULE）。 |
| `frontend/apps/mobile/ios/ImMobile/RustE2eeModule.swift` | iOS 原生桥接（Swift 实现）。 |

---

## 6. TS Runtime 层

| 文件 | 角色 |
|------|------|
| `frontend/apps/mobile/src/e2ee/runtime/mobileRustE2eeRuntime.ts` | TS 侧 E2EE 运行时封装——调用 `NativeModules.RustE2eeModule`，处理 Base64/二进制转换，封装为 `E2eeRuntime` 接口。 |

辅助文件（不直接参与调用链，但被 runtime 引用）：

| 文件 | 角色 |
|------|------|
| `frontend/apps/mobile/src/e2ee/manager/e2eeManager.ts` | E2EE 会话生命周期管理 |
| `frontend/apps/mobile/src/e2ee/manager/localDevice.ts` | 本地设备密钥对管理 |
| `frontend/apps/mobile/src/e2ee/manager/negotiation.ts` | 密钥协商流程 |
| `frontend/apps/mobile/src/e2ee/store/keyStore.ts` | 密钥存储 |
| `frontend/apps/mobile/src/e2ee/store/sessionStore.ts` | 会话状态存储 |
| `frontend/apps/mobile/src/e2ee/messageProcessor.ts` | 消息加解密调度 |
| `frontend/apps/mobile/src/e2ee/api/keyService.ts` | 服务端密钥获取 API |

---

## 7. 大模型审计建议

以下为推荐阅读顺序，按信息密度从低到高排列：

1. **先读 UDL** — `backend/e2ee-ffi/src/e2ee_ffi.udl`
   - 最精简的接口定义，了解所有 FFI 方法、参数类型、返回类型。
   - 约 60 行，读完即知整个 E2EE 对外接口全貌。

2. **再读 TS runtime** — `frontend/apps/mobile/src/e2ee/runtime/mobileRustE2eeRuntime.ts`
   - 理解 JS/TS 侧如何使用 FFI 方法、如何转换数据格式（Base64 ↔ bytes）。
   - 对照 UDL 方法签名，确认调用一致性。

3. **再读 Android Bridge** — `frontend/apps/mobile/android/app/src/main/java/com/immobile/RustE2eeModule.kt`
   - 理解 Kotlin 侧如何解析 TS 传入的参数、如何调用 UniFFI 生成的 Kotlin 绑定。
   - 关注参数反序列化逻辑。

4. **按需读 e2ee_ffi.kt 片段** — `frontend/apps/mobile/android/app/src/main/java/com/im/e2ee/e2ee_ffi.kt`
   - 这是生成文件，一般无需通读。仅在需要确认实际 Kotlin 绑定签名时，用 grep 定位对应方法片段。
   - 例如：`grep "fun createOutboundSession"` 即可找到对应绑定。

5. **最后读 Rust core 对应模块** — `backend/e2ee-core/src/*`
   - 按需深入：加密原语 → X3DH → Ratchet → State。
   - 每个模块的 `tests.rs` 可直接看到 API 使用方式。
   - 日志等级调整为 `debug` 或 `trace` 时，Ratchet 模块会自动输出 DH 公钥的十六进制摘要。

---

## 8. 文档维护说明

- 若 `e2ee_ffi.udl` 新增方法或类型，请同步更新本文档的调用链描述。
- 若 E2EE 子模块拆分或合并，请同步更新第 4 节的 Core 层表格。
- 本文档只描述文件位置和调用关系，不包含架构决策或协议设计说明。

---

## 9. 重构验证清单

E2EE 测试拆分或重构后，按以下顺序验证，确保 review 能区分结构拆分与行为改动。

### 9.1 Rust 验证

在 `backend/` 目录下依次执行：

```bash
# 格式检查
cargo fmt --check

# 单元/集成测试
cargo test -p e2ee-core
cargo test -p e2ee-ffi

# Clippy（零警告通过）
cargo clippy -p e2ee-core --all-targets -- -D warnings
cargo clippy -p e2ee-ffi --all-targets -- -D warnings
```

### 9.2 前端验证

**推荐方式：在 `frontend/apps/mobile/` 直接调用 jest**

```bash
cd frontend/apps/mobile

# 针对性测试（按需选择）
npx jest --runInBand --testPathPattern="mobileRustE2eeRuntime"
npx jest --runInBand --testPathPattern="mobileE2ee"
npx jest --runInBand --testPathPattern="messageProcessor.e2ee"

# TypeScript 类型检查
npm run typecheck
```

**备选方式：通过 npm workspace test script 正确转发**

```bash
# 在仓库根目录执行（注意双 --）
npm run test --workspace=@im/mobile -- -- --testPathPattern="mobileRustE2eeRuntime"
```

**不推荐的写法（参数被 npm 截获，不能可靠传给 Jest）**

```bash
# 以下写法是错误的 —— npm 会将 --testPathPattern 误解析为 npm config，不转发给 jest
npm run mobile:test -- --testPathPattern="mobileRustE2eeRuntime"   # ❌
```

原因：npm workspace 链路 `npm run mobile:test` → `npm run test --workspace=@im/mobile` → `jest --runInBand`，单层 `--` 只能穿透第一层 npm，无法穿透嵌套的 workspace 调用。

### 9.3 人工 Review Checklist

| 检查项 | 说明 |
|--------|------|
| `e2ee_ffi.udl` 未修改 | `git diff main -- backend/e2ee-ffi/src/e2ee_ffi.udl` 为空 |
| UniFFI 生成文件未修改 | `e2ee_ffi.kt`、iOS binding 等生成产物不在 diff 中 |
| Rust `pub` re-export 未变化 | `backend/e2ee-core/src/lib.rs`、`backend/e2ee-ffi/src/lib.rs` 的 `pub use`/`pub mod` 无新增 |
| 测试只做结构移动 | 测试从单文件拆到多文件时，`it(...)` 断言语义完全不变；若发现断言变化，必须单独 commit/PR |
| 未为测试扩大可见性 | 没有 `pub` 化原本 `pub(crate)` / `private` 的 helper，测试只依赖已有公开 API 和 mock |
| 行为修复独立提交 | 拆分过程中发现的 bug 修复应放在独立 commit/PR，不混入重构 diff |

### 9.4 当前 E2EE 测试文件清单

**Rust：**

| 文件 | 说明 |
|------|------|
| `backend/e2ee-core/src/primitives/tests.rs` | 加密原语测试 |
| `backend/e2ee-core/src/x3dh/tests.rs` | X3DH 协议测试 |
| `backend/e2ee-core/src/ratchet/tests.rs` | Double Ratchet 测试 |
| `backend/e2ee-core/src/state/tests.rs` | 状态管理测试 |
| `backend/e2ee-ffi/src/session/tests.rs` | FFI 层集成测试 |

**前端（mobile）：**

| 文件 | 说明 |
|------|------|
| `src/e2ee/__tests__/mobileRustE2eeRuntime.e2e.test.ts` | Runtime 端到端测试 |
| `src/e2ee/__tests__/mobileRustE2eeRuntime.handshake.test.ts` | OTK 握手处理 |
| `src/e2ee/__tests__/mobileRustE2eeRuntime.binaryInput.test.ts` | Base64 校验 + Uint8Array 二进制路径 |
| `src/e2ee/__tests__/mobileRustE2eeRuntime.compat.test.ts` | encrypt UTF-8 兼容 |
| `src/e2ee/__tests__/mobileE2eeTextFlow.test.ts` | 文本消息加解密流程 |
| `src/e2ee/__tests__/messageProcessor.e2ee.test.ts` | 消息处理器 E2EE 集成 |
| `src/e2ee/__tests__/e2eeCapability.test.ts` | E2EE 能力检测 |
| `src/e2ee/__tests__/e2eeDeferred.test.ts` | 延迟初始化 |
| `src/e2ee/__tests__/mobileDeferredE2e.test.ts` | 移动端延迟 E2EE |
| `src/e2ee/__tests__/e2eeManagerCommit.test.ts` | Session state 提交边界 |
| `src/e2ee/__tests__/pendingDecryptStore.test.ts` | 运行时队列恢复、batch 限制 |
| `src/e2ee/__tests__/pendingDecryptStore.retry.test.ts` | retryCount/backoff/max retry/dead-letter |
| `src/e2ee/__tests__/localDevice.test.ts` | 本地设备注册 |
| `src/e2ee/__tests__/e2eeReadiness.test.ts` | E2EE 就绪门 |
| `src/e2ee/__tests__/secureE2eeStorage.test.ts` | 安全存储 |
| `src/stores/__tests__/messageStore.e2ee.test.ts` | 发送阻塞、pending 管理、drain、retry 元数据 |
| `src/stores/__tests__/messageStore.e2ee.outbound.test.ts` | Outbound pipeline: plaintext→pending→negotiation→resume→encrypt |
| `src/stores/__tests__/messageStore.e2ee.inbound-order.test.ts` | Inbound 乱序恢复：no-handshake pending→handshake→drain |
| `src/stores/__tests__/websocketStore.e2ee.test.ts` | WebSocket E2EE 协商事件、敏感字段防泄漏 |

> 上表随文件拆分/合并同步更新。若新增测试文件，追加到对应分类并更新本节。

---

### 9.5 当前验证结果摘要

> 最后更新：2026-05-21，Message Pipeline 文档和测试补齐完成后。

| 验证项 | 命令 | 结果 |
|--------|------|------|
| Rust 格式 | `cargo fmt --check` | ✅ 零违规 |
| e2ee-core 测试 | `cargo test -p e2ee-core` | ✅ **102 tests passed**（99 unit + 3 integration） |
| e2ee-ffi 测试 | `cargo test -p e2ee-ffi` | ✅ **30 tests passed**（26 unit + 1 binding + 3 integration） |
| e2ee-core Clippy | `cargo clippy -p e2ee-core --all-targets -- -D warnings` | ✅ 零警告 |
| e2ee-ffi Clippy | `cargo clippy -p e2ee-ffi --all-targets -- -D warnings` | ✅ 零警告 |
| mobileRustE2eeRuntime | `npx jest --runInBand --testPathPattern="mobileRustE2eeRuntime"` | ✅ 4 suites, **12 tests passed** |
| mobileE2ee | `npx jest --runInBand --testPathPattern="mobileE2ee"` | ✅ 1 suite, **1 test passed** |
| messageProcessor.e2ee | `npx jest --runInBand --testPathPattern="messageProcessor.e2ee"` | ✅ 1 suite, **16 tests passed** |
| messageStore.e2ee | `npx jest --runInBand --testPathPattern="messageStore.e2ee"` | ✅ 3 suites, **79 tests passed** |
| pendingDecryptStore | `npx jest --runInBand --testPathPattern="pendingDecryptStore"` | ✅ 2 suites, **29 tests passed** |
| 全部 E2EE 测试 | `npx jest --runInBand --testPathPattern="messageStore.e2ee\|messageProcessor.e2ee\|pendingDecryptStore\|mobileE2ee"` | ✅ 7 suites, **125 tests passed** |
| TypeScript 类型检查 | `cd frontend/apps/mobile && npx tsc --noEmit` | ✅ 零错误 |

### 9.6 已知非本次问题（不要求修复）

以下问题是预存的，在 E2EE 重构之前已存在，**不属于本次变更引入，请勿在 E2EE 重构中修复**：

| 文件 | 现象 | 说明 |
|------|------|------|
| `src/components/chat/__tests__/MessageBubble.types.test.tsx` | FAIL | 预存问题，与 E2EE 拆分无关 |
| `src/screens/chat/__tests__/ChatScreen.pagination.test.tsx` | `act()` 警告 | Zustand store 在 `act()` 外更新，预存问题 |

> 遇到这些文件的失败时，确认非本次变更引入后即可忽略。
