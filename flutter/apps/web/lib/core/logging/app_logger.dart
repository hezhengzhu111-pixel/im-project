import 'package:flutter/foundation.dart';
import 'package:im_core/core.dart';

/// Unified logger for the Flutter Web app.
///
/// - `debug`/`info` only output in debug mode (kDebugMode).
/// - `warn`/`error` always output.
/// - `error` also reports to [ErrorReporterPort] with `runtimeType` only.
class AppLogger {
  AppLogger._(this._errorReporter);

  final ErrorReporterPort? _errorReporter;
  static AppLogger? _instance;

  static AppLogger get instance => _instance ??= AppLogger._(null);

  /// Initialize with an [ErrorReporterPort] for structured error capture.
  static void init({ErrorReporterPort? errorReporter}) {
    _instance = AppLogger._(errorReporter);
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

  void error(String message, Object error) {
    final typeName = error.runtimeType.toString();
    debugPrint('[im:error] $message (type: $typeName)');
    _errorReporter?.reportError(
      SanitizedError(
        errorType: typeName,
        category: 'unknown_error',
        safeMessage: '$message (type: $typeName)',
      ),
    );
  }
}
