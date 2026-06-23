import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:im_core/core.dart';
import 'package:im_core_flutter/im_core_flutter.dart';
import 'package:im_l10n/im_l10n.dart';
import 'package:im_shared_features/auth.dart';
import 'package:im_shared_features/settings.dart';
import 'package:im_ui/im_ui.dart';
import '../helpers/fakes.dart';

Widget _buildApp({
  required List<Override> overrides,
}) {
  return ProviderScope(
    overrides: [
      storageProvider.overrideWithValue(FakeStoragePort()),
      ...overrides,
    ],
    child: MaterialApp(
      localizationsDelegates: AppLocalizations.localizationsDelegates,
      supportedLocales: AppLocalizations.supportedLocales,
      theme: ImTheme.light().copyWith(
        extensions: [GlassTheme.light],
      ),
      home: const Scaffold(
        body: ProfileSettingsPage(),
      ),
    ),
  );
}

void main() {
  group('BindPhoneDialog', () {
    late FakeHttpClientPort http;

    setUp(() {
      http = FakeHttpClientPort();
    });

    testWidgets('binds phone and updates authState', (tester) async {
      http.onPost = <T>(
        String path, {
        dynamic body,
        required T Function(Map<String, dynamic>) fromJson,
      }) async {
        if (path.contains('phone') && path.contains('bind')) {
          return ApiResponse<T>(code: 200, message: 'ok', data: fromJson({}));
        }
        return ApiResponse<T>(code: 200, message: 'ok', data: fromJson({}));
      };
      final authNotifier = createTestAuthNotifier(httpClient: http);

      await tester.pumpWidget(
        _buildApp(
          overrides: [
            settingsApiProvider.overrideWithValue(SettingsApi(http)),
            profileStateProvider.overrideWith((ref) {
              final notifier = ProfileNotifier(SettingsApi(http));
              notifier.loadProfile(authNotifier.state.user!);
              return notifier;
            }),
            authStateProvider.overrideWith((ref) => authNotifier),
          ],
        ),
      );
      await tester.pumpAndSettle();

      await tester.tap(find.text('Phone verification'));
      await tester.pumpAndSettle();

      expect(find.text('Phone verification'), findsWidgets);
      expect(find.text('Verification code'), findsOneWidget);

      final dialogFinder = find.byType(AlertDialog);
      await tester.enterText(
        find.descendant(
          of: dialogFinder,
          matching: find.widgetWithText(TextField, 'Phone'),
        ),
        '13800138000',
      );
      await tester.enterText(
        find.descendant(
          of: dialogFinder,
          matching: find.widgetWithText(TextField, 'Verification code'),
        ),
        '123456',
      );
      await tester.tap(find.text('Confirm'));
      await tester.pumpAndSettle();

      expect(authNotifier.state.user?.phone, '13800138000');
    });
  });
}
