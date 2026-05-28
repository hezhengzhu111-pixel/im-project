import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:im_web/core/router/not_found_page.dart';

void main() {
  group('NotFoundPage', () {
    testWidgets('displays 404 text', (tester) async {
      await tester.pumpWidget(
        const MaterialApp(home: NotFoundPage()),
      );

      expect(find.text('404'), findsOneWidget);
    });

    testWidgets('displays page not found message', (tester) async {
      await tester.pumpWidget(
        const MaterialApp(home: NotFoundPage()),
      );

      expect(find.text('页面不存在'), findsOneWidget);
    });

    testWidgets('has return to home button', (tester) async {
      await tester.pumpWidget(
        const MaterialApp(home: NotFoundPage()),
      );

      expect(find.text('返回首页'), findsOneWidget);
    });
  });
}
