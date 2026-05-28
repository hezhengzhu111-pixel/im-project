sealed class FailureError {
  const FailureError();
}

class UnsupportedCapability extends FailureError {
  const UnsupportedCapability(this.capability);
  final String capability;
}

class PermissionDenied extends FailureError {
  const PermissionDenied(this.capability);
  final String capability;
}

class OperationCancelled extends FailureError {
  const OperationCancelled();
}

class UnknownError extends FailureError {
  const UnknownError(this.message, [this.stackTrace]);
  final String message;
  final StackTrace? stackTrace;
}
