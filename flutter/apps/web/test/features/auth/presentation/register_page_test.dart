import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:im_core/core.dart';
import 'package:im_web/core/theme/glass_theme.dart';
import 'package:im_web/features/auth/presentation/auth_provider.dart';
import 'package:im_web/features/auth/presentation/auth_providers.dart';
import 'package:im_web/features/auth/presentation/register_page.dart';
import 'package:im_web/features/settings/presentation/settings_providers.dart';
import 'package:im_web/l10n/app_localizations.dart';

import '../../../helpers/fakes.dart';

void main() {
  testWidgets('submits valid registration once', (tester) async {
    final repo = FakeAuthRepository();

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          authStateProvider.overrideWith((ref) {
            return AuthNotifier(
              repo,
              FakeWsClientPort(),
              FakeHttpClientPort(),
              NoopAnalyticsPort(),
            );
          }),
          languageProvider.overrideWith((ref) => 'en'),
        ],
        child: MaterialApp(
          locale: const Locale('en'),
          localizationsDelegates: AppLocalizations.localizationsDelegates,
          supportedLocales: AppLocalizations.supportedLocales,
          theme: ThemeData(extensions: [GlassTheme.light]),
          home: const RegisterPage(),
        ),
      ),
    );
    await tester.pump(const Duration(milliseconds: 1000));

    final fields = find.byType(TextFormField);
    expect(fields, findsNWidgets(4));
    await tester.enterText(fields.at(0), 'newuser');
    await tester.enterText(fields.at(1), 'new@example.com');
    await tester.enterText(fields.at(2), 'password123');
    await tester.enterText(fields.at(3), 'password123');
    await tester.tap(find.byType(Checkbox));
    await tester.pump();

    await tester.tap(find.widgetWithText(ElevatedButton, 'Register'));
    await tester.pump(const Duration(milliseconds: 1000));

    expect(repo.registerCallCount, 1);
    expect(repo.lastRegisterRequest?.username, 'newuser');
    expect(repo.lastRegisterRequest?.email, 'new@example.com');
    expect(find.text('Success'), findsOneWidget);
  });
}
