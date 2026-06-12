import 'generated/frb_generated.dart';
import 'package:flutter_rust_bridge/flutter_rust_bridge_for_generated.dart';

/// Initializes the Flutter Rust Bridge for E2EE crypto operations.
///
/// The bridge can be warmed at app startup, but E2EE callers should also call
/// it lazily before crossing into Rust. This wrapper makes repeated and
/// concurrent calls safe, and clears failed attempts so a later operation can
/// retry after transient web loader failures.
class RustBridgeInitializer {
  RustBridgeInitializer._();

  static Future<void>? _initFuture;
  static bool _initialized = false;

  /// Initialize the Rust library. Must be called before any E2EE operations.
  static Future<void> init({
    ExternalLibrary? externalLibrary,
    Future<void> Function({ExternalLibrary? externalLibrary})? initRustLib,
    bool Function()? isRustLibInitialized,
  }) {
    final isInitialized = isRustLibInitialized ?? _defaultIsInitialized;
    if (_initialized || isInitialized()) {
      _initialized = true;
      return Future.value();
    }

    final pending = _initFuture;
    if (pending != null) return pending;

    final initFn = initRustLib ?? RustLib.init;
    final future = _initialize(
      externalLibrary: externalLibrary,
      initRustLib: initFn,
      isRustLibInitialized: isInitialized,
    );
    _initFuture = future;
    return future;
  }

  /// Dispose the Rust library entrypoint.
  ///
  /// Production apps do not need to call this; smoke tests use it to avoid
  /// leaking initialized FRB state between test processes.
  static void dispose() {
    _initFuture = null;
    _initialized = false;
    if (RustLib.instance.initialized) {
      RustLib.dispose();
    }
  }

  static void resetForTesting() {
    _initFuture = null;
    _initialized = false;
  }

  static Future<void> _initialize({
    required ExternalLibrary? externalLibrary,
    required Future<void> Function({ExternalLibrary? externalLibrary})
        initRustLib,
    required bool Function() isRustLibInitialized,
  }) async {
    try {
      if (_initialized || isRustLibInitialized()) {
        _initialized = true;
        return;
      }

      await initRustLib(externalLibrary: externalLibrary);
      _initialized = true;
    } on StateError catch (error) {
      if (_isDuplicateInit(error) && isRustLibInitialized()) {
        _initialized = true;
        return;
      }
      _initFuture = null;
      rethrow;
    } catch (_) {
      _initFuture = null;
      rethrow;
    }
  }

  static bool _defaultIsInitialized() => RustLib.instance.initialized;

  static bool _isDuplicateInit(StateError error) {
    return error.message.contains(
      'Should not initialize flutter_rust_bridge twice',
    );
  }
}
