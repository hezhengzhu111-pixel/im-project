import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:im_web/core/di/rust_bridge_init_provider.dart';
import 'package:im_web/core/di/rust_bridge_warmup.dart';

Future<void> _failingInit() async {
  throw Exception('rust bridge exploded');
}

Future<void> _successInit() async {}

void main() {
  group('warmUpRustBridge', () {
    test('sets provider to error on failure', () async {
      final controller =
          StateController<AsyncValue<void>>(const AsyncValue.loading());
      final container = ProviderContainer(
        overrides: [
          rustBridgeInitProvider.overrideWith((ref) {
            ref.onDispose(controller.dispose);
            return controller;
          }),
        ],
      );
      addTearDown(container.dispose);

      warmUpRustBridge(_failingInit, controller);

      // Wait for the unawaited future to complete.
      await pumpEventQueue();

      final state = container.read(rustBridgeInitProvider).state;
      expect(state.hasError, isTrue);
      expect(state.error.toString(), contains('rust bridge exploded'));
    });

    test('sets provider to data on success', () async {
      final controller =
          StateController<AsyncValue<void>>(const AsyncValue.loading());
      final container = ProviderContainer(
        overrides: [
          rustBridgeInitProvider.overrideWith((ref) {
            ref.onDispose(controller.dispose);
            return controller;
          }),
        ],
      );
      addTearDown(container.dispose);

      warmUpRustBridge(_successInit, controller);

      await pumpEventQueue();

      final state = container.read(rustBridgeInitProvider).state;
      expect(state.hasValue, isTrue);
    });
  });
}
