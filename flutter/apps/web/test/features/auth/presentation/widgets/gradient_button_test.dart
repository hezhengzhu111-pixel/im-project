// flutter/apps/web/test/features/auth/presentation/widgets/gradient_button_test.dart
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:im_web/core/theme/glass_theme.dart';
import 'package:im_web/features/auth/presentation/widgets/gradient_button.dart';

Widget _wrapWithTheme(Widget child) {
  return MaterialApp(
    theme: ThemeData(extensions: [GlassTheme.light]),
    home: Scaffold(body: child),
  );
}

void main() {
  group('GradientButton', () {
    testWidgets('should display text when not loading', (tester) async {
      await tester.pumpWidget(
        _wrapWithTheme(
          GradientButton(
            text: 'Login',
            onPressed: () {},
          ),
        ),
      );

      expect(find.text('Login'), findsOneWidget);
    });

    testWidgets('should show loading indicator when loading', (tester) async {
      await tester.pumpWidget(
        _wrapWithTheme(
          GradientButton(
            text: 'Login',
            isLoading: true,
            onPressed: () {},
          ),
        ),
      );

      expect(find.byType(CircularProgressIndicator), findsOneWidget);
    });
  });
}
