import 'package:flutter/foundation.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:im_core/core.dart';
import 'package:im_web/core/logging/app_logger.dart';

void Function(String?, {int? wrapWidth}) _originalDebugPrint = debugPrint;

/// Mock ErrorReporterPort for testing
class MockErrorReporterPort implements ErrorReporterPort {
  final List<Map<String, dynamic>> reports = [];

  @override
  void reportError(Object error, StackTrace? stackTrace,
      {Map<String, dynamic>? extra}) {
    reports.add({
      'error': error,
      'stackTrace': stackTrace,
      'extra': extra,
    });
  }

  @override
  void reportMessage(String message, {String? level}) {}
}

void main() {
  late List<String> logs;
  late MockErrorReporterPort mockReporter;

  setUp(() {
    logs = [];
    mockReporter = MockErrorReporterPort();
    _originalDebugPrint = debugPrint;
    debugPrint = (String? message, {int? wrapWidth}) {
      if (message != null) logs.add(message);
    };
  });

  tearDown(() {
    debugPrint = _originalDebugPrint;
    AppLogger.init(errorReporter: null);
  });

  group('AppLogger', () {
    test('debug outputs in debug mode', () {
      final logger = AppLogger.instance;
      logger.debug('test message');
      expect(logs, contains('[im:debug] test message'));
    });

    test('info outputs in debug mode', () {
      final logger = AppLogger.instance;
      logger.info('test info');
      expect(logs, contains('[im:info] test info'));
    });

    test('warn always outputs', () {
      final logger = AppLogger.instance;
      logger.warn('test warning');
      expect(logs, contains('[im:warn] test warning'));
    });

    test('error always outputs with runtimeType', () {
      final logger = AppLogger.instance;
      logger.error('something failed', FormatException('secret details'));
      expect(logs.length, 1);
      expect(logs[0], contains('[im:error] something failed'));
      expect(logs[0], contains('(type: FormatException)'));
      expect(logs[0], isNot(contains('secret details')));
    });

    test('error calls ErrorReporterPort with runtimeType', () {
      AppLogger.init(errorReporter: mockReporter);
      final logger = AppLogger.instance;
      final error = FormatException('bad input');
      logger.error('parse failed', error);

      expect(mockReporter.reports.length, 1);
      expect(mockReporter.reports[0]['error'], same(error));
      expect(mockReporter.reports[0]['extra'], {'error_type': 'FormatException'});
    });

    test('error without init does not crash', () {
      final logger = AppLogger.instance;
      logger.error('test', StateError('oops'));
      expect(logs.length, 1);
      expect(logs[0], contains('(type: StateError)'));
    });

    test('init replaces singleton with new ErrorReporterPort', () {
      final reporter1 = MockErrorReporterPort();
      final reporter2 = MockErrorReporterPort();

      AppLogger.init(errorReporter: reporter1);
      AppLogger.instance.error('test', FormatException('e'));
      expect(reporter1.reports.length, 1);

      AppLogger.init(errorReporter: reporter2);
      AppLogger.instance.error('test', FormatException('e'));
      expect(reporter2.reports.length, 1);
      expect(reporter1.reports.length, 1);
    });
  });
}
