// flutter/apps/web/test/features/auth/presentation/widgets/auth_card_test.dart
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:im_web/features/auth/presentation/widgets/auth_card.dart';

void main() {
  group('AuthCard', () {
    testWidgets('should display title and subtitle', (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: AuthCard(
              title: 'Test Title',
              subtitle: 'Test Subtitle',
              child: const Text('Child Content'),
            ),
          ),
        ),
      );

      expect(find.text('Test Title'), findsOneWidget);
      expect(find.text('Test Subtitle'), findsOneWidget);
      expect(find.text('Child Content'), findsOneWidget);
    });
  });
}
