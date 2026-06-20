import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:im_core/core.dart';
import 'package:im_l10n/im_l10n.dart';
import 'package:im_shared_features/settings.dart';
import '../helpers/fakes.dart';

Widget _buildApp({
  required List<Override> overrides,
}) {
  return ProviderScope(
    overrides: overrides,
    child: const MaterialApp(
      locale: Locale('en'),
      localizationsDelegates: AppLocalizations.localizationsDelegates,
      supportedLocales: AppLocalizations.supportedLocales,
      home: AiSettingsPage(),
    ),
  );
}

FakeHttpClientPort _createHttp() {
  return FakeHttpClientPort()..onGet = aiAwareOnGet();
}

void main() {
  group('AiSettingsPage', () {
    testWidgets('renders with title', (tester) async {
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

      expect(find.byType(AiSettingsPage), findsOneWidget);
      expect(find.text('AI Assistant'), findsWidgets);
    });

    testWidgets('shows loading indicator initially', (tester) async {
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

      expect(find.byType(LinearProgressIndicator), findsOneWidget);

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

      expect(find.text('No API keys yet, click to add'), findsOneWidget);
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

      expect(find.text('My OpenAI Key'), findsOneWidget);
      expect(
        find.text('sk-abcdefghijklmnopqrstuvwxyz123456'),
        findsNothing,
      );
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
