import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:im_core/core.dart';
import 'package:im_shared_features/contacts.dart';
import 'package:im_shared_features/group.dart';
import '../helpers/fakes.dart';

class _FakeWsClient implements WsClientPort {
  @override
  Stream<WsEvent> get events => const Stream.empty();
  @override
  Stream<WsConnectionState> get connectionState => const Stream.empty();
  @override
  bool get isConnected => true;
  @override
  String get wsBaseUrl => 'ws://localhost';
  @override
  Future<void> connect(String url) async {}
  @override
  Future<void> disconnect() async {}
  @override
  Future<void> reconnect() async {}
  @override
  void send(Map<String, dynamic> message) {}
}

Widget _buildApp({
  required List<Override> overrides,
}) {
  return ProviderScope(
    overrides: overrides,
    child: const MaterialApp(
      home: CreateGroupPage(),
    ),
  );
}

void main() {
  group('CreateGroupPage', () {
    late FakeHttpClientPort http;
    late _FakeWsClient ws;

    setUp(() {
      http = FakeHttpClientPort();
      ws = _FakeWsClient();
    });

    testWidgets('shows form fields and create button', (tester) async {
      await tester.pumpWidget(
        _buildApp(
          overrides: [
            contactsStateProvider.overrideWith(
                (ref) => ContactsNotifier(ContactsApi(http), ws)),
            groupStateProvider
                .overrideWith((ref) => GroupNotifier(GroupApi(http))),
          ],
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('Create Group'), findsWidgets);
      expect(find.text('Group Name'), findsOneWidget);
      expect(find.text('Description (optional)'), findsOneWidget);
    });

    testWidgets('empty name shows validation error', (tester) async {
      await tester.pumpWidget(
        _buildApp(
          overrides: [
            contactsStateProvider.overrideWith(
                (ref) => ContactsNotifier(ContactsApi(http), ws)),
            groupStateProvider
                .overrideWith((ref) => GroupNotifier(GroupApi(http))),
          ],
        ),
      );
      await tester.pumpAndSettle();

      final createButton = find.widgetWithText(ElevatedButton, 'Create Group');
      await tester.tap(createButton);
      await tester.pumpAndSettle();

      expect(find.text('Group name is required'), findsOneWidget);
    });

    testWidgets('createGroup called with valid name', (tester) async {
      bool postCalled = false;
      http.onPost = <T>(
        String path, {
        dynamic body,
        required T Function(Map<String, dynamic>) fromJson,
      }) async {
        postCalled = true;
        return ApiResponse<T>(
          code: 200,
          message: 'ok',
          data: fromJson({
            'id': 'g1',
            'name': 'Test Group',
            'ownerId': 'u1',
            'createTime': '2026-01-01',
          }),
        );
      };

      await tester.pumpWidget(
        _buildApp(
          overrides: [
            contactsStateProvider.overrideWith(
                (ref) => ContactsNotifier(ContactsApi(http), ws)),
            groupStateProvider
                .overrideWith((ref) => GroupNotifier(GroupApi(http))),
          ],
        ),
      );
      await tester.pumpAndSettle();

      await tester.enterText(
        find.widgetWithText(TextFormField, 'Group Name'),
        'Test Group',
      );

      final createButton = find.widgetWithText(ElevatedButton, 'Create Group');
      await tester.tap(createButton);
      await tester.pumpAndSettle();

      // Page pops after success, so snackbar may be gone.
      // Verify the API was called instead.
      expect(postCalled, isTrue);
      expect(http.requests.where((r) => r.$1 == 'POST').length, 1);
    });

    testWidgets('member ID parsing works', (tester) async {
      await tester.pumpWidget(
        _buildApp(
          overrides: [
            contactsStateProvider.overrideWith(
                (ref) => ContactsNotifier(ContactsApi(http), ws)),
            groupStateProvider
                .overrideWith((ref) => GroupNotifier(GroupApi(http))),
          ],
        ),
      );
      await tester.pumpAndSettle();

      await tester.enterText(
        find.widgetWithText(TextField, 'Comma-separated user IDs'),
        'u1, u2, u3',
      );
      await tester.tap(find.byTooltip('Add member IDs'));
      await tester.pumpAndSettle();

      expect(find.text('Selected members: 3'), findsOneWidget);
    });

    testWidgets('no Placeholder text', (tester) async {
      await tester.pumpWidget(
        _buildApp(
          overrides: [
            contactsStateProvider.overrideWith(
                (ref) => ContactsNotifier(ContactsApi(http), ws)),
            groupStateProvider
                .overrideWith((ref) => GroupNotifier(GroupApi(http))),
          ],
        ),
      );
      await tester.pumpAndSettle();

      expect(find.textContaining('Placeholder'), findsNothing);
      expect(find.textContaining('TODO'), findsNothing);
    });
  });
}
