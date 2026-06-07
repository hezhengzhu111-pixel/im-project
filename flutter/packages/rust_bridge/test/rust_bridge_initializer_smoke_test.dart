import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:im_rust_bridge/im_rust_bridge.dart';

void main() {
  test(
    'RustBridgeInitializer loads the native bridge library',
    () async {
      await RustBridgeInitializer.init();
      RustBridgeInitializer.dispose();
    },
    skip: Platform.environment['IM_RUST_BRIDGE_SMOKE'] == '1'
        ? false
        : 'Set IM_RUST_BRIDGE_SMOKE=1 after building the Rust release library.',
  );
}
