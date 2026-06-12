/// Tests for RetryableErrorClassifier.
///
/// Verifies the error classification logic for message send failures.
/// These tests lock down which errors are retryable (enqueue to outbox)
/// and which are not (immediate failure).
import 'package:flutter_test/flutter_test.dart';
import 'package:im_web/features/chat/data/retryable_error_classifier.dart';

void main() {
  group('RetryableErrorClassifier', () {
    // =========================================================================
    // Retryable errors (network/temporary)
    // =========================================================================

    group('retryable errors', () {
      test('socket exception is retryable', () {
        final decision = RetryableErrorClassifier.classifySendError(
          Exception('SocketException: Connection refused'),
        );
        expect(decision.retryable, isTrue);
        expect(decision.reason, 'socket_exception');
      });

      test('connection refused is retryable', () {
        final decision = RetryableErrorClassifier.classifySendError(
          Exception('Connection refused'),
        );
        expect(decision.retryable, isTrue);
        expect(decision.reason, 'connection_refused');
      });

      test('connection reset is retryable', () {
        final decision = RetryableErrorClassifier.classifySendError(
          Exception('Connection reset by peer'),
        );
        expect(decision.retryable, isTrue);
        expect(decision.reason, 'connection_reset');
      });

      test('broken pipe is retryable', () {
        final decision = RetryableErrorClassifier.classifySendError(
          Exception('Broken pipe'),
        );
        expect(decision.retryable, isTrue);
        expect(decision.reason, 'broken_pipe');
      });

      test('connection timeout is retryable', () {
        final decision = RetryableErrorClassifier.classifySendError(
          Exception('Connection timed out'),
        );
        expect(decision.retryable, isTrue);
        expect(decision.reason, 'timeout');
      });

      test('connect timeout (dio) is retryable', () {
        final decision = RetryableErrorClassifier.classifySendError(
          Exception('ConnectTimeout'),
        );
        expect(decision.retryable, isTrue);
        expect(decision.reason, 'timeout');
      });

      test('send timeout (dio) is retryable', () {
        final decision = RetryableErrorClassifier.classifySendError(
          Exception('SendTimeout'),
        );
        expect(decision.retryable, isTrue);
        expect(decision.reason, 'timeout');
      });

      test('receive timeout (dio) is retryable', () {
        final decision = RetryableErrorClassifier.classifySendError(
          Exception('ReceiveTimeout'),
        );
        expect(decision.retryable, isTrue);
        expect(decision.reason, 'timeout');
      });

      test('network unreachable is retryable', () {
        final decision = RetryableErrorClassifier.classifySendError(
          Exception('Network is unreachable'),
        );
        expect(decision.retryable, isTrue);
        expect(decision.reason, 'network_unreachable');
      });

      test('generic network error is retryable', () {
        final decision = RetryableErrorClassifier.classifySendError(
          Exception('Network error'),
        );
        expect(decision.retryable, isTrue);
        expect(decision.reason, 'network_error');
      });

      test('networkerror (dio) is retryable', () {
        final decision = RetryableErrorClassifier.classifySendError(
          Exception('NetworkError'),
        );
        expect(decision.retryable, isTrue);
        expect(decision.reason, 'network_error');
      });

      test('HTTP 500 server error is retryable', () {
        final decision = RetryableErrorClassifier.classifySendError(
          Exception('HTTP 500 Internal Server Error'),
        );
        expect(decision.retryable, isTrue);
        expect(decision.reason, 'server_error');
      });

      test('HTTP 502 bad gateway is retryable', () {
        final decision = RetryableErrorClassifier.classifySendError(
          Exception('502 Bad Gateway'),
        );
        expect(decision.retryable, isTrue);
        expect(decision.reason, 'server_error');
      });

      test('HTTP 503 service unavailable is retryable', () {
        final decision = RetryableErrorClassifier.classifySendError(
          Exception('503 Service Unavailable'),
        );
        expect(decision.retryable, isTrue);
        expect(decision.reason, 'server_error');
      });
    });

    // =========================================================================
    // Non-retryable errors (client/business)
    // =========================================================================

    group('non-retryable errors', () {
      test('HTTP 400 bad request is not retryable', () {
        final decision = RetryableErrorClassifier.classifySendError(
          Exception('HTTP 400 Bad Request'),
        );
        expect(decision.retryable, isFalse);
        expect(decision.reason, 'client_error_400');
      });

      test('HTTP 401 unauthorized is not retryable', () {
        final decision = RetryableErrorClassifier.classifySendError(
          Exception('HTTP 401 Unauthorized'),
        );
        expect(decision.retryable, isFalse);
        expect(decision.reason, contains('client_error'));
      });

      test('HTTP 403 forbidden is not retryable', () {
        final decision = RetryableErrorClassifier.classifySendError(
          Exception('HTTP 403 Forbidden'),
        );
        expect(decision.retryable, isFalse);
        expect(decision.reason, contains('client_error'));
      });

      test('HTTP 404 not found is not retryable', () {
        final decision = RetryableErrorClassifier.classifySendError(
          Exception('HTTP 404 Not Found'),
        );
        expect(decision.retryable, isFalse);
        expect(decision.reason, contains('client_error'));
      });

      test('HTTP 422 unprocessable entity is not retryable', () {
        final decision = RetryableErrorClassifier.classifySendError(
          Exception('HTTP 422 Unprocessable Entity'),
        );
        expect(decision.retryable, isFalse);
        expect(decision.reason, contains('client_error'));
      });

      test('validation error is not retryable', () {
        final decision = RetryableErrorClassifier.classifySendError(
          Exception('Validation error: message too long'),
        );
        expect(decision.retryable, isFalse);
        expect(decision.reason, 'validation_error');
      });

      test('permission denied is not retryable', () {
        final decision = RetryableErrorClassifier.classifySendError(
          Exception('Permission denied'),
        );
        expect(decision.retryable, isFalse);
        expect(decision.reason, 'permission_error');
      });

      test('unauthorized error is not retryable', () {
        final decision = RetryableErrorClassifier.classifySendError(
          Exception('Unauthorized access'),
        );
        expect(decision.retryable, isFalse);
        expect(decision.reason, 'permission_error');
      });

      test('e2ee_not_ready is not retryable', () {
        final decision = RetryableErrorClassifier.classifySendError(
          Exception('e2ee_not_ready'),
        );
        expect(decision.retryable, isFalse);
        expect(decision.reason, 'e2ee_state_error');
      });

      test('e2ee_encrypt_failed is not retryable', () {
        final decision = RetryableErrorClassifier.classifySendError(
          Exception('e2ee_encrypt_failed'),
        );
        expect(decision.retryable, isFalse);
        expect(decision.reason, 'e2ee_state_error');
      });

      test('remote device id missing is not retryable', () {
        final decision = RetryableErrorClassifier.classifySendError(
          Exception('remote device ID not found for session'),
        );
        expect(decision.retryable, isFalse);
        expect(decision.reason, 'e2ee_state_error');
      });

      test('e2ee session error is not retryable', () {
        final decision = RetryableErrorClassifier.classifySendError(
          Exception('E2EE session disabled'),
        );
        expect(decision.retryable, isFalse);
        expect(decision.reason, 'e2ee_state_error');
      });

      test('unknown exception is not retryable (default)', () {
        final decision = RetryableErrorClassifier.classifySendError(
          Exception('Something went wrong'),
        );
        expect(decision.retryable, isFalse);
        expect(decision.reason, 'unknown');
      });
    });

    // =========================================================================
    // Edge cases
    // =========================================================================

    group('edge cases', () {
      test('non-Exception objects are not retryable', () {
        final decision =
            RetryableErrorClassifier.classifySendError('string error');
        expect(decision.retryable, isFalse);
        expect(decision.reason, 'non_exception');
      });

      test('null is not retryable', () {
        final decision = RetryableErrorClassifier.classifySendError(
          ArgumentError('null error'),
        );
        expect(decision.retryable, isFalse);
      });

      test('case insensitive matching works', () {
        final decision = RetryableErrorClassifier.classifySendError(
          Exception('NETWORK ERROR'),
        );
        expect(decision.retryable, isTrue);
        expect(decision.reason, 'network_error');
      });

      test('error with multiple patterns uses first match', () {
        // Connection refused in a longer message
        final decision = RetryableErrorClassifier.classifySendError(
          Exception('Failed to connect: Connection refused at 127.0.0.1:8080'),
        );
        expect(decision.retryable, isTrue);
        expect(decision.reason, 'connection_refused');
      });
    });

    // =========================================================================
    // RetryDecision properties
    // =========================================================================

    group('RetryDecision', () {
      test('retryable decision has correct properties', () {
        const decision = RetryDecision.retryable(reason: 'test_reason');
        expect(decision.retryable, isTrue);
        expect(decision.reason, 'test_reason');
        expect(decision.safeMessage, isNull);
      });

      test('notRetryable decision has correct properties', () {
        const decision = RetryDecision.notRetryable(
          reason: 'test_reason',
          safeMessage: 'safe_error',
        );
        expect(decision.retryable, isFalse);
        expect(decision.reason, 'test_reason');
        expect(decision.safeMessage, 'safe_error');
      });
    });
  });
}
