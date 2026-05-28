import 'package:im_core/core.dart';

/// Sanitizes error objects to remove sensitive information before logging/reporting.
///
/// Detection priority:
/// 1. Caller-provided category hint
/// 2. DioException type matching (Task 4)
/// 3. Generic pattern stripping
class ErrorSanitizer {
  /// Matches token=VALUE patterns
  static final _tokenPattern = RegExp(r'token=[^\s&]+');

  /// Matches Bearer TOKEN patterns
  static final _bearerPattern = RegExp(r'Bearer\s+[A-Za-z0-9\-._~+/]+=*');

  /// Matches email addresses
  static final _emailPattern = RegExp(r'[^\s@]+@[^\s@]+\.[^\s@]+');

  /// Matches 11-digit phone numbers (Chinese mobile)
  static final _phonePattern = RegExp(r'\b1[3-9]\d{9}\b');

  /// Matches URL query strings
  static final _queryPattern = RegExp(r'\?[^#"\s]*');

  /// Sensitive path keywords for stack trace filtering
  static const _sensitivePathKeywords = [
    '.env',
    'credentials',
    'secret',
    'token',
    'key',
  ];

  /// Sanitize an error, removing sensitive information.
  ///
  /// [category] is an optional hint from the caller (e.g. 'e2ee', 'ws', 'http').
  SanitizedError sanitize(Object error, StackTrace? stackTrace,
      {String? category}) {
    final errorType = error.runtimeType.toString();
    final resolvedCategory = _resolveCategory(error, category);
    final safeMessage = _sanitizeMessage(error, category);
    final safeStack = _filterStackTrace(stackTrace);

    return SanitizedError(
      errorType: errorType,
      category: resolvedCategory,
      safeMessage: safeMessage,
      stackTrace: safeStack,
    );
  }

  String _resolveCategory(Object error, String? categoryHint) {
    if (categoryHint != null) {
      return switch (categoryHint) {
        'e2ee' => 'e2ee_error',
        'ws' => 'ws_error',
        'http' => 'http_error',
        _ => 'unknown_error',
      };
    }
    // DioException check will be added in Task 4
    return 'unknown_error';
  }

  String _sanitizeMessage(Object error, String? category) {
    final raw = error.toString();
    var sanitized = _stripGenericPatterns(raw);

    if (category == 'e2ee') {
      sanitized = _stripE2eePatterns(sanitized);
    } else if (category == 'ws') {
      sanitized = _stripWsPatterns(sanitized);
    }

    return sanitized;
  }

  String _stripGenericPatterns(String input) {
    var result = input;
    result = result.replaceAll(_tokenPattern, 'token=***');
    result = result.replaceAll(_bearerPattern, 'Bearer ***');
    result = result.replaceAll(_emailPattern, '***@***');
    result = result.replaceAll(_phonePattern, '***');
    result = result.replaceAll(_queryPattern, '?***');
    return result;
  }

  String _stripE2eePatterns(String input) {
    var result = input;
    result = result.replaceAll(RegExp(r'envelope=[^\s&]+'), 'envelope=***');
    result = result.replaceAll(RegExp(r'session=[^\s&]+'), 'session=***');
    result = result.replaceAll(RegExp(r'deviceId=[^\s&]+'), 'deviceId=***');
    result = result.replaceAll(RegExp(r'device_id=[^\s&]+'), 'device_id=***');
    return result;
  }

  String _stripWsPatterns(String input) {
    return input.replaceAll(RegExp(r'ticket=[^\s&]+'), 'ticket=***');
  }

  StackTrace? _filterStackTrace(StackTrace? stackTrace) {
    if (stackTrace == null) return null;
    final lines = stackTrace.toString().split('\n');
    final filtered = lines.where((line) {
      final lower = line.toLowerCase();
      return !_sensitivePathKeywords.any((kw) => lower.contains(kw));
    });
    return StackTrace.fromString(filtered.join('\n'));
  }
}
