import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Tracks the initialization status of the Rust bridge.
///
/// The value is a [StateController] so the bootstrap code in [main] can update
/// it without needing a [ProviderContainer]. UI code watches
/// `ref.watch(rustBridgeInitProvider).state` to observe loading / success /
/// failure.
final rustBridgeInitProvider = Provider<StateController<AsyncValue<void>>>((ref) {
  throw UnimplementedError(
    'rustBridgeInitProvider must be overridden at app startup',
  );
});
