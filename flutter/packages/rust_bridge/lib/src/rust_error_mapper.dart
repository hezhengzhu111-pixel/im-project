class RustBridgeException implements Exception {
  const RustBridgeException(this.message, [this.stackTrace]);

  final String message;
  final StackTrace? stackTrace;

  @override
  String toString() => 'RustBridgeException: $message';
}

RustBridgeException mapRustError(
  Object error, [
  StackTrace? stackTrace,
]) {
  return RustBridgeException('Rust bridge operation failed.', stackTrace);
}
