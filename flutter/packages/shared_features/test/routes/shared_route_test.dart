import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:im_core_flutter/im_core_flutter.dart';
import 'package:im_l10n/im_l10n.dart';
import 'package:im_shared_features/auth.dart';
import 'package:im_shared_features/chat.dart';
import 'package:im_shared_features/contacts.dart';
import 'package:im_shared_features/group.dart';
import 'package:im_shared_features/moments.dart';
import 'package:im_shared_features/settings.dart';
import '../helpers/fakes.dart';

void main() {
  group('Shared pages are real widgets, not placeholders', () {
    Widget _buildApp({required List<Override> overrides, required Widget home}) {
      return ProviderScope(
        overrides: [
          storageProvider.overrideWithValue(FakeStoragePort()),
          ...overrides,
        ],
        child: MaterialApp(
          locale: const Locale('en'),
          localizationsDelegates: AppLocalizations.localizationsDelegates,
          supportedLocales: AppLocalizations.supportedLocales,
          home: Scaffold(body: home),
        ),
      );
    }

    testWidgets('AddFriendPage renders', (tester) async {
      final http = FakeHttpClientPort()..onGet = aiAwareOnGet();
      await tester.pumpWidget(
        _buildApp(
          overrides: [
            contactsStateProvider.overrideWith(
                (ref) => ContactsNotifier(ContactsApi(http), FakeWsClient())),
            currentUserIdProvider.overrideWithValue('u1'),
          ],
          home: const AddFriendPage(),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.byType(AddFriendPage), findsOneWidget);
      expect(find.text('Add Friend'), findsOneWidget);
    });

    testWidgets('CreateGroupPage renders', (tester) async {
      final http = FakeHttpClientPort()..onGet = aiAwareOnGet();
      await tester.pumpWidget(
        _buildApp(
          overrides: [
            contactsStateProvider.overrideWith(
                (ref) => ContactsNotifier(ContactsApi(http), FakeWsClient())),
            groupStateProvider
                .overrideWith((ref) => GroupNotifier(GroupApi(http))),
          ],
          home: const CreateGroupPage(),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.byType(CreateGroupPage), findsOneWidget);
      expect(find.text('Group name'), findsOneWidget);
    });

    testWidgets('MomentsNotificationsPage renders', (tester) async {
      final http = FakeHttpClientPort()..onGet = aiAwareOnGet();
      final api = MomentsApi(http);
      final repo =
          MomentsRepository(api, FileApi(http, FakeAnalyticsPort()));
      await tester.pumpWidget(
        _buildApp(
          overrides: [
            notificationsProvider
                .overrideWith((ref) => MomentsNotificationsNotifier(repo)),
          ],
          home: const MomentsNotificationsPage(),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.byType(MomentsNotificationsPage), findsOneWidget);
    });

    testWidgets('ProfileSettingsPage renders', (tester) async {
      final http = FakeHttpClientPort()..onGet = aiAwareOnGet();
      final authNotifier = createTestAuthNotifier(httpClient: http);
      await tester.pumpWidget(
        _buildApp(
          overrides: [
            settingsApiProvider.overrideWithValue(SettingsApi(http)),
            profileStateProvider
                .overrideWith((ref) => ProfileNotifier(SettingsApi(http))),
            authStateProvider.overrideWith((ref) => authNotifier),
          ],
          home: const ProfileSettingsPage(),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.byType(ProfileSettingsPage), findsOneWidget);
      expect(find.text('Basic info'), findsOneWidget);
    });

    testWidgets('AiSettingsPage renders', (tester) async {
      final http = FakeHttpClientPort()..onGet = aiAwareOnGet();
      final api = AiApi(http);
      await tester.pumpWidget(
        _buildApp(
          overrides: [
            aiSettingsStateProvider
                .overrideWith((ref) => AiSettingsNotifier(api)),
            settingsApiProvider.overrideWithValue(SettingsApi(http)),
            aiApiProvider.overrideWithValue(api),
          ],
          home: const AiSettingsPage(),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.byType(AiSettingsPage), findsOneWidget);
      expect(find.text('AI Assistant'), findsWidgets);
    });
  });
}
