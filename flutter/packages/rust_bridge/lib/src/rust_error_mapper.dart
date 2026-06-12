class RustBridgeException implements Exception {
  const RustBridgeException({
    required this.operation,
    required this.code,
    required this.errorType,
    this.stackTrace,
  });

  final String operation;
  final String code;
  final String errorType;
  final StackTrace? stackTrace;

  @override
  String toString() {
    return 'RustBridgeException($code, '
        'operation: $operation, errorType: $errorType)';
  }
}

RustBridgeException mapRustError(
  String operation,
  Object error, [
  StackTrace? stackTrace,
]) {
  return RustBridgeException(
    operation: _sanitizeOperation(operation),
    code: 'rust_bridge_failed',
    errorType: _sanitizeType(error.runtimeType.toString()),
    stackTrace: stackTrace,
  );
}

String _sanitizeOperation(String operation) {
  if (operation.isEmpty) return 'unknown';
  return operation.replaceAll(RegExp(r'[^A-Za-z0-9_.:-]'), '_');
}

String _sanitizeType(String errorType) {
  if (errorType.isEmpty) return 'Object';
  final sanitized = errorType.replaceAll(RegExp(r'[^A-Za-z0-9_.<>:-]'), '_');
  return sanitized.length <= 80 ? sanitized : sanitized.substring(0, 80);
}
