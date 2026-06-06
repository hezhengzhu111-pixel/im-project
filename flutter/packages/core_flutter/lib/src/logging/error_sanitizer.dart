import 'package:dio/dio.dart';
import 'package:im_core/core.dart';

/// Sanitizes error objects to remove sensitive information before
/// logging/reporting.
///
/// Detection priority:
/// 1. Caller-provided category hint
/// 2. DioException type matching
/// 3. Generic pattern stripping
class ErrorSanitizer {
  /// Matches token=VALUE patterns
  static final _tokenPattern = RegExp(r'token=[^\s&]+');

  /// Matches Bearer TOKEN patterns
  static final _bearerPattern =
      RegExp(r'Bearer\s+[A-Za-z0-9\-._~+/]+=*');

  /// Matches email addresses
  static final _emailPattern = RegExp(r'[^\s@]+@[^\s@]+\.[^\s@]+');

  /// Matches 11-digit phone numbers (Chinese mobile)
  static final _phonePattern = RegExp(r'\b1[3-9]\d{9}\b');

  /// Matches URL query strings
  static final _queryPattern = RegExp(r'\?[^#"\s]*');

  /// Matches envelope=VALUE patterns (E2EE)
  static final _envelopePattern = RegExp(r'envelope=[^\s&]+');

  /// Matches session=VALUE patterns (E2EE)
  static final _sessionPattern = RegExp(r'session=[^\s&]+');

  /// Matches deviceId=VALUE patterns (E2EE, camelCase)
  static final _deviceIdCamelPattern = RegExp(r'deviceId=[^\s&]+');

  /// Matches device_id=VALUE patterns (E2EE, snake_case)
  static final _deviceIdSnakePattern = RegExp(r'device_id=[^\s&]+');

  /// Matches ticket=VALUE patterns (WebSocket)
  static final _ticketPattern = RegExp(r'ticket=[^\s&]+');

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
  /// [category] is an optional hint from the caller
  /// (e.g. 'e2ee', 'ws', 'http').
  SanitizedError sanitize(
    Object error,
    StackTrace? stackTrace, {
    String? category,
  }) {
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
    if (error is DioException) {
      return 'http_error';
    }
    return 'unknown_error';
  }

  String _sanitizeMessage(Object error, String? category) {
    if (error is DioException) {
      return _sanitizeDio(error);
    }
    final raw = error.toString();
    var sanitized = _stripGenericPatterns(raw);

    if (category == 'e2ee') {
      sanitized = _stripE2eePatterns(sanitized);
    } else if (category == 'ws') {
      sanitized = _stripWsPatterns(sanitized);
    }

    return sanitized;
  }

  String _sanitizeDio(DioException error) {
    final parts = <String>[];

    // Status code (safe)
    final statusCode = error.response?.statusCode;
    if (statusCode != null) {
      parts.add('status=$statusCode');
    }

    // Dio error type (safe)
    parts.add('type=${error.type}');

    // Message without sensitive details
    final message = error.message;
    if (message != null) {
      parts.add('message=${_stripGenericPatterns(message)}');
    }

    // URI path without query params
    final path = error.requestOptions.uri.path;
    if (path.isNotEmpty) {
      parts.add('path=$path');
    }

    return parts.join(', ');
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
    result = result.replaceAll(_envelopePattern, 'envelope=***');
    result = result.replaceAll(_sessionPattern, 'session=***');
    result = result.replaceAll(_deviceIdCamelPattern, 'deviceId=***');
    result = result.replaceAll(_deviceIdSnakePattern, 'device_id=***');
    return result;
  }

  String _stripWsPatterns(String input) {
    return input.replaceAll(_ticketPattern, 'ticket=***');
  }

  StackTrace? _filterStackTrace(StackTrace? stackTrace) {
    if (stackTrace == null) return null;
    final lines = stackTrace.toString().split('\n');
    final filtered = lines.where((line) {
      final lower = line.toLowerCase();
      return !_sensitivePathKeywords
          .any((kw) => lower.contains(kw));
    });
    return StackTrace.fromString(filtered.join('\n'));
  }
}
