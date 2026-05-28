import 'package:flutter_test/flutter_test.dart';
import 'package:im_web/core/logging/error_sanitizer.dart';

class CustomTestException implements Exception {
  CustomTestException(this.message);
  final String message;
  @override
  String toString() => 'CustomTestException: $message';
}

void main() {
  group('ErrorSanitizer - generic sanitization', () {
    late ErrorSanitizer sanitizer;

    setUp(() {
      sanitizer = ErrorSanitizer();
    });

    test('strips token= from message', () {
      final result = sanitizer.sanitize(
        Exception('request failed token=abc123def'),
        null,
      );
      expect(result.safeMessage, isNot(contains('abc123def')));
      expect(result.safeMessage, contains('token=***'));
    });

    test('strips Bearer token', () {
      final result = sanitizer.sanitize(
        Exception('auth failed Bearer eyJhbGciOiJIUzI1NiJ9.payload.sig'),
        null,
      );
      expect(result.safeMessage, isNot(contains('eyJhbGciOiJIUzI1NiJ9')));
      expect(result.safeMessage, contains('Bearer ***'));
    });

    test('strips email address', () {
      final result = sanitizer.sanitize(
        Exception('user test@example.com not found'),
        null,
      );
      expect(result.safeMessage, isNot(contains('test@example.com')));
      expect(result.safeMessage, contains('***@***'));
    });

    test('strips phone number (11 digits)', () {
      final result = sanitizer.sanitize(
        Exception('call 13812345678 failed'),
        null,
      );
      expect(result.safeMessage, isNot(contains('13812345678')));
      expect(result.safeMessage, contains('***'));
    });

    test('strips JWT in token= parameter', () {
      final result = sanitizer.sanitize(
        Exception(
            'token=eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.signature'),
        null,
      );
      expect(result.safeMessage,
          isNot(contains('eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9')));
      expect(result.safeMessage, contains('token=***'));
    });

    test('sets category to unknown_error for generic exceptions', () {
      final result = sanitizer.sanitize(Exception('test'), null);
      expect(result.category, 'unknown_error');
    });

    test('preserves errorType as runtimeType name', () {
      final result =
          sanitizer.sanitize(CustomTestException('test'), null);
      expect(result.errorType, 'CustomTestException');
    });
  });
}
