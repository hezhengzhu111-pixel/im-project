import 'package:test/test.dart';
import 'package:im_core/src/logging/sanitized_error.dart';

void main() {
  group('SanitizedError', () {
    test('stores all required fields', () {
      final st = StackTrace.current;
      final error = SanitizedError(
        errorType: 'DioException',
        category: 'http_error',
        safeMessage: 'Request failed with status 401',
        stackTrace: st,
      );

      expect(error.errorType, 'DioException');
      expect(error.category, 'http_error');
      expect(error.safeMessage, 'Request failed with status 401');
      expect(error.stackTrace, same(st));
    });

    test('stackTrace is optional', () {
      final error = SanitizedError(
        errorType: 'Exception',
        category: 'unknown_error',
        safeMessage: 'something failed',
      );

      expect(error.stackTrace, isNull);
    });
  });
}
