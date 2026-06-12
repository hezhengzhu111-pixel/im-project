# Post Rust Bridge Boundary Cleanup Baseline

Date: 2026-06-07
Branch: `refactor/post-rust-bridge-boundary-cleanup`

## Scope

This baseline records the current state before the second cleanup pass after the unified Rust workspace and `im_rust_bridge` migration.

This phase records facts only. No business code was changed before this baseline.

## Rust Bridge Exposed Modules

`rust/crates/im-flutter-bridge/src/api/mod.rs` currently exposes:

```rust
pub mod e2ee;
pub mod network;
pub mod secure_storage;
pub mod storage;
```

Current module files:

- `rust/crates/im-flutter-bridge/src/api/e2ee.rs`
- `rust/crates/im-flutter-bridge/src/api/network.rs`
- `rust/crates/im-flutter-bridge/src/api/storage.rs`
- `rust/crates/im-flutter-bridge/src/api/secure_storage.rs`

Boundary risk: the Rust bridge still exposes non-E2EE APIs (`network`, `storage`, `secure_storage`).

## Flutter Generated API

`flutter/packages/rust_bridge/lib/src/generated/api/` currently contains:

- `e2ee.dart`
- `network.dart`
- `secure_storage.dart`
- `storage.dart`

Boundary risk: generated bindings still include non-E2EE APIs.

## Business Usage Of Generated Non-E2EE APIs

Search terms:

- `generated/api/network`
- `generated/api/storage`
- `generated/api/secure_storage`
- `NetworkService`
- `LocalStorage`
- `SecureKeyStore`
- `SecureBuffer`

Findings:

- No app, `im_core`, `im_core_flutter`, or `im_shared_features` business code imports `package:im_rust_bridge/src/generated/api/network`, `storage`, or `secure_storage`.
- `NetworkService`, `LocalStorage`, `SecureKeyStore`, and `SecureBuffer` matches are in generated Rust/Dart bridge code and in the Rust bridge source modules.
- Unrelated app platform adapters use similarly named local classes such as `DesktopNetworkService`, `MobileNetworkService`, and web local-storage platform methods. These are not generated Rust bridge APIs.

Conclusion: the non-E2EE generated Rust bridge APIs appear unused by business code and are candidates for removal from the bridge boundary.

## App E2EE Injection

`flutter/apps/web/lib/main.dart`:

- Creates `final rustGateway = FrbRustGateway();`
- Runs `await rustGateway.init();`
- Overrides `e2eeAdapterProvider` with `rustGateway`.
- Uses `WebWsClient` with `ticketProvider` and `wsBaseUrl: '$wsBase${WsEndpoints.path}'`.

`flutter/apps/desktop/lib/main.dart`:

- Creates `final rustGateway = FrbRustGateway();`
- Runs `await rustGateway.init();`
- Overrides `e2eeAdapterProvider` with `rustGateway`.
- Creates `final wsService = DesktopWsAdapter();`
- Directly runs `await wsService.connect('$wsBase/ws');` during app startup.

`flutter/apps/mobile/lib/main.dart`:

- Creates `final rustGateway = FrbRustGateway();`
- Runs `await rustGateway.init();`
- Overrides `e2eeAdapterProvider` with `rustGateway`.
- Uses `MobileWsClient` with `ticketProvider` and `wsBaseUrl: '$wsBase${WsEndpoints.path}'`.

Boundary risk: desktop connects WebSocket before authentication and does not follow the web/mobile ticket-provider pattern.

## Web E2EE Provider Duplication

`flutter/apps/web/lib/features/e2ee/data/e2ee_providers.dart` currently defines:

- `e2eeApiProvider`
- `e2eeKeyStoreProvider`
- `e2eeSessionStoreProvider`
- `e2eeMetaStoreProvider`
- `e2eeManagerProvider`
- `e2eeSessionStatusProvider`
- `e2eeSentMessageCacheProvider`

`flutter/packages/shared_features/lib/src/e2ee/data/e2ee_providers.dart` currently defines:

- `e2eeApiProvider`
- `e2eeKeyStoreProvider`
- `e2eeSessionStoreProvider`
- `e2eeMetaStoreProvider`
- `e2eeManagerProvider`
- `e2eeSessionStatusProvider`

Duplication:

- `e2eeApiProvider` has the same HTTP-client wrapper responsibility.
- `e2eeMetaStoreProvider` has the same secure-storage wrapper responsibility.
- `e2eeManagerProvider` repeats the same orchestration inputs.
- `e2eeSessionStatusProvider` repeats the same meta-store lookup.

Web-specific pieces:

- IndexedDB key store
- IndexedDB session store
- Web sent-message cache

Boundary risk: web retains a duplicate E2EE orchestration tree instead of reusing `im_shared_features`.

## Desktop WebSocket Lifecycle

Current desktop state:

- `flutter/apps/desktop/lib/main.dart` directly calls `await wsService.connect('$wsBase/ws');`.
- `DesktopWsAdapter` only stores the last URL and reconnects that URL.
- `DesktopWsAdapter` does not have a ticket provider.
- `DesktopWsAdapter` does not distinguish manual disconnect from unplanned disconnect.

Existing shared behavior:

- `flutter/packages/shared_features/lib/src/auth/presentation/auth_provider.dart` calls `_wsClient.connect(...)` after login/auth bootstrap and `_wsClient.disconnect()` on logout.
- Web app auth provider contains the same behavior.
- Web and mobile WS clients support ticket refresh on reconnect through a ticket provider.

Boundary risk: desktop opens WS before auth and does not align with the shared authenticated lifecycle.

## Melos Script Risks

`flutter/melos.yaml` currently contains:

- `build:web` with local absolute output path: `D:/project/new-im-project/build/flutter/web`.
- `rust-bridge:smoke` invoking PowerShell directly: `powershell -NoProfile -ExecutionPolicy Bypass -File packages/rust_bridge/tool/rust_bridge_smoke.ps1`.

Boundary risk: scripts are Windows/local-machine specific.

## CI Coverage

Existing workflows:

- `.github/workflows/e2ee-rust-ci.yml`

Current coverage:

- Covers `rust/crates/im-e2ee-core`
- Covers `rust/crates/im-e2ee-ffi`
- Covers `rust/crates/im-e2ee-wasm`
- Does not cover `rust/crates/im-flutter-bridge`
- Does not cover `flutter/packages/rust_bridge`
- Does not run Rust bridge smoke tests
- Does not run architecture boundary checks

Boundary risk: Rust bridge regressions are not covered in CI.

## Baseline Verification

Commands run before cleanup code changes:

```text
cd rust
cargo check --workspace
```

Result: passed.

```text
cd ../flutter
flutter pub get
```

Result: passed.

```text
dart run melos exec -- flutter analyze
```

Result: passed across 8 packages.

