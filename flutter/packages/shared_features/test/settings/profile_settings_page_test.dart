import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:im_shared_features/auth.dart';
import 'package:im_shared_features/settings.dart';
import '../helpers/fakes.dart';

Widget _buildApp({
  required List<Override> overrides,
}) {
  return ProviderScope(
    overrides: overrides,
    child: const MaterialApp(
      home: ProfileSettingsPage(),
    ),
  );
}

void main() {
  group('ProfileSettingsPage', () {
    late FakeHttpClientPort http;

    setUp(() {
      http = FakeHttpClientPort();
    });

    testWidgets('shows Profile Settings title and form fields', (tester) async {
      final authNotifier = createTestAuthNotifier(httpClient: http);

      await tester.pumpWidget(
        _buildApp(
          overrides: [
            settingsApiProvider.overrideWithValue(SettingsApi(http)),
            profileStateProvider
                .overrideWith((ref) => ProfileNotifier(SettingsApi(http))),
            authStateProvider.overrideWith((ref) => authNotifier),
          ],
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('Profile Settings'), findsOneWidget);
      expect(find.text('Username'), findsOneWidget);
      expect(find.text('Nickname'), findsOneWidget);
      expect(find.text('Signature'), findsOneWidget);
      expect(find.text('Location'), findsOneWidget);
    });

    testWidgets('no Placeholder text', (tester) async {
      final authNotifier = createTestAuthNotifier(httpClient: http);

      await tester.pumpWidget(
        _buildApp(
          overrides: [
            settingsApiProvider.overrideWithValue(SettingsApi(http)),
            profileStateProvider
                .overrideWith((ref) => ProfileNotifier(SettingsApi(http))),
            authStateProvider.overrideWith((ref) => authNotifier),
          ],
        ),
      );
      await tester.pumpAndSettle();

      expect(find.textContaining('Placeholder'), findsNothing);
      expect(find.textContaining('TODO'), findsNothing);
    });
  });
}
