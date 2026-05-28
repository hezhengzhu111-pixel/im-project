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

    test('strips E2EE envelope from message when category is e2ee', () {
      final result = sanitizer.sanitize(
        Exception('decrypt failed envelope=abc123secret'),
        null,
        category: 'e2ee',
      );
      expect(result.safeMessage, isNot(contains('abc123secret')));
      expect(result.safeMessage, contains('envelope=***'));
    });

    test('strips E2EE session from message when category is e2ee', () {
      final result = sanitizer.sanitize(
        Exception('decrypt failed session=xyz789key'),
        null,
        category: 'e2ee',
      );
      expect(result.safeMessage, isNot(contains('xyz789key')));
      expect(result.safeMessage, contains('session=***'));
    });

    test('strips WS ticket from message when category is ws', () {
      final result = sanitizer.sanitize(
        Exception('ws handshake failed ticket=t-abc123'),
        null,
        category: 'ws',
      );
      expect(result.safeMessage, isNot(contains('t-abc123')));
      expect(result.safeMessage, contains('ticket=***'));
    });

    test('sets category to e2ee_error when hint is e2ee', () {
      final result = sanitizer.sanitize(Exception('test'), null, category: 'e2ee');
      expect(result.category, 'e2ee_error');
    });

    test('sets category to ws_error when hint is ws', () {
      final result = sanitizer.sanitize(Exception('test'), null, category: 'ws');
      expect(result.category, 'ws_error');
    });
  });

  group('ErrorSanitizer - StackTrace filtering', () {
    late ErrorSanitizer sanitizer;

    setUp(() {
      sanitizer = ErrorSanitizer();
    });

    test('filters frames containing .env', () {
      final stack = StackTrace.fromString('''
#0      main (file:///project/.env.dart:10:5)
#1      main (file:///project/lib/main.dart:20:3)
''');
      final result = sanitizer.sanitize(Exception('test'), stack);
      expect(result.stackTrace.toString(), isNot(contains('.env')));
      expect(result.stackTrace.toString(), contains('main.dart'));
    });

    test('filters frames containing credentials', () {
      final stack = StackTrace.fromString('''
#0      loadCredentials (file:///project/credentials.dart:10:5)
#1      main (file:///project/lib/main.dart:20:3)
''');
      final result = sanitizer.sanitize(Exception('test'), stack);
      expect(result.stackTrace.toString(), isNot(contains('credentials')));
      expect(result.stackTrace.toString(), contains('main.dart'));
    });

    test('preserves normal frames', () {
      final stack = StackTrace.fromString('''
#0      main (file:///project/lib/main.dart:10:5)
#1      run (file:///project/lib/app.dart:20:3)
''');
      final result = sanitizer.sanitize(Exception('test'), stack);
      expect(result.stackTrace.toString(), contains('main.dart'));
      expect(result.stackTrace.toString(), contains('app.dart'));
    });

    test('returns null stackTrace when input is null', () {
      final result = sanitizer.sanitize(Exception('test'), null);
      expect(result.stackTrace, isNull);
    });
  });
}
