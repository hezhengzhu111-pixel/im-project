import 'package:test/test.dart';
import 'package:im_core/src/services/error_reporter_port.dart';
import 'package:im_core/src/logging/sanitized_error.dart';

class _TestErrorReporterAdapter implements ErrorReporterPort {
  final List<SanitizedError> errors = [];
  final List<String> messages = [];

  @override
  void reportError(SanitizedError error) {
    errors.add(error);
  }

  @override
  void reportMessage(String message, {String? level}) {
    messages.add(message);
  }
}

void main() {
  group('ErrorReporterPort', () {
    test('accepts SanitizedError', () {
      final adapter = _TestErrorReporterAdapter();
      final sanitized = SanitizedError(
        errorType: 'Exception',
        category: 'unknown_error',
        safeMessage: 'test error',
      );
      adapter.reportError(sanitized);

      expect(adapter.errors.length, 1);
      expect(adapter.errors[0].errorType, 'Exception');
      expect(adapter.errors[0].category, 'unknown_error');
    });

    test('NoopErrorReporterPort accepts SanitizedError', () {
      final noop = NoopErrorReporterPort();
      noop.reportError(SanitizedError(
        errorType: 'Exception',
        category: 'unknown_error',
        safeMessage: 'test',
      ));
      noop.reportMessage('info', level: 'info');
      // no exception = pass
    });
  });
}
