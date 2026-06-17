import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:im_shared_features/auth.dart';
import 'package:im_shared_features/chat.dart';
import 'package:im_shared_features/contacts.dart';
import 'package:im_shared_features/group.dart';
import 'package:im_shared_features/moments.dart';
import 'package:im_shared_features/settings.dart';
import '../helpers/fakes.dart';

void main() {
  group('Shared pages are real widgets, not placeholders', () {
    testWidgets('AddFriendPage renders', (tester) async {
      final http = FakeHttpClientPort()..onGet = aiAwareOnGet();
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            contactsStateProvider.overrideWith(
                (ref) => ContactsNotifier(ContactsApi(http), FakeWsClient())),
            currentUserIdProvider.overrideWithValue('u1'),
          ],
          child: const MaterialApp(home: AddFriendPage()),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.byType(AddFriendPage), findsOneWidget);
      expect(find.text('Add Friend'), findsOneWidget);
    });

    testWidgets('CreateGroupPage renders', (tester) async {
      final http = FakeHttpClientPort()..onGet = aiAwareOnGet();
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            contactsStateProvider.overrideWith(
                (ref) => ContactsNotifier(ContactsApi(http), FakeWsClient())),
            groupStateProvider
                .overrideWith((ref) => GroupNotifier(GroupApi(http))),
          ],
          child: const MaterialApp(home: CreateGroupPage()),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.byType(CreateGroupPage), findsOneWidget);
      expect(find.text('Group Name'), findsOneWidget);
    });

    testWidgets('MomentsNotificationsPage renders', (tester) async {
      final http = FakeHttpClientPort()..onGet = aiAwareOnGet();
      final api = MomentsApi(http);
      final repo =
          MomentsRepository(api, FileApi(http, FakeAnalyticsPort()));
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            notificationsProvider
                .overrideWith((ref) => MomentsNotificationsNotifier(repo)),
          ],
          child: const MaterialApp(home: MomentsNotificationsPage()),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.byType(MomentsNotificationsPage), findsOneWidget);
    });

    testWidgets('ProfileSettingsPage renders', (tester) async {
      final http = FakeHttpClientPort()..onGet = aiAwareOnGet();
      final authNotifier = createTestAuthNotifier(httpClient: http);
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            settingsApiProvider.overrideWithValue(SettingsApi(http)),
            profileStateProvider
                .overrideWith((ref) => ProfileNotifier(SettingsApi(http))),
            authStateProvider.overrideWith((ref) => authNotifier),
          ],
          child: const MaterialApp(home: ProfileSettingsPage()),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.byType(ProfileSettingsPage), findsOneWidget);
      expect(find.text('Profile Settings'), findsOneWidget);
    });

    testWidgets('AiSettingsPage renders', (tester) async {
      final http = FakeHttpClientPort()..onGet = aiAwareOnGet();
      final api = AiApi(http);
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            aiSettingsStateProvider
                .overrideWith((ref) => AiSettingsNotifier(api)),
            settingsApiProvider.overrideWithValue(SettingsApi(http)),
            aiApiProvider.overrideWithValue(api),
          ],
          child: const MaterialApp(home: AiSettingsPage()),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.byType(AiSettingsPage), findsOneWidget);
      expect(find.text('AI Settings'), findsWidgets);
    });
  });
}
