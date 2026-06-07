import 'generated/frb_generated.dart';
import 'package:flutter_rust_bridge/flutter_rust_bridge_for_generated.dart';

/// Initializes the Flutter Rust Bridge for E2EE crypto operations.
///
/// Call this once at app startup before using any E2EE functionality.
class RustBridgeInitializer {
  RustBridgeInitializer._();

  /// Initialize the Rust library. Must be called before any E2EE operations.
  static Future<void> init({ExternalLibrary? externalLibrary}) {
    return RustLib.init(externalLibrary: externalLibrary);
  }

  /// Dispose the Rust library entrypoint.
  ///
  /// Production apps do not need to call this; smoke tests use it to avoid
  /// leaking initialized FRB state between test processes.
  static void dispose() => RustLib.dispose();
}
