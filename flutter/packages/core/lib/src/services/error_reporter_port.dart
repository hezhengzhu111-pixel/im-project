/// Abstract port for error/crash reporting services.
///
/// Implementations should send errors to providers like Sentry, Bugsnag, or Crashlytics.
/// Never include sensitive data (tokens, PII) in reports.
abstract class ErrorReporterPort {
  /// Report an exception with optional stack trace and extra context.
  void reportError(Object error, StackTrace? stackTrace, {Map<String, dynamic>? extra});

  /// Report a non-exception message (e.g., warning, info).
  void reportMessage(String message, {String? level});
}

/// Noop implementation that discards all reports.
class NoopErrorReporterPort implements ErrorReporterPort {
  @override
  void reportError(Object error, StackTrace? stackTrace, {Map<String, dynamic>? extra}) {}

  @override
  void reportMessage(String message, {String? level}) {}
}
