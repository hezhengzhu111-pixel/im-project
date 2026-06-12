# Post Rust Bridge Boundary Cleanup Result

Date: 2026-06-07
Branch: `refactor/post-rust-bridge-boundary-cleanup`

## Summary

This pass closes the remaining Flutter/Rust bridge boundary gaps after the unified Rust workspace migration.

Completed outcomes:

- `im-flutter-bridge` now exposes only E2EE bridge APIs.
- `im_rust_bridge` remains the only Flutter package that owns generated FRB Dart code.
- `im_core`, `im_core_flutter`, `im_shared_features`, and apps do not import FRB generated code directly.
- Web E2EE orchestration now reuses shared providers, with only web storage/cache adapters remaining app-specific.
- Desktop WebSocket startup now follows the authenticated shared lifecycle instead of connecting before auth.
- Rust bridge smoke/build scripts are cross-platform Dart scripts, not local PowerShell paths.
- CI now includes Rust bridge build/test/smoke and architecture boundary checks.

## Rust Bridge Boundary

`rust/crates/im-flutter-bridge/src/api/mod.rs` now exposes only:

```rust
pub mod e2ee;
```

Removed bridge modules:

- `network`
- `storage`
- `secure_storage`

Generated Dart under `flutter/packages/rust_bridge/lib/src/generated/api/` now only contains the E2EE API. No generated non-E2EE API remains.

The Rust bridge crate dependencies were narrowed accordingly, and unused workspace dependencies for the removed bridge modules were removed.

## Flutter Bridge Package

`flutter/packages/rust_bridge` remains the only package with generated FRB output and direct `flutter_rust_bridge` dependency.

Public boundary:

- `RustGateway`
- `FrbRustGateway`
- `RustBridgeInitializer`
- `RustBridgeException`
- `mapRustError`

Generated files remain internal and are not exported from the public barrel.

## Error Handling

`mapRustError` is now operation-aware:

- It records the bridge operation name.
- It keeps a stable error code.
- It records sanitized error type information.
- It keeps the optional stack trace for diagnostics.
- It does not expose raw Rust/FFI error messages through `RustBridgeException.toString()`.

Added tests verify that key/state/plaintext/ciphertext/token-like material is not leaked through mapped bridge errors.

## Web E2EE Providers

Web now reuses the shared E2EE provider tree from `im_shared_features`.

Web-specific implementations are limited to:

- IndexedDB key store
- IndexedDB session store
- Web sent-message cache

Compatibility re-export stubs remain for old web import paths, but the implementation source of `E2eeApi`, `E2eeMetaStore`, `E2eeManager`, and shared E2EE providers is now in `im_shared_features`.

## Desktop WebSocket Lifecycle

Desktop no longer runs `wsService.connect('$wsBase/ws')` during app startup.

Desktop now configures `DesktopWsAdapter` with:

- `ticketUrl: AuthEndpoints.wsTicket`
- `wsBaseUrl: '$wsBase${WsEndpoints.path}'`
- a ticket provider that fetches authenticated WS tickets
- reconnect logic that fetches a fresh ticket
- heartbeat cleanup
- manual disconnect tracking

This aligns desktop with the shared authenticated lifecycle used by web and mobile.

## Scripts And CI

Melos changes:

- `rust-bridge:smoke` now runs `dart run packages/rust_bridge/tool/rust_bridge_smoke.dart`.
- `build:web` now runs `dart run tool/build_web.dart`.
- Melos scripts use `dart run melos ...` so they do not rely on a global `melos` executable.

CI changes:

- Added `.github/workflows/rust-bridge-ci.yml`.
- Added `scripts/check_architecture_boundaries.py`.

The boundary checker verifies:

- `im_core` has no FRB/generated dependency.
- apps/shared/core_flutter do not import generated FRB code or `RustLib`.
- generated bridge code only lives under `flutter/packages/rust_bridge`.
- non-E2EE generated bridge APIs are absent.
- old Rust paths are absent outside migration docs.
- Melos scripts do not contain hardcoded local absolute paths or PowerShell-only smoke commands.

## Verification

Rust:

```text
cd rust
cargo fmt --check
cargo check --workspace
cargo test --workspace
cargo clippy --workspace --all-targets -- -D warnings
```

Result: passed.

Flutter:

```text
cd flutter
flutter pub get
dart run melos exec -- flutter analyze
dart run melos exec -- flutter test
dart run melos run rust-bridge:smoke
dart run melos run format:check
python ../scripts/check_architecture_boundaries.py
```

Result: passed.

Additional checked commands:

```text
dart run melos run build:web
```

Result: passed. The command emitted existing Flutter warnings for deprecated `--pwa-strategy` usage and `l10n.yaml` `synthetic-package`, but exited successfully.

Final grep gates:

```text
rg -n "package:im_core/src/generated|RustLib|src/generated|frb_generated" flutter/apps flutter/packages/shared_features flutter/packages/core_flutter flutter/packages/core
rg -n "flutter_rust_bridge" flutter/packages/core
rg -n "generated/api/(network|storage|secure_storage)|class NetworkService|class LocalStorage|class SecureKeyStore|class SecureBuffer" flutter rust/crates/im-flutter-bridge
rg -n "D:/project|D:\\project|C:\\|powershell .*rust_bridge_smoke|rust_bridge_smoke\.ps1" flutter/melos.yaml flutter/tool flutter/packages/rust_bridge/tool
```

Result: no matches.

## Notes

`dart run melos run format:check` initially found existing formatting drift across Flutter packages. The workspace was formatted and the command passed on rerun.

The app README files were updated to point maintainers at `im_rust_bridge` and `rust/crates/im-flutter-bridge`, instead of the old app-level FRB guidance.
