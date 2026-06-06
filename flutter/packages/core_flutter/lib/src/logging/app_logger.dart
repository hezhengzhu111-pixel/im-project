import 'package:flutter/foundation.dart';
import 'package:im_core/core.dart';
import 'error_sanitizer.dart';

/// Unified logger for Flutter apps (both desktop and mobile).
///
/// - `debug`/`info` only output in debug mode (kDebugMode).
/// - `warn`/`error` always output.
/// - `error` sanitizes the error before reporting to [ErrorReporterPort].
class AppLogger {
  AppLogger._(this._tag, this._errorReporter, this._sanitizer);

  final String _tag;
  final ErrorReporterPort? _errorReporter;
  final ErrorSanitizer _sanitizer;
  static AppLogger? _instance;

  static AppLogger get instance =>
      _instance ??= AppLogger._('im', null, ErrorSanitizer());

  /// Initialize with an [ErrorReporterPort] for structured error capture.
  static void init({
    String tag = 'im',
    ErrorReporterPort? errorReporter,
    ErrorSanitizer? sanitizer,
  }) {
    _instance = AppLogger._(
      tag,
      errorReporter,
      sanitizer ?? ErrorSanitizer(),
    );
  }

  void debug(String message) {
    if (!kDebugMode) return;
    debugPrint('[$_tag:debug] $message');
  }

  void info(String message) {
    if (!kDebugMode) return;
    debugPrint('[$_tag:info] $message');
  }

  void warn(String message, [Object? error, StackTrace? stackTrace]) {
    debugPrint('[$_tag:warn] $message');
    if (error != null) debugPrint('[$_tag:warn] detail: $error');
    if (stackTrace != null) debugPrint('[$_tag:warn] stack: $stackTrace');
  }

  void error(
    String message,
    Object error, [
    StackTrace? stackTrace,
    String? category,
  ]) {
    final sanitized = _sanitizer.sanitize(
      error,
      stackTrace,
      category: category,
    );
    debugPrint(
      '[$_tag:error] $message (type: ${sanitized.errorType}): $error',
    );
    if (stackTrace != null) {
      debugPrint('[$_tag:error] stack: $stackTrace');
    }
    _errorReporter?.reportError(sanitized);
  }
}
