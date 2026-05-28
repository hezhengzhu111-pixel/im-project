import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:im_ui/ui.dart';

Widget wrapInApp(Widget child) => MaterialApp(
      home: Scaffold(body: child),
    );

void main() {
  group('ImButton', () {
    testWidgets('renders primary variant with label', (tester) async {
      await tester.pumpWidget(wrapInApp(
        const ImButton(label: 'Submit'),
      ));
      expect(find.text('Submit'), findsOneWidget);
    });

    testWidgets('calls onPressed when tapped', (tester) async {
      var tapped = false;
      await tester.pumpWidget(wrapInApp(
        ImButton(label: 'Tap', onPressed: () => tapped = true),
      ));
      await tester.tap(find.text('Tap'));
      expect(tapped, isTrue);
    });

    testWidgets('shows loading spinner when loading', (tester) async {
      await tester.pumpWidget(wrapInApp(
        const ImButton(label: 'Save', loading: true),
      ));
      expect(find.byType(CircularProgressIndicator), findsOneWidget);
      expect(find.text('Save'), findsNothing);
    });

    testWidgets('disabled when onPressed is null', (tester) async {
      await tester.pumpWidget(wrapInApp(
        const ImButton(label: 'Disabled'),
      ));
      final button = tester.widget<ElevatedButton>(find.byType(ElevatedButton));
      expect(button.onPressed, isNull);
    });

    testWidgets('renders secondary variant as OutlinedButton', (tester) async {
      await tester.pumpWidget(wrapInApp(
        const ImButton(
          label: 'Cancel',
          variant: ImButtonVariant.secondary,
        ),
      ));
      expect(find.byType(OutlinedButton), findsOneWidget);
    });

    testWidgets('renders text variant as TextButton', (tester) async {
      await tester.pumpWidget(wrapInApp(
        const ImButton(
          label: 'Link',
          variant: ImButtonVariant.text,
        ),
      ));
      expect(find.byType(TextButton), findsOneWidget);
    });

    testWidgets('fullWidth stretches button', (tester) async {
      await tester.pumpWidget(wrapInApp(
        const ImButton(label: 'Full', fullWidth: true),
      ));
      final sizedBox = tester.widget<SizedBox>(find.byType(SizedBox).first);
      expect(sizedBox.width, double.infinity);
    });
  });
}
