# iOS Rust E2EE Native Bridge Integration

## 当前状态：FAIL-FAST

iOS `RustE2eeModule` 已创建为 fail-fast 存根。所有 native 方法调用会 reject promise，error message 为 `"Mobile Rust E2EE runtime is not linked (iOS)"`。

TS 业务层（`mobileRustE2eeRuntime.ts`）通过 `setMobileE2eeRuntimeForTesting(fakeRuntime)` 可以在单元测试中工作，但真机必须完成以下步骤。

## 集成步骤

### 1. 构建 Rust e2ee-ffi 为 iOS 静态库

```bash
cd backend/e2ee-ffi

# 安装 iOS target
rustup target add aarch64-apple-ios x86_64-apple-ios

# 构建
cargo build --release --target aarch64-apple-ios    # 真机
cargo build --release --target x86_64-apple-ios     # 模拟器

# 生成通用库 (lipo)
lipo -create \
  target/aarch64-apple-ios/release/libe2ee_ffi.a \
  target/x86_64-apple-ios/release/libe2ee_ffi.a \
  -output target/universal/release/libe2ee_ffi.a
```

### 2. 生成 UniFFI Swift 绑定

```bash
cd backend/e2ee-ffi
# 需要安装 uniffi-bindgen
cargo install uniffi_bindgen

uniffi-bindgen generate src/e2ee_ffi.udl --language swift \
  --out-dir ../../frontend/apps/mobile/ios/ImMobile/
```

生成文件：`e2ee_ffi.swift`（包含 `SessionManager` 类和 `SessionException` 等类型）

### 3. 更新 Xcode 项目

- 将 `libe2ee_ffi.a` 拖入 Xcode → Target → General → Frameworks, Libraries, and Embedded Content
- 在 Build Settings → Library Search Paths 添加静态库路径
- 将 `e2ee_ffi.swift` 和 `RustE2eeModule.swift` 添加到 Xcode 项目
- 确保 `RustE2eeModule.m` 在 Compile Sources 中

### 4. 启用 RustE2eeModule.swift 中的真实实现

编辑 `ios/ImMobile/RustE2eeModule.swift`，移除每个方法中的 `failFast(reject)` 调用，
取消注释 TODO 块中的真实 SessionManager 调用。

### 5. Pod install

```bash
cd frontend/apps/mobile/ios
pod install
```

### 6. 验证

```bash
# 构建 iOS 应用
cd frontend/apps/mobile/ios
xcodebuild -workspace ImMobile.xcworkspace -scheme ImMobile -sdk iphonesimulator

# 检查 TS adapter 能否找到原生模块
# 在应用中调用 NativeModules.RustE2eeModule 应该返回模块实例（不再 throw "not linked"）
```

## 与 Android 实现的一致性

| 方法 | Android (Kotlin) | iOS (Swift) | 参数一致性 |
|------|-----------------|-------------|-----------|
| generatePreKeyBundle | UInt, UInt, UInt → String | UInt32, UInt32, UInt32 → String | ✅ |
| createOutboundSession | base64 decode → UByte list → manager → base64 encode | Data(base64Encoded:) → [UInt8] → manager → Data.base64EncodedString() | ✅ |
| createInboundSession | base64 decode all params | Data(base64Encoded:) for all params | ✅ |
| encrypt | base64 decode plaintext → encrypt → base64 encode wire | Same pattern | ✅ |
| decrypt | base64 decode wire → decrypt → base64 encode plaintext | Same pattern | ✅ |
| exportSession | sessionId → [UByte] → base64 encode | Same pattern | ✅ |
| restoreSession | base64 decode state → [UByte] → manager | Same pattern | ✅ |
| removeSession | sessionId → manager (void) | Same pattern | ✅ |

## TS 层兼容

`mobileRustE2eeRuntime.ts` 的 `NativeRustE2eeModule` 接口在 Android 和 iOS 上完全一致：
- 所有参数都是 base64 字符串或 number
- 所有返回值都是 Promise<string> 或 Promise<void>
- 错误通过 Promise reject 抛出
