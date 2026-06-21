import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Warms up the Rust bridge and exposes the result through [status].
///
/// [init] is a tear-off of the concrete bridge initializer (e.g.
/// [RustGateway.init]) so tests can supply a fake without implementing the
/// full bridge interface.
void warmUpRustBridge(
  Future<void> Function() init,
  StateController<AsyncValue<void>> status,
) {
  unawaited(
    init().then((_) {
      status.state = const AsyncValue.data(null);
    }).catchError((Object error, StackTrace stackTrace) {
      status.state = AsyncValue.error(error, stackTrace);
      FlutterError.reportError(
        FlutterErrorDetails(
          exception: error,
          stack: stackTrace,
          library: 'im_web',
          context: ErrorDescription('while warming up the Rust bridge'),
        ),
      );
    }),
  );
}
