/// Classifies send errors as retryable or non-retryable.
///
/// This module centralizes the error classification logic previously scattered
/// in ChatNotifierWithOutbox._isNetworkError(). The classifier determines
/// whether a failed message send should be enqueued to the outbox for retry
/// or immediately marked as failed.
///
/// Retryable errors (network/temporary):
/// - Socket exceptions, connection errors
/// - Network timeouts (connection, send, receive)
/// - Network unreachable
/// - Broken pipe, connection reset
/// - HTTP 5xx (server errors)
/// - Temporary DNS failures
///
/// Non-retryable errors (permanent/business):
/// - HTTP 4xx (client errors: 400, 401, 403, 404, 409, 422)
/// - Validation errors
/// - Permission denied
/// - E2EE state errors
/// - Business rule failures
/// - Unknown errors (default: not retryable to avoid infinite retries)

/// Result of classifying a send error.
class RetryDecision {
  const RetryDecision({
    required this.retryable,
    required this.reason,
    this.safeMessage,
  });

  /// Whether the error is retryable (should enqueue to outbox).
  final bool retryable;

  /// Human-readable reason for the classification.
  final String reason;

  /// Safe error message for UI display (no sensitive data).
  final String? safeMessage;

  /// Create a retryable decision.
  const RetryDecision.retryable({String reason = 'network_error'})
      : retryable = true,
        reason = reason,
        safeMessage = null;

  /// Create a non-retryable decision.
  const RetryDecision.notRetryable({
    required this.reason,
    this.safeMessage,
  }) : retryable = false;
}

/// Centralized error classifier for message send failures.
///
/// This replaces the scattered string matching in ChatNotifierWithOutbox
/// and provides a single source of truth for error classification.
class RetryableErrorClassifier {
  /// Classify a send error as retryable or not.
  ///
  /// Returns a [RetryDecision] indicating whether the error should be
  /// retried (enqueued to outbox) or immediately failed.
  static RetryDecision classifySendError(Object error) {
    // Non-Exception objects (e.g., String, custom types) are not retryable.
    if (error is! Exception) {
      return RetryDecision.notRetryable(
        reason: 'non_exception',
        safeMessage: 'send_failed',
      );
    }

    final msg = error.toString().toLowerCase();

    // --- Network-level failures (retryable) ---

    // Socket exceptions
    if (msg.contains('socketexception')) {
      return const RetryDecision.retryable(reason: 'socket_exception');
    }

    // Connection errors
    if (msg.contains('connection refused')) {
      return const RetryDecision.retryable(reason: 'connection_refused');
    }
    if (msg.contains('connection reset')) {
      return const RetryDecision.retryable(reason: 'connection_reset');
    }
    if (msg.contains('broken pipe')) {
      return const RetryDecision.retryable(reason: 'broken_pipe');
    }

    // Timeout errors
    if (msg.contains('connection timed out') ||
        msg.contains('connecttimeout') ||
        msg.contains('sendtimeout') ||
        msg.contains('receivetimeout')) {
      return const RetryDecision.retryable(reason: 'timeout');
    }

    // Network unreachable
    if (msg.contains('network is unreachable') ||
        msg.contains('network unreachable')) {
      return const RetryDecision.retryable(reason: 'network_unreachable');
    }

    // Generic network error patterns
    if (msg.contains('network error') || msg.contains('networkerror')) {
      return const RetryDecision.retryable(reason: 'network_error');
    }

    // --- HTTP status code patterns (if recognizable) ---

    // HTTP 5xx (server errors - retryable)
    if (_containsHttp5xx(msg)) {
      return const RetryDecision.retryable(reason: 'server_error');
    }

    // HTTP 4xx (client errors - not retryable)
    if (_containsHttp4xx(msg)) {
      final statusCode = _extractHttpStatusCode(msg);
      return RetryDecision.notRetryable(
        reason: 'client_error_$statusCode',
        safeMessage: 'send_failed',
      );
    }

    // --- Business/validation errors (not retryable) ---

    if (msg.contains('validation') || msg.contains('invalid')) {
      return const RetryDecision.notRetryable(
        reason: 'validation_error',
        safeMessage: 'send_failed',
      );
    }

    if (msg.contains('permission denied') || msg.contains('unauthorized')) {
      return const RetryDecision.notRetryable(
        reason: 'permission_error',
        safeMessage: 'permission_denied',
      );
    }

    if (msg.contains('forbidden')) {
      return const RetryDecision.notRetryable(
        reason: 'forbidden',
        safeMessage: 'permission_denied',
      );
    }

    // E2EE state errors
    if (msg.contains('e2ee_not_ready') ||
        msg.contains('e2ee_encrypt_failed') ||
        msg.contains('remote device id') ||
        msg.contains('e2ee session')) {
      return const RetryDecision.notRetryable(
        reason: 'e2ee_state_error',
        safeMessage: 'e2ee_error',
      );
    }

    // --- Default: not retryable ---
    // Unknown errors should not be retried to avoid infinite retry loops.
    // Business logic errors, unexpected exceptions, etc. fall here.
    return const RetryDecision.notRetryable(
      reason: 'unknown',
      safeMessage: 'send_failed',
    );
  }

  /// Check if the error message contains HTTP 5xx status codes.
  static bool _containsHttp5xx(String msg) {
    return RegExp(r'\b5\d{2}\b').hasMatch(msg) &&
        (msg.contains('http') ||
            msg.contains('status') ||
            msg.contains('response') ||
            msg.contains('server') ||
            msg.contains('gateway') ||
            msg.contains('unavailable'));
  }

  /// Check if the error message contains HTTP 4xx status codes.
  static bool _containsHttp4xx(String msg) {
    return RegExp(r'\b4\d{2}\b').hasMatch(msg) &&
        (msg.contains('http') ||
            msg.contains('status') ||
            msg.contains('response') ||
            msg.contains('bad request') ||
            msg.contains('unauthorized') ||
            msg.contains('forbidden') ||
            msg.contains('not found'));
  }

  /// Extract HTTP status code from error message.
  static int? _extractHttpStatusCode(String msg) {
    final match = RegExp(r'\b(4\d{2})\b').firstMatch(msg);
    if (match != null) {
      return int.tryParse(match.group(1)!);
    }
    return null;
  }

  /// Returns a safe, non-sensitive error code/type for persisting in the outbox.
  ///
  /// This must never include raw exception text, response bodies, tokens, or the
  /// original message content. Use [classifySendError] to obtain a structured
  /// decision and return its [RetryDecision.reason].
  static String safeErrorCode(Object error) {
    return classifySendError(error).reason;
  }
}
