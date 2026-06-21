import 'dart:typed_data';
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
  GlobalKey<NavigatorState>? navigatorKey,
}) {
  return ProviderScope(
    overrides: [
      storageProvider.overrideWithValue(FakeStoragePort()),
      ...overrides,
    ],
    child: MaterialApp(
      navigatorKey: navigatorKey,
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
  group('ProfileSettingsPage', () {
    late FakeHttpClientPort http;

    setUp(() {
      http = FakeHttpClientPort();
    });

    void prepareHttp() {
      http.onPut = <T>(
        String path, {
        dynamic body,
        required T Function(Map<String, dynamic>) fromJson,
      }) async {
        if (path.contains('profile')) {
          return ApiResponse<T>(
            code: 200,
            message: 'ok',
            data: fromJson({
              'id': 'u1',
              'username': 'testuser',
              'nickname': 'Updated Nickname',
              'email': 'updated@example.com',
            }),
          );
        }
        return ApiResponse<T>(code: 200, message: 'ok', data: fromJson({}));
      };
    }

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

      expect(find.text('Basic info'), findsOneWidget);
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

    testWidgets('tapping avatar triggers image picker', (tester) async {
      var pickerCalled = false;
      final fakePicker = FakeFilePickerPort(
        imageResult: () async {
          pickerCalled = true;
          return const Failure(OperationCancelled());
        },
      );
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
            filePickerPortProvider.overrideWithValue(fakePicker),
          ],
        ),
      );
      await tester.pumpAndSettle();

      await tester.tap(find.byType(GestureDetector).first);
      await tester.pumpAndSettle();

      expect(pickerCalled, isTrue);
    });

    testWidgets('picker Failure does not trigger upload', (tester) async {
      var uploadCalled = false;
      http.onPost = <T>(
        String path, {
        dynamic body,
        required T Function(Map<String, dynamic>) fromJson,
      }) async {
        if (path.contains('avatar')) uploadCalled = true;
        return ApiResponse<T>(code: 200, message: 'ok', data: fromJson({}));
      };
      final fakePicker = FakeFilePickerPort(
        imageResult: () async => const Failure(OperationCancelled()),
      );
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
            filePickerPortProvider.overrideWithValue(fakePicker),
          ],
        ),
      );
      await tester.pumpAndSettle();

      await tester.tap(find.byType(GestureDetector).first);
      await tester.pumpAndSettle();

      expect(uploadCalled, isFalse);
    });

    testWidgets('picker Success triggers upload and shows success',
        (tester) async {
      var uploadCalled = false;
      http.onPost = <T>(
        String path, {
        dynamic body,
        required T Function(Map<String, dynamic>) fromJson,
      }) async {
        if (path.contains('avatar')) {
          uploadCalled = true;
          return ApiResponse<T>(
            code: 200,
            message: 'ok',
            data: fromJson({'avatar_url': 'https://example.com/a.png'}),
          );
        }
        return ApiResponse<T>(code: 200, message: 'ok', data: fromJson({}));
      };
      final fakePicker = FakeFilePickerPort(
        imageResult: () async => Success(
          PickedFile.fromBytes(
            name: 'avatar.jpg',
            mimeType: 'image/jpeg',
            bytes: Uint8List.fromList([1, 2, 3]),
          ),
        ),
      );
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
            filePickerPortProvider.overrideWithValue(fakePicker),
          ],
        ),
      );
      await tester.pumpAndSettle();

      await tester.tap(find.byType(GestureDetector).first);
      // pump one frame so upload completes and snackbar appears
      await tester.pump();
      // absorb expected NetworkImage errors from the test HTTP override
      while (tester.takeException() != null) {}
      await tester.pump();

      expect(uploadCalled, isTrue);
      expect(find.text('Avatar updated successfully'), findsOneWidget);
    });

    testWidgets(
        'upload succeeds even when profileState.user is null '
        '(first entry fallback to authState.user)', (tester) async {
      var uploadCalled = false;
      http.onPost = <T>(
        String path, {
        dynamic body,
        required T Function(Map<String, dynamic>) fromJson,
      }) async {
        if (path.contains('avatar')) {
          uploadCalled = true;
          return ApiResponse<T>(
            code: 200,
            message: 'ok',
            data: fromJson({'avatar_url': 'https://example.com/new.png'}),
          );
        }
        return ApiResponse<T>(code: 200, message: 'ok', data: fromJson({}));
      };
      final fakePicker = FakeFilePickerPort(
        imageResult: () async => Success(
          PickedFile.fromBytes(
            name: 'avatar.jpg',
            mimeType: 'image/jpeg',
            bytes: Uint8List.fromList([1, 2, 3]),
          ),
        ),
      );
      final authNotifier = createTestAuthNotifier(httpClient: http);

      // Do NOT call loadProfile — profileState.user stays null
      await tester.pumpWidget(
        _buildApp(
          overrides: [
            settingsApiProvider.overrideWithValue(SettingsApi(http)),
            profileStateProvider
                .overrideWith((ref) => ProfileNotifier(SettingsApi(http))),
            authStateProvider.overrideWith((ref) => authNotifier),
            filePickerPortProvider.overrideWithValue(fakePicker),
          ],
        ),
      );
      await tester.pumpAndSettle();

      await tester.tap(find.byType(GestureDetector).first);
      await tester.pump();
      while (tester.takeException() != null) {}
      await tester.pump();

      expect(uploadCalled, isTrue);
      expect(find.text('Avatar updated successfully'), findsOneWidget);
      // verify authState avatar was updated
      expect(
        authNotifier.state.user?.avatar,
        'https://example.com/new.png',
      );
    });

    testWidgets('upload failure shows error snackbar', (tester) async {
      http.onPost = <T>(
        String path, {
        dynamic body,
        required T Function(Map<String, dynamic>) fromJson,
      }) async {
        if (path.contains('avatar')) throw Exception('upload failed');
        return ApiResponse<T>(code: 200, message: 'ok', data: fromJson({}));
      };
      final fakePicker = FakeFilePickerPort(
        imageResult: () async => Success(
          PickedFile.fromBytes(
            name: 'avatar.jpg',
            mimeType: 'image/jpeg',
            bytes: Uint8List.fromList([1, 2, 3]),
          ),
        ),
      );
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
            filePickerPortProvider.overrideWithValue(fakePicker),
          ],
        ),
      );
      await tester.pumpAndSettle();

      await tester.tap(find.byType(GestureDetector).first);
      await tester.pumpAndSettle();

      expect(find.text('Failed to upload avatar'), findsOneWidget);
    });

    testWidgets('save profile updates authState user nickname', (tester) async {
      tester.view.physicalSize = const Size(800, 1200);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.reset);
      prepareHttp();
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

      await tester.enterText(
          find.widgetWithText(TextFormField, 'Nickname'), 'Updated Nickname');
      await tester.pump();

      final saveButton = find.byKey(const ValueKey('profile-save-button'));
      await tester.ensureVisible(saveButton);
      await tester.pumpAndSettle();
      await tester.tap(saveButton);
      await tester.pumpAndSettle();

      expect(authNotifier.state.user?.nickname, 'Updated Nickname');
      expect(find.text('Profile updated'), findsOneWidget);
    });

    testWidgets('wide layout uses row body key', (tester) async {
      final authNotifier = createTestAuthNotifier(httpClient: http);
      tester.view.physicalSize = const Size(900, 800);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.reset);

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

      expect(find.byKey(const ValueKey('profile-body-wide')), findsOneWidget);
    });

    testWidgets('compact layout uses column body key', (tester) async {
      final authNotifier = createTestAuthNotifier(httpClient: http);
      tester.view.physicalSize = const Size(600, 800);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.reset);

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

      expect(
          find.byKey(const ValueKey('profile-body-compact')), findsOneWidget);
    });

    testWidgets('rapid save taps only call update once', (tester) async {
      var updateCount = 0;
      prepareHttp();
      http.onPut = <T>(
        String path, {
        dynamic body,
        required T Function(Map<String, dynamic>) fromJson,
      }) async {
        if (path.contains('profile')) {
          updateCount++;
          // slow request so the guard remains active
          await Future.delayed(const Duration(milliseconds: 200));
          return ApiResponse<T>(
            code: 200,
            message: 'ok',
            data: fromJson({
              'id': 'u1',
              'username': 'testuser',
              'nickname': 'Updated Nickname',
            }),
          );
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

      await tester.enterText(
          find.widgetWithText(TextFormField, 'Nickname'), 'A');
      await tester.pump();

      final saveButton = find.byKey(const ValueKey('profile-save-button'));
      await tester.ensureVisible(saveButton);
      await tester.pumpAndSettle();
      await tester.tap(saveButton);
      await tester.pump(const Duration(milliseconds: 50));
      // Second tap should be ignored while the first save is in flight.
      await tester.tap(saveButton);
      await tester.pumpAndSettle();

      expect(updateCount, 1);
    });

    testWidgets('unsaved changes prompt appears when leaving dirty form',
        (tester) async {
      final navKey = GlobalKey<NavigatorState>();
      final authNotifier = createTestAuthNotifier(httpClient: http);

      await tester.pumpWidget(
        _buildApp(
          navigatorKey: navKey,
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

      await tester.enterText(
          find.widgetWithText(TextFormField, 'Nickname'), 'Dirty');
      await tester.pump();

      navKey.currentState!.maybePop();
      await tester.pumpAndSettle();

      expect(find.text('Unsaved changes'), findsOneWidget);
    });
  });
}
