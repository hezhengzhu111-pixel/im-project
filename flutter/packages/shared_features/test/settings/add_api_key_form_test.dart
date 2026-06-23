import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:im_l10n/im_l10n.dart';
import 'package:im_shared_features/src/settings/presentation/widgets/add_api_key_form.dart';

Widget _buildApp(Widget child) {
  return MaterialApp(
    locale: const Locale('en'),
    localizationsDelegates: AppLocalizations.localizationsDelegates,
    supportedLocales: AppLocalizations.supportedLocales,
    home: Scaffold(body: child),
  );
}

void main() {
  group('AddApiKeyForm', () {
    testWidgets('createState renders and submits entered values',
        (tester) async {
      // @coversSymbol('createState')
      var submitted = false;

      await tester.pumpWidget(
        _buildApp(
          AddApiKeyForm(
            onSubmit: (provider, key, label) async {
              submitted = true;
              expect(provider, 'DeepSeek');
              expect(key, 'sk-test');
              expect(label, 'main');
              return true;
            },
          ),
        ),
      );

      await tester.enterText(
          find.widgetWithText(TextField, 'API Key'), 'sk-test');
      await tester.enterText(find.widgetWithText(TextField, 'Label'), 'main');
      await tester.tap(find.text('Save'));
      await tester.pumpAndSettle();

      expect(submitted, isTrue);
    });
  });
}
