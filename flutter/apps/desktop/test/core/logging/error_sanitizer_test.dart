import 'package:flutter_test/flutter_test.dart';
import 'package:im_desktop/core/logging/error_sanitizer.dart';

void main() {
  late ErrorSanitizer sanitizer;

  setUp(() {
    sanitizer = ErrorSanitizer();
  });

  group('ErrorSanitizer', () {
    test('should remove bearer tokens from error message', () {
      final error = Exception('Authorization: Bearer abc123xyz');
      final result = sanitizer.sanitize(error, null);
      expect(result.safeMessage, contains('Bearer ***'));
      expect(result.safeMessage, isNot(contains('abc123xyz')));
    });

    test('should remove email addresses from error message', () {
      final error = Exception('User email: test@example.com');
      final result = sanitizer.sanitize(error, null);
      expect(result.safeMessage, contains('***@***'));
      expect(result.safeMessage, isNot(contains('test@example.com')));
    });

    test('should remove phone numbers from error message', () {
      final error = Exception('Phone: 13800138000');
      final result = sanitizer.sanitize(error, null);
      expect(result.safeMessage, isNot(contains('13800138000')));
    });

    test('should remove token= patterns', () {
      final error = Exception('Request failed token=secretvalue123');
      final result = sanitizer.sanitize(error, null);
      expect(result.safeMessage, contains('token=***'));
      expect(result.safeMessage, isNot(contains('secretvalue123')));
    });

    test('should strip URL query strings', () {
      final error = Exception('GET /api/users?page=1&limit=10');
      final result = sanitizer.sanitize(error, null);
      expect(result.safeMessage, contains('?***'));
    });

    test('should filter sensitive stack trace frames', () {
      final stackTrace = StackTrace.fromString(
        '#0 main (file:///app/lib/main.dart:10:5)\n'
        '#1 loadEnv (file:///app/lib/.env:3:1)\n'
        '#2 runApp (file:///app/lib/app.dart:5:3)',
      );
      final error = Exception('Something went wrong');
      final result = sanitizer.sanitize(error, stackTrace);
      expect(result.stackTrace.toString(), isNot(contains('.env')));
      expect(result.stackTrace.toString(), contains('main'));
    });

    test('should return null stack trace when input is null', () {
      final error = Exception('Something went wrong');
      final result = sanitizer.sanitize(error, null);
      expect(result.stackTrace, isNull);
    });

    test('should resolve category from hint', () {
      final error = Exception('Something went wrong');
      final result = sanitizer.sanitize(error, null, category: 'e2ee');
      expect(result.category, 'e2ee_error');
    });

    test('should resolve ws category', () {
      final error = Exception('Something went wrong');
      final result = sanitizer.sanitize(error, null, category: 'ws');
      expect(result.category, 'ws_error');
    });

    test('should resolve http category', () {
      final error = Exception('Something went wrong');
      final result = sanitizer.sanitize(error, null, category: 'http');
      expect(result.category, 'http_error');
    });

    test('should default to unknown_error category', () {
      final error = Exception('Something went wrong');
      final result = sanitizer.sanitize(error, null);
      expect(result.category, 'unknown_error');
    });

    test('should strip e2ee patterns when category is e2ee', () {
      final error = Exception('envelope=secret123 session=abc456');
      final result = sanitizer.sanitize(error, null, category: 'e2ee');
      expect(result.safeMessage, contains('envelope=***'));
      expect(result.safeMessage, contains('session=***'));
    });

    test('should strip ws patterns when category is ws', () {
      final error = Exception('ticket=mysecretticket');
      final result = sanitizer.sanitize(error, null, category: 'ws');
      expect(result.safeMessage, contains('ticket=***'));
    });

    test('should return error type name', () {
      final error = Exception('Something went wrong');
      final result = sanitizer.sanitize(error, null);
      expect(result.errorType, isNotEmpty);
    });
  });
}
