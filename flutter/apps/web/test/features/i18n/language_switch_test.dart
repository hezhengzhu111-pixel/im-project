import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:im_web/core/di/providers.dart';
import 'package:im_web/features/auth/presentation/login_page.dart';
import 'package:im_web/l10n/app_localizations.dart';

void main() {
  group('Language Switch', () {
    testWidgets('should switch login page text from Chinese to English', (tester) async {
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            languageProvider.overrideWithValue('zh'),
          ],
          child: const MaterialApp(
            localizationsDelegates: AppLocalizations.localizationsDelegates,
            supportedLocales: AppLocalizations.supportedLocales,
            home: LoginPage(),
          ),
        ),
      );

      // Verify Chinese text is displayed
      expect(find.text('登录'), findsOneWidget);
      expect(find.text('请登录您的加密通信账户'), findsOneWidget);

      // Switch to English
      final container = ProviderScope.containerOf(find.byType(LoginPage));
      container.read(languageProvider.notifier).state = 'en';
      await tester.pumpAndSettle();

      // Verify English text is displayed
      expect(find.text('Login'), findsOneWidget);
      expect(find.text('Please log in to your encrypted communication account'), findsOneWidget);
    });

    testWidgets('should switch login page text from English to Chinese', (tester) async {
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            languageProvider.overrideWithValue('en'),
          ],
          child: const MaterialApp(
            localizationsDelegates: AppLocalizations.localizationsDelegates,
            supportedLocales: AppLocalizations.supportedLocales,
            home: LoginPage(),
          ),
        ),
      );

      // Verify English text is displayed
      expect(find.text('Login'), findsOneWidget);
      expect(find.text('Please log in to your encrypted communication account'), findsOneWidget);

      // Switch to Chinese
      final container = ProviderScope.containerOf(find.byType(LoginPage));
      container.read(languageProvider.notifier).state = 'zh';
      await tester.pumpAndSettle();

      // Verify Chinese text is displayed
      expect(find.text('登录'), findsOneWidget);
      expect(find.text('请登录您的加密通信账户'), findsOneWidget);
    });
  });
}
