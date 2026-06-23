import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:im_core/core.dart';
import 'package:im_l10n/im_l10n.dart';
import 'package:im_shared_features/auth.dart';
import 'package:im_shared_features/contacts.dart';

import '../../helpers/fakes.dart';

class _FakeAuthNotifier extends AuthNotifier {
  _FakeAuthNotifier(AuthState initialState)
      : super(
          FakeAuthRepository(),
          FakeWsClientPort(),
          FakeHttpClientPort(),
          NoopAnalyticsPort(),
        ) {
    state = initialState;
  }
}

void main() {
  testWidgets(
    'shows accept and reject actions for incoming pending requests',
    (tester) async {
      final http = FakeHttpClientPort();
      final ws = FakeWsClientPort();

      http.onGet = <T>(
        String path, {
        Map<String, dynamic>? queryParameters,
        required T Function(Map<String, dynamic>) fromJson,
      }) async {
        if (path == FriendEndpoints.list) {
          return ApiResponse(
            code: 200,
            message: 'ok',
            data: fromJson({'items': const []}),
          );
        }

        if (path == FriendEndpoints.requests) {
          return ApiResponse(
            code: 200,
            message: 'ok',
            data: fromJson({
              'items': [
                {
                  'id': 'req-1',
                  'applicantId': 'user-2',
                  'applicantUsername': 'alice',
                  'applicantNickname': 'Alice',
                  'targetUserId': 'current-user',
                  'targetUsername': 'me',
                  'status': 'PENDING',
                  'createTime': '2026-05-29T00:00:00Z',
                },
              ],
            }),
          );
        }

        expect(path, UserEndpoints.search);
        expect(queryParameters, {
          'keyword': 'alice',
          'type': 'username',
        });
        return ApiResponse(
          code: 200,
          message: 'ok',
          data: fromJson({
            'items': [
              {
                'id': 'user-2',
                'username': 'alice',
                'nickname': 'Alice',
                'email': 'alice@example.com',
              },
            ],
          }),
        );
      };

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            authStateProvider.overrideWith(
              (ref) => _FakeAuthNotifier(
                const AuthState(
                  user: User(id: 'current-user', username: 'me'),
                  status: AuthStatus.authenticated,
                ),
              ),
            ),
            contactsStateProvider.overrideWith(
              (ref) => ContactsNotifier(ContactsApi(http), ws),
            ),
          ],
          child: MaterialApp(
            locale: const Locale('en'),
            localizationsDelegates: AppLocalizations.localizationsDelegates,
            supportedLocales: AppLocalizations.supportedLocales,
            home: const AddFriendPage(),
          ),
        ),
      );

      await tester.pump();
      await tester.pumpAndSettle();

      await tester.enterText(find.byType(TextField).first, 'alice');
      await tester.pump(const Duration(milliseconds: 600));
      await tester.pumpAndSettle();

      expect(find.text('Alice'), findsOneWidget);
      expect(find.byTooltip('Accept'), findsOneWidget);
      expect(find.byTooltip('Reject'), findsOneWidget);
      expect(find.text('Add'), findsNothing);
    },
  );
}
