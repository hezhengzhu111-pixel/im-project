import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:im_ui/ui.dart';

Widget wrapInApp(Widget child) => MaterialApp(
      home: Scaffold(body: child),
    );

void main() {
  group('ImCard', () {
    testWidgets('renders child widget', (tester) async {
      await tester.pumpWidget(wrapInApp(
        const ImCard(child: Text('Card content')),
      ));
      expect(find.text('Card content'), findsOneWidget);
    });

    testWidgets('calls onTap when tapped', (tester) async {
      var tapped = false;
      await tester.pumpWidget(wrapInApp(
        ImCard(
          onTap: () => tapped = true,
          child: const Text('Tap me'),
        ),
      ));
      await tester.tap(find.text('Tap me'));
      expect(tapped, isTrue);
    });

    testWidgets('does not have gesture detector when no onTap', (tester) async {
      await tester.pumpWidget(wrapInApp(
        const ImCard(child: Text('Static')),
      ));
      expect(find.byType(GestureDetector), findsNothing);
    });
  });
}
