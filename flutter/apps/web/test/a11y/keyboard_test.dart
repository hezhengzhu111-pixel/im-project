import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('Keyboard Shortcuts', () {
    testWidgets('Escape key unfocuses input', (tester) async {
      final focusNode = FocusNode();

      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: CallbackShortcuts(
              bindings: {
                LogicalKeySet(LogicalKeyboardKey.escape): () {
                  focusNode.unfocus();
                },
              },
              child: TextField(focusNode: focusNode),
            ),
          ),
        ),
      );

      focusNode.requestFocus();
      await tester.pump();
      expect(focusNode.hasFocus, isTrue);

      await tester.sendKeyEvent(LogicalKeyboardKey.escape);
      await tester.pump();
      expect(focusNode.hasFocus, isFalse);
    });

    testWidgets('Enter key triggers send in TextField', (tester) async {
      String? sentText;

      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: TextField(
              onSubmitted: (text) => sentText = text,
            ),
          ),
        ),
      );

      await tester.enterText(find.byType(TextField), 'hello');
      await tester.testTextInput.receiveAction(TextInputAction.send);
      await tester.pump();

      expect(sentText, 'hello');
    });
  });
}
