import 'package:flutter_test/flutter_test.dart';
import 'package:im_rust_bridge/im_rust_bridge.dart';

void main() {
  test('init maps initializer failures as init failures', () async {
    final gateway = FrbRustGateway(
      initializer: () async => throw _BridgeProbeError(),
    );

    await expectLater(
      gateway.init(),
      throwsA(
        isA<RustBridgeException>()
            .having((error) => error.operation, 'operation', 'init')
            .having((error) => error.code, 'code', 'rust_bridge_failed'),
      ),
    );
  });

  test('E2EE operations attempt lazy initialization before Rust calls',
      () async {
    var initCalls = 0;
    final gateway = FrbRustGateway(
      initializer: () async {
        initCalls++;
        throw _BridgeProbeError();
      },
    );

    await expectLater(
      gateway.generateKeyBundleJson(1),
      throwsA(
        isA<RustBridgeException>().having(
          (error) => error.operation,
          'operation',
          'generateKeyBundleJson',
        ),
      ),
    );
    expect(initCalls, 1);
  });
}

class _BridgeProbeError implements Exception {}
