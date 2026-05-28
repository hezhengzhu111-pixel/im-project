import 'package:im_core/src/logging/sanitized_error.dart';

/// Abstract port for error/crash reporting services.
///
/// Implementations should send errors to providers like Sentry, Bugsnag, or Crashlytics.
/// Never include sensitive data (tokens, PII) in reports.
abstract class ErrorReporterPort {
  /// Report a sanitized error with no sensitive data.
  void reportError(SanitizedError error);

  /// Report a non-exception message (e.g., warning, info).
  void reportMessage(String message, {String? level});
}

/// Noop implementation that discards all reports.
class NoopErrorReporterPort implements ErrorReporterPort {
  @override
  void reportError(SanitizedError error) {}

  @override
  void reportMessage(String message, {String? level}) {}
}
