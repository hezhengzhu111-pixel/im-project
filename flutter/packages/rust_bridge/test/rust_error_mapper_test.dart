import 'package:flutter_test/flutter_test.dart';
import 'package:im_rust_bridge/im_rust_bridge.dart';

void main() {
  test('mapRustError returns sanitized bridge exception', () {
    final exception = mapRustError(Exception('plaintext key token state'));

    expect(exception, isA<RustBridgeException>());
    expect(exception.message, 'Rust bridge operation failed.');
    expect(exception.message, isNot(contains('plaintext')));
    expect(exception.message, isNot(contains('key')));
    expect(exception.message, isNot(contains('token')));
    expect(exception.message, isNot(contains('state')));
  });
}
