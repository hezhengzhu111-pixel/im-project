import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:im_core/core.dart';
import 'package:im_l10n/im_l10n.dart';
import 'package:im_shared_features/auth.dart';
import 'package:im_shared_features/group.dart';

import '../helpers/fakes.dart';

void main() {
  group('GroupDetailView', () {
    late FakeHttpClientPort http;
    late GroupNotifier groupNotifier;
    late AuthNotifier authNotifier;

    setUp(() {
      http = FakeHttpClientPort();
      groupNotifier = GroupNotifier(GroupApi(http));
      authNotifier = createTestAuthNotifier(
        user: const User(id: 'u1', username: 'owner', nickname: 'Owner'),
      );
    });

    Widget buildView(Group group) {
      return ProviderScope(
        overrides: [
          groupStateProvider.overrideWith((ref) => groupNotifier),
          authStateProvider.overrideWith((ref) => authNotifier),
        ],
        child: MaterialApp(
          localizationsDelegates: AppLocalizations.localizationsDelegates,
          supportedLocales: AppLocalizations.supportedLocales,
          home: Scaffold(
            body: GroupDetailView(
              group: group,
              onEnterChat: () {},
              onLeave: (_) {},
              onDismiss: (_) {},
            ),
          ),
        ),
      );
    }

    testWidgets('shows owner badge and dismiss button for owner',
        (tester) async {
      await tester.pumpWidget(
        buildView(const Group(
          id: 'g1',
          name: 'Test Group',
          ownerId: 'u1',
          memberCount: 3,
        )),
      );
      await tester.pumpAndSettle();

      expect(find.text('Owner'), findsOneWidget);
      expect(find.byKey(const Key('group_dismiss_button')), findsOneWidget);
      expect(find.byKey(const Key('group_leave_button')), findsOneWidget);
    });

    testWidgets('hides dismiss button for non-owner', (tester) async {
      authNotifier.state = authNotifier.state.copyWith(
        user: const User(id: 'u2', username: 'member', nickname: 'Member'),
      );
      await tester.pumpWidget(
        buildView(const Group(
          id: 'g1',
          name: 'Test Group',
          ownerId: 'u1',
          memberCount: 3,
        )),
      );
      await tester.pumpAndSettle();

      expect(find.text('Member'), findsOneWidget);
      expect(find.byKey(const Key('group_dismiss_button')), findsNothing);
      expect(find.byKey(const Key('group_leave_button')), findsOneWidget);
    });

    testWidgets('dismiss group button triggers callback on success',
        (tester) async {
      http.onDelete = <T>(
        String path, {
        dynamic body,
        Map<String, dynamic>? queryParameters,
        required T Function(Map<String, dynamic>) fromJson,
      }) async {
        expect(path, '/api/group/g1');
        return ApiResponse<T>(
          code: 200,
          message: 'ok',
          data: fromJson({}),
        );
      };

      var dismissed = false;
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            groupStateProvider.overrideWith((ref) => groupNotifier),
            authStateProvider.overrideWith((ref) => authNotifier),
          ],
          child: MaterialApp(
            localizationsDelegates: AppLocalizations.localizationsDelegates,
            supportedLocales: AppLocalizations.supportedLocales,
            home: Scaffold(
              body: GroupDetailView(
                group: const Group(
                  id: 'g1',
                  name: 'Test Group',
                  ownerId: 'u1',
                  memberCount: 3,
                ),
                onEnterChat: () {},
                onLeave: (_) {},
                onDismiss: (_) => dismissed = true,
              ),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();

      await tester.tap(find.byKey(const Key('group_dismiss_button')));
      await tester.pumpAndSettle();

      // Confirm dialog
      await tester.tap(find.text('Dismiss group').last);
      await tester.pumpAndSettle();

      expect(dismissed, isTrue);
    });
  });
}
