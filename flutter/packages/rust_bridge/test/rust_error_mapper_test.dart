import 'package:flutter_test/flutter_test.dart';
import 'package:im_rust_bridge/im_rust_bridge.dart';

void main() {
  test('mapRustError returns operation-aware sanitized bridge exception', () {
    final stackTrace = StackTrace.current;
    final exception = mapRustError(
      'decryptMessage',
      Exception(
        'plaintext key token state ciphertext Authorization '
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload.signature',
      ),
      stackTrace,
    );

    expect(exception, isA<RustBridgeException>());
    expect(exception.operation, 'decryptMessage');
    expect(exception.code, 'rust_bridge_failed');
    expect(exception.errorType, '_Exception');
    expect(exception.stackTrace, stackTrace);

    final rendered = exception.toString();
    expect(rendered, contains('decryptMessage'));
    expect(rendered, contains('rust_bridge_failed'));
    expect(rendered, contains('_Exception'));
    expect(rendered, isNot(contains('plaintext')));
    expect(rendered, isNot(contains(' key ')));
    expect(rendered, isNot(contains('token')));
    expect(rendered, isNot(contains('state ')));
    expect(rendered, isNot(contains('ciphertext')));
    expect(rendered, isNot(contains('Authorization')));
    expect(rendered, isNot(contains('eyJ')));
  });

  test('mapRustError sanitizes operation and type shape only', () {
    final exception = mapRustError(
      'restore session envelope/key',
      StateError('session envelope state=abc token=secret'),
    );

    expect(exception.operation, 'restore_session_envelope_key');
    expect(exception.errorType, 'StateError');
    expect(exception.toString(), isNot(contains('session envelope')));
    expect(exception.toString(), isNot(contains('secret')));
  });
}
