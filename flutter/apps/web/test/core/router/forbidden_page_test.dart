import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:im_web/core/router/forbidden_page.dart';
import 'package:im_web/l10n/app_localizations.dart';

void main() {
  Widget buildTestApp({Locale locale = const Locale('zh')}) {
    return MaterialApp(
      locale: locale,
      localizationsDelegates: AppLocalizations.localizationsDelegates,
      supportedLocales: AppLocalizations.supportedLocales,
      home: const ForbiddenPage(),
    );
  }

  group('ForbiddenPage', () {
    testWidgets('displays 403 text', (tester) async {
      await tester.pumpWidget(buildTestApp());
      expect(find.text('403'), findsOneWidget);
    });

    testWidgets('displays Chinese text when locale is zh', (tester) async {
      await tester.pumpWidget(buildTestApp(locale: const Locale('zh')));
      await tester.pumpAndSettle();

      expect(find.text('无权访问'), findsOneWidget);
      expect(find.text('您没有权限访问此页面。'), findsOneWidget);
      expect(find.text('返回首页'), findsOneWidget);
    });

    testWidgets('displays English text when locale is en', (tester) async {
      await tester.pumpWidget(buildTestApp(locale: const Locale('en')));
      await tester.pumpAndSettle();

      expect(find.text('Access Denied'), findsOneWidget);
      expect(find.text('You don\'t have permission to access this page.'),
          findsOneWidget);
      expect(find.text('Back to Home'), findsOneWidget);
    });
  });
}
