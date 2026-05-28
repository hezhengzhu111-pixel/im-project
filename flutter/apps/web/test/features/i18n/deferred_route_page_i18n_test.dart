import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:im_web/core/router/deferred_route_page.dart';
import 'package:im_web/l10n/app_localizations.dart';

void main() {
  Widget buildTestApp({
    Locale locale = const Locale('zh'),
    required Future<void> Function() loadLibrary,
    Widget Function()? builder,
  }) {
    return MaterialApp(
      locale: locale,
      localizationsDelegates: AppLocalizations.localizationsDelegates,
      supportedLocales: AppLocalizations.supportedLocales,
      home: DeferredRoutePage(
        loadLibrary: loadLibrary,
        builder: builder ?? () => const Text('loaded'),
      ),
    );
  }

  group('DeferredRoutePage i18n', () {
    testWidgets('shows Chinese loading text when locale is zh', (tester) async {
      final completer = Completer<void>();
      await tester.pumpWidget(buildTestApp(
        locale: const Locale('zh'),
        loadLibrary: () => completer.future,
      ));
      await tester.pump();

      expect(find.byType(CircularProgressIndicator), findsOneWidget);
      expect(find.text('加载中...'), findsOneWidget);
    });

    testWidgets('shows English loading text when locale is en', (tester) async {
      final completer = Completer<void>();
      await tester.pumpWidget(buildTestApp(
        locale: const Locale('en'),
        loadLibrary: () => completer.future,
      ));
      await tester.pump();

      expect(find.byType(CircularProgressIndicator), findsOneWidget);
      expect(find.text('Loading...'), findsOneWidget);
    });

    testWidgets('shows Chinese error text when locale is zh', (tester) async {
      await tester.pumpWidget(buildTestApp(
        locale: const Locale('zh'),
        loadLibrary: () => Future.error('test error'),
      ));
      await tester.pumpAndSettle();

      expect(find.textContaining('加载失败'), findsOneWidget);
      expect(find.text('重试'), findsOneWidget);
    });

    testWidgets('shows English error text when locale is en', (tester) async {
      await tester.pumpWidget(buildTestApp(
        locale: const Locale('en'),
        loadLibrary: () => Future.error('test error'),
      ));
      await tester.pumpAndSettle();

      expect(find.textContaining('Loading failed'), findsOneWidget);
      expect(find.text('Retry'), findsOneWidget);
    });
  });
}
