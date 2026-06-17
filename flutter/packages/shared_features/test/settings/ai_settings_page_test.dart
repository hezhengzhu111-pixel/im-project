import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:im_core/core.dart';
import 'package:im_shared_features/settings.dart';
import '../helpers/fakes.dart';

Widget _buildApp({
  required List<Override> overrides,
}) {
  return ProviderScope(
    overrides: overrides,
    child: const MaterialApp(
      home: AiSettingsPage(),
    ),
  );
}

/// Returns an onGet handler that distinguishes between getKeys and getAiSettings
/// based on the request path.
FakeHttpClientPort _createHttp() {
  return FakeHttpClientPort()..onGet = aiAwareOnGet();
}

void main() {
  group('AiSettingsPage', () {
    testWidgets('shows loading initially', (tester) async {
      final http = FakeHttpClientPort();
      http.onGet = <T>(
        String path, {
        Map<String, dynamic>? queryParameters,
        required T Function(Map<String, dynamic>) fromJson,
      }) async {
        await Future<void>.delayed(const Duration(milliseconds: 100));
        if (path == AiEndpoints.settings) {
          return ApiResponse<T>(
            code: 200,
            message: 'ok',
            data: fromJson({
              'autoReplyEnabled': false,
              'autoReplyPersona': '',
            }),
          );
        }
        return ApiResponse<T>(
          code: 200,
          message: 'ok',
          data: fromJson({'items': <dynamic>[]}),
        );
      };

      final api = AiApi(http);

      await tester.pumpWidget(
        _buildApp(
          overrides: [
            aiSettingsStateProvider
                .overrideWith((ref) => AiSettingsNotifier(api)),
            settingsApiProvider.overrideWithValue(SettingsApi(http)),
            aiApiProvider.overrideWithValue(api),
          ],
        ),
      );
      await tester.pump();

      expect(find.byType(CircularProgressIndicator), findsOneWidget);

      await tester.pumpAndSettle();
    });

    testWidgets('shows empty state when no keys', (tester) async {
      final http = _createHttp();
      final api = AiApi(http);

      await tester.pumpWidget(
        _buildApp(
          overrides: [
            aiSettingsStateProvider
                .overrideWith((ref) => AiSettingsNotifier(api)),
            settingsApiProvider.overrideWithValue(SettingsApi(http)),
            aiApiProvider.overrideWithValue(api),
          ],
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('No API keys configured'), findsOneWidget);
    });

    testWidgets('shows keys with masked values', (tester) async {
      final http = FakeHttpClientPort();
      http.onGet = <T>(
        String path, {
        Map<String, dynamic>? queryParameters,
        required T Function(Map<String, dynamic>) fromJson,
      }) async {
        if (path == AiEndpoints.settings) {
          return ApiResponse<T>(
            code: 200,
            message: 'ok',
            data: fromJson({
              'autoReplyEnabled': false,
              'autoReplyPersona': '',
            }),
          );
        }
        return ApiResponse<T>(
          code: 200,
          message: 'ok',
          data: fromJson({
            'items': [
              {
                'id': 'k1',
                'provider': 'openai',
                'key': 'sk-abcdefghijklmnopqrstuvwxyz123456',
                'label': 'My OpenAI Key',
                'status': 'valid',
                'createdAt': '2026-01-01',
              },
            ],
          }),
        );
      };

      final api = AiApi(http);

      await tester.pumpWidget(
        _buildApp(
          overrides: [
            aiSettingsStateProvider
                .overrideWith((ref) => AiSettingsNotifier(api)),
            settingsApiProvider.overrideWithValue(SettingsApi(http)),
            aiApiProvider.overrideWithValue(api),
          ],
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('sk-a****3456'), findsOneWidget);
      expect(find.text('sk-abcdefghijklmnopqrstuvwxyz123456'), findsNothing);
      expect(find.text('My OpenAI Key'), findsOneWidget);
      expect(find.textContaining('valid'), findsOneWidget);
    });

    testWidgets('add key form validation', (tester) async {
      final http = _createHttp();
      final api = AiApi(http);

      await tester.pumpWidget(
        _buildApp(
          overrides: [
            aiSettingsStateProvider
                .overrideWith((ref) => AiSettingsNotifier(api)),
            settingsApiProvider.overrideWithValue(SettingsApi(http)),
            aiApiProvider.overrideWithValue(api),
          ],
        ),
      );
      await tester.pumpAndSettle();

      await tester.tap(find.text('Add Key'));
      await tester.pumpAndSettle();

      await tester.tap(find.text('Save Key'));
      await tester.pumpAndSettle();

      expect(find.text('API key is required'), findsOneWidget);
    });

    testWidgets('create key calls notifier', (tester) async {
      final http = _createHttp();
      bool keyCreated = false;
      http.onPost = <T>(
        String path, {
        dynamic body,
        required T Function(Map<String, dynamic>) fromJson,
      }) async {
        keyCreated = true;
        return ApiResponse<T>(
          code: 200,
          message: 'ok',
          data: fromJson({
            'id': 'k1',
            'provider': 'openai',
            'key': 'sk-new1234',
            'label': 'New Key',
            'status': 'unknown',
            'createdAt': '2026-01-01',
          }),
        );
      };

      final api = AiApi(http);

      await tester.pumpWidget(
        _buildApp(
          overrides: [
            aiSettingsStateProvider
                .overrideWith((ref) => AiSettingsNotifier(api)),
            settingsApiProvider.overrideWithValue(SettingsApi(http)),
            aiApiProvider.overrideWithValue(api),
          ],
        ),
      );
      await tester.pumpAndSettle();

      await tester.tap(find.text('Add Key'));
      await tester.pumpAndSettle();

      await tester.enterText(
        find.widgetWithText(TextFormField, 'API Key'),
        'sk-new1234',
      );

      await tester.tap(find.text('Save Key'));
      await tester.pumpAndSettle();

      expect(keyCreated, isTrue);
      expect(find.text('API key added successfully'), findsOneWidget);
    });

    testWidgets('auto reply switch toggle', (tester) async {
      final http = _createHttp();
      bool settingsUpdated = false;
      http.onPut = <T>(
        String path, {
        dynamic body,
        required T Function(Map<String, dynamic>) fromJson,
      }) async {
        settingsUpdated = true;
        return ApiResponse<T>(code: 200, message: 'ok', data: fromJson({}));
      };

      final api = AiApi(http);

      await tester.pumpWidget(
        _buildApp(
          overrides: [
            aiSettingsStateProvider
                .overrideWith((ref) => AiSettingsNotifier(api)),
            settingsApiProvider.overrideWithValue(SettingsApi(http)),
            aiApiProvider.overrideWithValue(api),
          ],
        ),
      );
      await tester.pumpAndSettle();

      final switchFinder = find.byType(SwitchListTile);
      expect(switchFinder, findsOneWidget);
      await tester.tap(switchFinder);
      await tester.pumpAndSettle();

      expect(settingsUpdated, isTrue);
    });

    testWidgets('key display is masked - no full key in UI', (tester) async {
      const fullKey = 'sk-proj-abcdefghijklmnopqrstuvwxyz1234567890';
      final http = FakeHttpClientPort();
      http.onGet = <T>(
        String path, {
        Map<String, dynamic>? queryParameters,
        required T Function(Map<String, dynamic>) fromJson,
      }) async {
        if (path == AiEndpoints.settings) {
          return ApiResponse<T>(
            code: 200,
            message: 'ok',
            data: fromJson({
              'autoReplyEnabled': false,
              'autoReplyPersona': '',
            }),
          );
        }
        return ApiResponse<T>(
          code: 200,
          message: 'ok',
          data: fromJson({
            'items': [
              {
                'id': 'k1',
                'provider': 'openai',
                'key': fullKey,
                'status': 'valid',
                'createdAt': '2026-01-01',
              },
            ],
          }),
        );
      };

      final api = AiApi(http);

      await tester.pumpWidget(
        _buildApp(
          overrides: [
            aiSettingsStateProvider
                .overrideWith((ref) => AiSettingsNotifier(api)),
            settingsApiProvider.overrideWithValue(SettingsApi(http)),
            aiApiProvider.overrideWithValue(api),
          ],
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text(fullKey), findsNothing);
      expect(find.textContaining(fullKey), findsNothing);
      expect(find.text('sk-p****7890'), findsOneWidget);
    });

    testWidgets('no Placeholder text', (tester) async {
      final http = _createHttp();
      final api = AiApi(http);

      await tester.pumpWidget(
        _buildApp(
          overrides: [
            aiSettingsStateProvider
                .overrideWith((ref) => AiSettingsNotifier(api)),
            settingsApiProvider.overrideWithValue(SettingsApi(http)),
            aiApiProvider.overrideWithValue(api),
          ],
        ),
      );
      await tester.pumpAndSettle();

      expect(find.textContaining('Placeholder'), findsNothing);
      expect(find.textContaining('TODO'), findsNothing);
    });
  });
}
