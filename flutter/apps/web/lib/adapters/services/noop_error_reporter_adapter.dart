import 'package:im_core/core.dart';

/// Web adapter for error reporting. Currently Noop.
/// Replace with real SDK (e.g., Sentry) when ready.
class NoopErrorReporterAdapter implements ErrorReporterPort {
  @override
  void reportError(Object error, StackTrace? stackTrace, {Map<String, dynamic>? extra}) {}

  @override
  void reportMessage(String message, {String? level}) {}
}
