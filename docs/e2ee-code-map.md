# E2EE 代码阅读索引

大模型 / 开发者快速定位文件指南。所有路径相对于仓库根目录。

---

## 1. 调用链总览（移动端）

```
frontend/apps/mobile/src/e2ee/runtime/mobileRustE2eeRuntime.ts   (TS 运行时)
  → NativeModules.RustE2eeModule
    → frontend/apps/mobile/android/app/src/main/java/com/immobile/RustE2eeModule.kt  (Android Bridge)
    → frontend/apps/mobile/ios/ImMobile/RustE2eeModule.m / .swift                    (iOS Bridge)
      → frontend/apps/mobile/android/app/src/main/java/com/im/e2ee/e2ee_ffi.kt       (UniFFI 生成)
        → backend/e2ee-ffi/src/e2ee_ffi.udl                                           (接口定义)
          → backend/e2ee-ffi/src/session/mod.rs                                       (FFI 实现)
            → backend/e2ee-core/src/*                                                  (核心加密逻辑)
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
