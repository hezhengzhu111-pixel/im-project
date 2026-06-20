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
  });
}
