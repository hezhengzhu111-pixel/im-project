import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:im_ui/ui.dart';

Widget wrapInApp(Widget child) => MaterialApp(
      home: Scaffold(body: child),
    );

void main() {
  group('ImTextField', () {
    testWidgets('renders with hintText', (tester) async {
      await tester.pumpWidget(wrapInApp(
        const ImTextField(hintText: 'Enter name'),
      ));
      expect(find.text('Enter name'), findsOneWidget);
    });

    testWidgets('renders with label', (tester) async {
      await tester.pumpWidget(wrapInApp(
        const ImTextField(label: 'Username'),
      ));
      expect(find.text('Username'), findsOneWidget);
    });

    testWidgets('calls onChanged when text changes', (tester) async {
      String? changed;
      await tester.pumpWidget(wrapInApp(
        ImTextField(onChanged: (v) => changed = v),
      ));
      await tester.enterText(find.byType(TextFormField), 'hello');
      expect(changed, 'hello');
    });

    testWidgets('shows errorText', (tester) async {
      await tester.pumpWidget(wrapInApp(
        const ImTextField(errorText: 'Required field'),
      ));
      expect(find.text('Required field'), findsOneWidget);
    });

    testWidgets('obscureText hides input', (tester) async {
      await tester.pumpWidget(wrapInApp(
        const ImTextField(obscure: true),
      ));
      final textField = tester.widget<TextField>(find.byType(TextField));
      expect(textField.obscureText, isTrue);
    });
  });
}
