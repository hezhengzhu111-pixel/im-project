import 'dart:async';

import 'package:flutter_rust_bridge/flutter_rust_bridge_for_generated.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:im_rust_bridge/im_rust_bridge.dart';

void main() {
  tearDown(RustBridgeInitializer.resetForTesting);

  test('init returns immediately when RustLib is already initialized',
      () async {
    var calls = 0;

    await RustBridgeInitializer.init(
      isRustLibInitialized: () => true,
      initRustLib: ({ExternalLibrary? externalLibrary}) async {
        calls++;
      },
    );

    expect(calls, 0);
  });

  test('concurrent init calls share one RustLib init future', () async {
    final completer = Completer<void>();
    var calls = 0;

    final first = RustBridgeInitializer.init(
      isRustLibInitialized: () => false,
      initRustLib: ({ExternalLibrary? externalLibrary}) {
        calls++;
        return completer.future;
      },
    );
    final second = RustBridgeInitializer.init(
      isRustLibInitialized: () => false,
      initRustLib: ({ExternalLibrary? externalLibrary}) {
        calls++;
        return completer.future;
      },
    );

    expect(calls, 1);
    completer.complete();
    await Future.wait([first, second]);
  });

  test('failed init clears pending future so a later call can retry', () async {
    var calls = 0;

    await expectLater(
      RustBridgeInitializer.init(
        isRustLibInitialized: () => false,
        initRustLib: ({ExternalLibrary? externalLibrary}) async {
          calls++;
          throw StateError('temporary loader failure');
        },
      ),
      throwsStateError,
    );

    await RustBridgeInitializer.init(
      isRustLibInitialized: () => false,
      initRustLib: ({ExternalLibrary? externalLibrary}) async {
        calls++;
      },
    );

    expect(calls, 2);
  });

  test('duplicate init StateError is treated as success when initialized',
      () async {
    var initialized = false;

    await RustBridgeInitializer.init(
      isRustLibInitialized: () => initialized,
      initRustLib: ({ExternalLibrary? externalLibrary}) async {
        initialized = true;
        throw StateError('Should not initialize flutter_rust_bridge twice');
      },
    );
  });
}
