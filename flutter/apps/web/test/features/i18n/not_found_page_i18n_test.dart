import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:im_web/core/router/not_found_page.dart';
import 'package:im_web/l10n/app_localizations.dart';

void main() {
  Widget buildTestApp({Locale locale = const Locale('zh')}) {
    return MaterialApp(
      locale: locale,
      localizationsDelegates: AppLocalizations.localizationsDelegates,
      supportedLocales: AppLocalizations.supportedLocales,
      home: const NotFoundPage(),
    );
  }

  group('NotFoundPage i18n', () {
    testWidgets('displays Chinese text when locale is zh', (tester) async {
      await tester.pumpWidget(buildTestApp(locale: const Locale('zh')));
      await tester.pumpAndSettle();

      expect(find.text('404'), findsOneWidget);
      expect(find.text('页面不存在'), findsOneWidget);
      expect(find.text('返回首页'), findsOneWidget);
    });

    testWidgets('displays English text when locale is en', (tester) async {
      await tester.pumpWidget(buildTestApp(locale: const Locale('en')));
      await tester.pumpAndSettle();

      expect(find.text('404'), findsOneWidget);
      expect(find.text('Page not found'), findsOneWidget);
      expect(find.text('Back to Home'), findsOneWidget);
    });
  });
}
