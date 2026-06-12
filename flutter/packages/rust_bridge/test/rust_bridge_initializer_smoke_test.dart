import 'dart:io';

import 'package:flutter_rust_bridge/flutter_rust_bridge_for_generated.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:im_rust_bridge/im_rust_bridge.dart';

void main() {
  test(
    'RustBridgeInitializer loads the native bridge library',
    () async {
      final libraryPath = Platform.environment['IM_RUST_BRIDGE_DYLIB_PATH'];
      await RustBridgeInitializer.init(
        externalLibrary: libraryPath == null || libraryPath.isEmpty
            ? null
            : ExternalLibrary.open(libraryPath),
      );
      RustBridgeInitializer.dispose();
    },
    skip: Platform.environment['IM_RUST_BRIDGE_SMOKE'] == '1'
        ? false
        : 'Set IM_RUST_BRIDGE_SMOKE=1 after building the Rust release library.',
  );
}
