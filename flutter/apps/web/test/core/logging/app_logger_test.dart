import 'package:flutter_test/flutter_test.dart';
import 'package:im_core/core.dart';
import 'package:im_web/core/logging/app_logger.dart';
import 'package:im_web/core/logging/error_sanitizer.dart';

class _MockErrorReporter implements ErrorReporterPort {
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
  group('AppLogger.error', () {
    late _MockErrorReporter reporter;

    setUp(() {
      reporter = _MockErrorReporter();
      AppLogger.init(errorReporter: reporter, sanitizer: ErrorSanitizer());
    });

    test('reports sanitized error - no token leakage', () {
      AppLogger.instance.error(
        'Request failed',
        Exception('token=supersecret123'),
      );

      expect(reporter.errors.length, 1);
      expect(reporter.errors[0].safeMessage, isNot(contains('supersecret123')));
      expect(reporter.errors[0].safeMessage, contains('token=***'));
    });

    test('reports sanitized error - no email leakage', () {
      AppLogger.instance.error(
        'User lookup failed',
        Exception('user admin@example.com not found'),
      );

      expect(reporter.errors.length, 1);
      expect(reporter.errors[0].safeMessage, isNot(contains('admin@example.com')));
    });

    test('passes category hint through to sanitized error', () {
      AppLogger.instance.error(
        'E2EE decrypt failed',
        Exception('decrypt failed envelope=abc123'),
        null,
        'e2ee',
      );

      expect(reporter.errors.length, 1);
      expect(reporter.errors[0].category, 'e2ee_error');
      expect(reporter.errors[0].safeMessage, isNot(contains('abc123')));
    });

    test('errorType is runtimeType name', () {
      AppLogger.instance.error('test', Exception('msg'));

      expect(reporter.errors[0].errorType, isNot(isEmpty));
    });

    test('reportError receives SanitizedError, not raw Object', () {
      AppLogger.instance.error('test', Exception('raw message'));

      expect(reporter.errors[0], isA<SanitizedError>());
      expect(reporter.errors[0].errorType, isNot(isEmpty));
      expect(reporter.errors[0].category, isNotEmpty);
    });
  });
}
