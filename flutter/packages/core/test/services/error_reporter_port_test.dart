import 'package:test/test.dart';
import 'package:im_core/src/services/error_reporter_port.dart';

class _TestErrorReporterAdapter implements ErrorReporterPort {
  final List<ErrorCall> calls = [];

  @override
  void reportError(Object error, StackTrace? stackTrace, {Map<String, dynamic>? extra}) {
    calls.add(ErrorCall('reportError', error.toString(), stackTrace, extra));
  }

  @override
  void reportMessage(String message, {String? level}) {
    calls.add(ErrorCall('reportMessage', message, null, {'level': level}));
  }
}

class ErrorCall {
  final String method;
  final String message;
  final StackTrace? stackTrace;
  final Map<String, dynamic>? extra;
  ErrorCall(this.method, this.message, this.stackTrace, this.extra);
}

void main() {
  test('ErrorReporterPort interface can be implemented', () {
    final adapter = _TestErrorReporterAdapter();
    adapter.reportError(Exception('test'), StackTrace.current, extra: {'key': 'value'});
    adapter.reportMessage('info message', level: 'info');

    expect(adapter.calls.length, 2);
    expect(adapter.calls[0].method, 'reportError');
    expect(adapter.calls[0].message, 'Exception: test');
    expect(adapter.calls[1].method, 'reportMessage');
    expect(adapter.calls[1].extra?['level'], 'info');
  });
}
