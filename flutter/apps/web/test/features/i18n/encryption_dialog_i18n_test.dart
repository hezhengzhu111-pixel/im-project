import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:im_web/features/e2ee/presentation/encryption_dialog.dart';
import 'package:im_web/l10n/app_localizations.dart';

void main() {
  Widget buildTestApp(
      {Locale locale = const Locale('zh'), VoidCallback? onConfirm}) {
    return MaterialApp(
      locale: locale,
      localizationsDelegates: AppLocalizations.localizationsDelegates,
      supportedLocales: AppLocalizations.supportedLocales,
      home: Builder(
        builder: (context) => ElevatedButton(
          onPressed: () => showDialog(
            context: context,
            builder: (_) => EncryptionDialog(onConfirm: onConfirm ?? () {}),
          ),
          child: const Text('open'),
        ),
      ),
    );
  }

  group('EncryptionDialog i18n', () {
    testWidgets('displays Chinese text when locale is zh', (tester) async {
      await tester.pumpWidget(buildTestApp(locale: const Locale('zh')));
      await tester.tap(find.text('open'));
      await tester.pumpAndSettle();

      expect(find.text('启用端到端加密'), findsOneWidget);
      expect(find.text('取消'), findsOneWidget);
      expect(find.text('确认启用'), findsOneWidget);
    });

    testWidgets('displays English text when locale is en', (tester) async {
      await tester.pumpWidget(buildTestApp(locale: const Locale('en')));
      await tester.tap(find.text('open'));
      await tester.pumpAndSettle();

      expect(find.text('Enable End-to-End Encryption'), findsOneWidget);
      expect(find.text('Cancel'), findsOneWidget);
      expect(find.text('Confirm Enable'), findsOneWidget);
    });
  });
}
