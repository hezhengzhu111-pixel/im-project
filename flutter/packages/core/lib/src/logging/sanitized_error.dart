/// Sanitized error representation for safe logging and reporting.
///
/// Contains only non-sensitive information extracted from an original error.
class SanitizedError {
  const SanitizedError({
    required this.errorType,
    required this.category,
    required this.safeMessage,
    this.stackTrace,
  });

  /// Original exception type name, e.g. "DioException".
  final String errorType;

  /// Category tag: http_error / ws_error / e2ee_error / unknown_error.
  final String category;

  /// Error message with sensitive data stripped.
  final String safeMessage;

  /// Stack trace with sensitive-path frames filtered out.
  final StackTrace? stackTrace;
}
