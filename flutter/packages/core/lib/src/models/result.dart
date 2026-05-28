sealed class Result<T> {
  const Result();
}

class Success<T> extends Result<T> {
  const Success(this.data);
  final T data;
}

class FailureError {
  const FailureError(this.message, {this.code, this.source});
  final String message;
  final String? code;
  final String? source;

  @override
  String toString() => 'FailureError: $message';
}

class Failure<T> extends Result<T> {
  const Failure(this.error);
  final FailureError error;
}
