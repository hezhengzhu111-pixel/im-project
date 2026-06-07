# Rust Workspace Migration Baseline

Date: 2026-06-06

## Current Rust Workspaces

- `backend/Cargo.toml`
  - members: `common`, `api-server-rs`, `im-server-rs`, `e2ee-core`, `e2ee-ffi`, `e2ee-wasm`
- `flutter/Cargo.toml`
  - members: `native/rust`

## Current Cargo Packages

- `backend/common/Cargo.toml`: `im-rs-common`
- `backend/e2ee-core/Cargo.toml`: `e2ee-core`
- `backend/e2ee-ffi/Cargo.toml`: `e2ee-ffi`
- `backend/e2ee-wasm/Cargo.toml`: `e2ee-wasm`
- `backend/api-server-rs/Cargo.toml`: `api-server-rs`
- `backend/im-server-rs/Cargo.toml`: `im-server-rs`
- `flutter/native/rust/Cargo.toml`: `im-rust-bridge`

## Current Path Dependencies

- `backend/api-server-rs` depends on `im-rs-common = { path = "../common" }`
- `backend/e2ee-ffi` depends on `e2ee-core = { path = "../e2ee-core" }`
- `backend/e2ee-wasm` depends on `e2ee-core = { path = "../e2ee-core" }`
- `flutter/native/rust` depends on `e2ee-core = { path = "../../../backend/e2ee-core" }`

## Current Flutter To Rust Call Sites

- `flutter/packages/core/lib/src/crypto/rust_bridge_initializer.dart` imports `../generated/frb_generated.dart` and calls `RustLib.init()`.
- `flutter/packages/core/lib/src/crypto/crypto.dart` exports `rust_bridge_initializer.dart`.
- `flutter/packages/core/pubspec.yaml` depends on `flutter_rust_bridge: 2.12.0`.
- `flutter/packages/core/lib/src/generated/` contains FRB generated Dart bindings and `RustLib`.
- `flutter/apps/web/lib/adapters/web_e2ee_adapter.dart` imports `package:im_core/src/generated/api/e2ee.dart`.
- `flutter/apps/desktop/lib/adapters/desktop_e2ee_adapter.dart` imports `package:im_core/src/generated/api/e2ee.dart`.
- `flutter/apps/mobile/lib/adapters/mobile_e2ee_adapter.dart` imports `package:im_core/src/generated/api/e2ee.dart`.
- `flutter/apps/web/lib/main.dart`, `flutter/apps/desktop/lib/main.dart`, and `flutter/apps/mobile/lib/main.dart` call `RustBridgeInitializer.init()` and inject their platform-specific E2EE adapter.
- `E2eeBridge` is defined in `flutter/packages/core/lib/src/crypto/e2ee_bridge.dart`; current platform implementations are `WebE2eeAdapter`, `DesktopE2eeService`, and `MobileE2eeService`.

## Current Old Path References

- `deploy/sit/docker-compose.yml` references `api-server-rs/Dockerfile` and `im-server-rs/Dockerfile` with build context `../../backend`.
- `scripts/deploy_utils.py` expects `backend/Cargo.toml`, `backend/api-server-rs/Dockerfile`, and `backend/im-server-rs/Dockerfile`.
- `.github/workflows/e2ee-rust-ci.yml` watches and checks `backend/e2ee-core`, `backend/e2ee-ffi`, and `backend/e2ee-wasm`.
- `backend/scripts/e2ee-ci-check.sh` checks `e2ee-core`, `e2ee-ffi`, and `e2ee-wasm` from the backend workspace.
- Documentation and helper scripts still mention `flutter/native/rust`, `backend/e2ee-core`, `e2ee-ffi`, `e2ee-wasm`, `api-server-rs`, and `im-server-rs`.

## Baseline Verification Results

- `cd backend && cargo check --workspace`: passed.
- `cd backend && cargo test --workspace`: failed before migration. `im-server-rs` test compilation fails because `#![forbid(unsafe_code)]` rejects unsafe `std::env::set_var` / `remove_var` calls in `im-server-rs/src/config.rs` tests.
- `cd flutter && flutter pub get`: failed before migration. Flutter reports no project root because `flutter/` has `melos.yaml` but no root `pubspec.yaml`.
- `cd flutter && dart run melos exec -- flutter analyze`: failed before migration. Dart reports no `pubspec.yaml` in `flutter/` or parent directories.
- `cd flutter && dart run melos exec -- flutter test`: failed before migration. Dart reports no `pubspec.yaml` in `flutter/` or parent directories.
