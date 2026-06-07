import 'package:flutter_test/flutter_test.dart';
import 'package:im_core_flutter/im_core_flutter.dart';

void main() {
  test('RouteNames exposes stable route identifiers', () {
    expect(RouteNames.login, 'login');
    expect(RouteNames.chat, 'chat');
    expect(RouteNames.notFound, 'notFound');
  });
}
