import 'package:flutter_test/flutter_test.dart';
import 'package:im_shared_features/auth.dart';

void main() {
  test('AuthStatus exposes expected states', () {
    expect(
      AuthStatus.values,
      containsAll(<AuthStatus>[
        AuthStatus.initial,
        AuthStatus.loading,
        AuthStatus.authenticated,
        AuthStatus.unauthenticated,
      ]),
    );
  });
}
