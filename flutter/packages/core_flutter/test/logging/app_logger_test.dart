import 'package:flutter/foundation.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:im_core_flutter/im_core_flutter.dart';

/// Captures [debugPrint] output and returns it as a list of strings.
List<String> captureDebugPrint(void Function() block) {
  final output = <String>[];
  final oldPrint = debugPrint;
  debugPrint = (String? message, {int? wrapWidth}) {
    if (message != null) output.add(message);
  };
  try {
    block();
  } finally {
    debugPrint = oldPrint;
  }
  return output;
}

/// Joins all captured output into a single string for assertion convenience.
String capturedLines(void Function() block) {
  return captureDebugPrint(block).join('\n');
}

void main() {
  late AppLogger logger;

  setUp(() {
    AppLogger.init(tag: 'test');
    logger = AppLogger.instance;
  });

  group('AppLogger.error() safety', () {
    test('strips token= from error message', () {
      final output = capturedLines(() {
        logger.error(
          'auth failed',
          Exception('connection error: token=secret-token'),
        );
      });
      expect(output, contains('token=***'));
      expect(output, isNot(contains('secret-token')));
    });

    test('strips Authorization Bearer from error message', () {
      final output = capturedLines(() {
        logger.error(
          'http error',
          Exception('Authorization: Bearer abc.def.ghi'),
        );
      });
      expect(output, contains('Bearer ***'));
      expect(output, isNot(contains('abc.def.ghi')));
    });

    test('strips ticket= from error message', () {
      final output = capturedLines(() {
        logger.error(
          'ws connect failed',
          Exception('handshake error: ticket=ws-ticket-secret'),
          null,
          'ws',
        );
      });
      expect(output, contains('ticket=***'));
      expect(output, isNot(contains('ws-ticket-secret')));
    });

    test('strips envelope= from error message', () {
      final output = capturedLines(() {
        logger.error(
          'e2ee error',
          Exception('decrypt failed: envelope=ciphertext-secret'),
          null,
          'e2ee',
        );
      });
      expect(output, contains('envelope=***'));
      expect(output, isNot(contains('ciphertext-secret')));
    });

    test('strips session= from error message', () {
      final output = capturedLines(() {
        logger.error(
          'e2ee error',
          Exception('invalid state: session=session-secret'),
          null,
          'e2ee',
        );
      });
      expect(output, contains('session=***'));
      expect(output, isNot(contains('session-secret')));
    });

    test('strips deviceId= from error message', () {
      final output = capturedLines(() {
        logger.error(
          'e2ee error',
          Exception('unknown device: deviceId=device-secret'),
          null,
          'e2ee',
        );
      });
      expect(output, contains('deviceId=***'));
      expect(output, isNot(contains('device-secret')));
    });

    test('strips device_id= from error message', () {
      final output = capturedLines(() {
        logger.error(
          'e2ee error',
          Exception('unknown device: device_id=device-secret'),
          null,
          'e2ee',
        );
      });
      expect(output, contains('device_id=***'));
      expect(output, isNot(contains('device-secret')));
    });

    test('strips query string with token and ticket', () {
      final output = capturedLines(() {
        logger.error(
          'api call failed',
          Exception('GET /api/data?token=xxx&ticket=yyy failed'),
        );
      });
      expect(output, contains('?***'));
      expect(output, isNot(contains('?token=xxx')));
      expect(output, isNot(contains('ticket=yyy')));
    });

    test('strips E2EE patterns even without category hint', () {
      final output = capturedLines(() {
        logger.error(
          'generic error',
          Exception(
            'something broke: envelope=secret1 session=secret2 '
            'deviceId=secret3 device_id=secret4 ticket=secret5',
          ),
        );
      });
      expect(output, isNot(contains('secret1')));
      expect(output, isNot(contains('secret2')));
      expect(output, isNot(contains('secret3')));
      expect(output, isNot(contains('secret4')));
      expect(output, isNot(contains('secret5')));
      expect(output, contains('envelope=***'));
      expect(output, contains('session=***'));
      expect(output, contains('deviceId=***'));
      expect(output, contains('device_id=***'));
      expect(output, contains('ticket=***'));
    });

    test('does not output raw error object', () {
      final rawError = Exception('sensitive: token=raw-token-12345');
      final output = capturedLines(() {
        logger.error('test message', rawError);
      });
      // The raw error string should never appear
      expect(output, isNot(contains('sensitive: token=raw-token-12345')));
      // But the sanitized version should
      expect(output, contains('token=***'));
    });

    test('output includes category in log line', () {
      final output = capturedLines(() {
        logger.error('test', Exception('boom'), null, 'ws');
      });
      expect(output, contains('category: ws_error'));
    });

    test('uses sanitized stackTrace not raw stackTrace', () {
      final rawStack = StackTrace.fromString(
        'package:secret/token_helper.dart:42\n'
        'package:app/main.dart:10',
      );
      final output = capturedLines(() {
        logger.error('test', Exception('boom'), rawStack);
      });
      // Should NOT contain the sensitive path
      expect(output, isNot(contains('token_helper.dart')));
      // Should still contain non-sensitive paths
      expect(output, contains('main.dart:10'));
    });
  });

  group('AppLogger.warn() safety', () {
    test('strips sensitive fields from warn detail', () {
      final output = capturedLines(() {
        logger.warn(
          'something suspicious',
          Exception('token=my-secret-token-123'),
        );
      });
      expect(output, contains('token=***'));
      expect(output, isNot(contains('my-secret-token-123')));
    });

    test('does not output raw error toString in warn', () {
      final rawError = Exception('Authorization: Bearer top.secret.jwt');
      final output = capturedLines(() {
        logger.warn('warning', rawError);
      });
      expect(output, isNot(contains('top.secret.jwt')));
      expect(output, contains('Bearer ***'));
    });

    test('sanitizes stackTrace in warn when error is provided', () {
      final rawStack = StackTrace.fromString(
        'package:credentials/secrets.dart:99\n'
        'package:app/safe.dart:10',
      );
      final output = capturedLines(() {
        logger.warn('warning', Exception('test'), rawStack);
      });
      expect(output, isNot(contains('secrets.dart')));
      expect(output, contains('safe.dart:10'));
    });

    test('sanitizes stackTrace in warn when only stackTrace provided', () {
      final rawStack = StackTrace.fromString(
        'dart:core/.env_loader.dart:1\n'
        'package:app/main.dart:5',
      );
      final output = capturedLines(() {
        logger.warn('warning', null, rawStack);
      });
      expect(output, isNot(contains('.env_loader.dart')));
      expect(output, contains('main.dart:5'));
    });

    test('warn without error or stackTrace is safe', () {
      final output = capturedLines(() {
        logger.warn('just a message');
      });
      expect(output, contains('[test:warn] just a message'));
    });

    test('warn outputs error type', () {
      final output = capturedLines(() {
        logger.warn('warning', FormatException('bad input: token=abc123'));
      });
      expect(output, contains('FormatException'));
      expect(output, contains('token=***'));
      expect(output, isNot(contains('abc123')));
    });
  });

  group('AppLogger.debug() and info() are unchanged', () {
    test('debug outputs in debug mode', () {
      // debugPrint capture works in test mode (kDebugMode is true in tests)
      final output = capturedLines(() {
        logger.debug('debug message');
      });
      expect(output, contains('[test:debug] debug message'));
    });

    test('info outputs in debug mode', () {
      final output = capturedLines(() {
        logger.info('info message');
      });
      expect(output, contains('[test:info] info message'));
    });
  });

  group('ErrorSanitizer standalone', () {
    late ErrorSanitizer sanitizer;

    setUp(() {
      sanitizer = ErrorSanitizer();
    });

    test('sanitize strips all sensitive patterns', () {
      final result = sanitizer.sanitize(
        Exception(
          'Failed: token=abc Bearer xyz.123 ticket=t1 '
          'envelope=e1 session=s1 deviceId=d1 device_id=d2 '
          'email@example.com /path?q=secret',
        ),
        null,
      );

      expect(result.safeMessage, contains('token=***'));
      expect(result.safeMessage, contains('Bearer ***'));
      expect(result.safeMessage, contains('ticket=***'));
      expect(result.safeMessage, contains('envelope=***'));
      expect(result.safeMessage, contains('session=***'));
      expect(result.safeMessage, contains('deviceId=***'));
      expect(result.safeMessage, contains('device_id=***'));
      expect(result.safeMessage, contains('***@***'));
      expect(result.safeMessage, contains('?***'));

      expect(result.safeMessage, isNot(contains('abc')));
      expect(result.safeMessage, isNot(contains('xyz.123')));
      expect(result.safeMessage, isNot(contains('t1')));
      expect(result.safeMessage, isNot(contains('e1')));
      expect(result.safeMessage, isNot(contains('s1')));
      expect(result.safeMessage, isNot(contains('d1')));
      expect(result.safeMessage, isNot(contains('d2')));
    });

    test('sanitize preserves safe content', () {
      final result = sanitizer.sanitize(
        Exception('Connection timeout after 30 seconds'),
        null,
      );
      expect(result.safeMessage, contains('Connection timeout'));
      expect(result.safeMessage, contains('30 seconds'));
    });

    test('SanitizedError fields are populated correctly', () {
      final result = sanitizer.sanitize(
        FormatException('test error'),
        StackTrace.fromString('package:app/main.dart:42'),
        category: 'e2ee',
      );

      expect(result.errorType, 'FormatException');
      expect(result.category, 'e2ee_error');
      expect(result.safeMessage, contains('test error'));
      expect(result.stackTrace, isNotNull);
    });
  });
}
