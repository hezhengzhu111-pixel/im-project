import '../generated/frb_generated.dart';

/// Initializes the Flutter Rust Bridge for E2EE crypto operations.
///
/// Call this once at app startup before using any E2EE functionality.
class RustBridgeInitializer {
  RustBridgeInitializer._();

  /// Initialize the Rust library. Must be called before any E2EE operations.
  static Future<void> init() => RustLib.init();
}
