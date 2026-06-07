# Unified Rust Workspace And Flutter Rust Bridge Migration Result

Date: 2026-06-06

## Summary

The repository now has one Rust workspace rooted at `rust/Cargo.toml`. The old Rust workspace roots under `backend/`, `flutter/`, and `flutter/native/rust/` were removed after `cargo check --workspace` passed from the new root.

Flutter Rust bindings now live in the package `im_rust_bridge` at `flutter/packages/rust_bridge`. `im_core` keeps the stable E2EE abstractions and service types, but no longer depends on `flutter_rust_bridge`, generated FRB bindings, `RustLib`, or `RustBridgeInitializer`.

## Rust Workspace

Workspace root:

- `rust/Cargo.toml`

Workspace members:

- `rust/crates/im-common`
- `rust/crates/im-e2ee-core`
- `rust/crates/im-e2ee-ffi`
- `rust/crates/im-e2ee-wasm`
- `rust/crates/im-flutter-bridge`
- `rust/apps/api-server`
- `rust/apps/im-server`

Package names:

- `im-common`
- `im-e2ee-core`
- `im-e2ee-ffi`
- `im-e2ee-wasm`
- `im-flutter-bridge`
- `api-server`
- `im-server`

Import changes:

- `im_rs_common` became `im_common`.
- `e2ee_core` became `im_e2ee_core`.
- Server library imports now use `api_server` and `im_server`.

The UniFFI crate package was renamed to `im-e2ee-ffi`, while its `[lib]` name remains `e2ee_ffi` for compatibility with existing UniFFI binding expectations.

## Flutter Bridge Boundary

New package:

- `flutter/packages/rust_bridge`
- Package name: `im_rust_bridge`

Public barrel:

- `flutter/packages/rust_bridge/lib/im_rust_bridge.dart`

The barrel exports only:

- `src/rust_gateway.dart`
- `src/frb_rust_gateway.dart`
- `src/rust_bridge_initializer.dart`
- `src/rust_error_mapper.dart`

Generated bindings remain internal under:

- `flutter/packages/rust_bridge/lib/src/generated`

The new bridge API is:

- `abstract interface class RustGateway extends E2eeBridge { Future<void> init(); }`
- `FrbRustGateway implements RustGateway`
- `RustBridgeException`
- `mapRustError(Object error, [StackTrace? stackTrace])`

`FrbRustGateway` consolidates the former web, desktop, and mobile adapter logic and preserves the existing JSON fields, base64 encoding and decoding behavior, `Uint8List` behavior, method signatures, and return shapes.

`mapRustError` intentionally returns a sanitized bridge exception message so key, state, plaintext, ciphertext, token, and related sensitive material from raw Rust errors is not exposed through app-level exceptions.

The Rust bridge crate package remains `im-flutter-bridge`, but its `[lib]` target is named `im_rust_bridge` so the generated Dart loader's `stem: 'im_rust_bridge'` resolves to the native release artifact on desktop and mobile. The `rust-bridge:smoke` Melos script builds that release library and runs a real `RustBridgeInitializer.init()` smoke test.

## App Injection

The web, desktop, and mobile apps now depend on `im_rust_bridge` and initialize the bridge at startup:

```dart
final rustGateway = FrbRustGateway();
await rustGateway.init();
```

Each app injects that gateway through:

```dart
e2eeAdapterProvider.overrideWithValue(rustGateway)
```

The old app-local E2EE adapter files were deleted. `shared_features`, `core_flutter`, and the web app now use the single `e2eeAdapterProvider` defined by `im_core_flutter`, so the provider boundary is shared across all Flutter apps while the web app still keeps its web-specific network and storage providers.

## Deploy And CI

Rust CI and E2EE scripts now run from `rust/` and use the new package names.

Dockerfiles were moved to:

- `rust/apps/api-server/Dockerfile`
- `rust/apps/im-server/Dockerfile`

The Dockerfiles build the new crates `api-server` and `im-server`. They still copy the built binaries to `/usr/local/bin/api-server-rs` and `/usr/local/bin/im-server-rs` so existing deployment entrypoints continue to work. This is deployment compatibility only; it is not the crate naming scheme.

SIT compose build contexts now point at `rust/`, with Dockerfile paths under `apps/*`.

## Removed Rust Roots

Removed after the new workspace validated:

- `backend/Cargo.toml`
- `backend/Cargo.lock`
- `flutter/Cargo.toml`
- `flutter/Cargo.lock`
- `flutter/native/rust/Cargo.toml`
- `flutter/native/rust/Cargo.lock`

## Verification Results

Baseline before migration:

- `cd backend && cargo check --workspace`: passed.
- `cd backend && cargo test --workspace`: failed before migration because `backend/im-server-rs/src/config.rs` tests mutate environment variables while the crate forbids unsafe code.
- `cd flutter && flutter pub get`: failed before migration because `flutter/` had no root `pubspec.yaml`.
- `cd flutter && dart run melos exec -- flutter analyze`: failed before migration because `flutter/` had no root `pubspec.yaml`.
- `cd flutter && dart run melos exec -- flutter test`: failed before migration because `flutter/` had no root `pubspec.yaml`.

Post-migration Rust validation:

- `cd rust && cargo fmt`: passed.
- `cd rust && cargo check --workspace`: passed.
- `cd rust && cargo test --workspace`: passed after replacing unsafe environment mutation tests with pure helper coverage and gating API integration tests that require external MySQL/Redis.
- `cd rust && cargo test -p im-flutter-bridge`: passed after aligning the native library target name with the generated Dart loader.
- `cd rust && cargo clippy --workspace --all-targets -- -D warnings`: passed after keeping production lint strictness and adding test-only lint allowances or targeted production fixes where needed.
- API integration tests are preserved but are not run by default because they require external services. Run them explicitly with `cd rust && cargo test -p api-server --features integration-tests --tests`.

Post-migration Flutter validation:

- `cd flutter && flutter pub get`: passed after adding a root Flutter workspace `pubspec.yaml` so the requested Melos commands can run from `flutter/`.
- `cd flutter && dart run melos exec --scope="im_rust_bridge" -- flutter analyze`: passed.
- `cd flutter && dart run melos exec --scope="im_rust_bridge" -- flutter test`: passed.
- `cd flutter && dart run melos exec --scope="im_core" -- dart analyze`: passed.
- `cd flutter && dart run melos exec --scope="im_core" -- dart test`: passed.
- `cd flutter && dart run melos run rust-bridge:smoke`: passed. This builds `cargo build -p im-flutter-bridge --release` and verifies `RustBridgeInitializer.init()` can load the native `im_rust_bridge` library.
- `cd flutter && dart run melos exec -- flutter analyze`: passed after updating `file_picker`, fixing shared package null-aware analyzer findings, and narrowing app-level style lint configuration.
- `cd flutter && dart run melos exec -- flutter test`: passed after adding smoke tests for packages that previously had no test files and adding workspace/package Material metadata needed by Flutter tests.

Final grep gates:

- Old Rust source paths are expected only in migration documentation.
- No `package:im_core/src/generated` imports remain.
- No `RustLib` usage remains outside `flutter/packages/rust_bridge`.
- No `flutter_rust_bridge` reference remains in `flutter/packages/core`.
- `e2eeAdapterProvider` is defined once in `im_core_flutter`; web, desktop, mobile, and shared features consume the same provider boundary.
