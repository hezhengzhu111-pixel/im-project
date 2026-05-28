import 'package:flutter/foundation.dart';
import 'package:im_core/core.dart';
import 'package:im_web/core/logging/error_sanitizer.dart';

/// Unified logger for the Flutter Web app.
///
/// - `debug`/`info` only output in debug mode (kDebugMode).
/// - `warn`/`error` always output.
/// - `error` sanitizes the error before reporting to [ErrorReporterPort].
class AppLogger {
  AppLogger._(this._errorReporter, this._sanitizer);

  final ErrorReporterPort? _errorReporter;
  final ErrorSanitizer _sanitizer;
  static AppLogger? _instance;

  static AppLogger get instance =>
      _instance ??= AppLogger._(null, ErrorSanitizer());

  /// Initialize with an [ErrorReporterPort] for structured error capture.
  static void init({
    ErrorReporterPort? errorReporter,
    ErrorSanitizer? sanitizer,
  }) {
    _instance = AppLogger._(errorReporter, sanitizer ?? ErrorSanitizer());
  }

  void debug(String message) {
    if (!kDebugMode) return;
    debugPrint('[im:debug] $message');
  }

  void info(String message) {
    if (!kDebugMode) return;
    debugPrint('[im:info] $message');
  }

  void warn(String message) {
    debugPrint('[im:warn] $message');
  }

  void error(String message, Object error,
      [StackTrace? stackTrace, String? category]) {
    final sanitized =
        _sanitizer.sanitize(error, stackTrace, category: category);
    debugPrint('[im:error] $message (type: ${sanitized.errorType})');
    _errorReporter?.reportError(sanitized);
  }
}
