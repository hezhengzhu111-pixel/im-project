import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:im_core/core.dart';
import 'package:im_web/features/auth/presentation/auth_provider.dart';
import 'package:im_web/features/auth/presentation/auth_providers.dart';
import 'package:im_web/features/auth/presentation/login_page.dart';
import 'package:im_web/l10n/app_localizations.dart';

import '../../../helpers/fakes.dart';

void main() {
  late FakeAuthRepository mockRepo;
  late FakeWsClientPort mockWsClient;
  late FakeHttpClientPort mockHttpClient;

  setUp(() {
    mockRepo = FakeAuthRepository();
    mockWsClient = FakeWsClientPort();
    mockHttpClient = FakeHttpClientPort();
  });

  Widget buildTestWidget({bool showLogin = true}) {
    return ProviderScope(
      overrides: [
        authStateProvider.overrideWith((ref) {
          return AuthNotifier(
            mockRepo,
            mockWsClient,
            mockHttpClient,
            NoopAnalyticsPort(),
          );
        }),
      ],
      child: MaterialApp(
        locale: const Locale('en'),
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        supportedLocales: AppLocalizations.supportedLocales,
        home: showLogin ? const LoginPage() : const _FallbackPage(),
      ),
    );
  }

  group('LoginPage lifecycle', () {
    testWidgets('field values survive rebuild', (tester) async {
      await tester.pumpWidget(buildTestWidget());
      await tester.pumpAndSettle();

      // ValidatedFormField renders TextFormField with labelText in decoration.
      final usernameField = find.byType(TextFormField).first;
      await tester.enterText(usernameField, 'testuser');
      await tester.pump();

      // Trigger rebuild by toggling the rememberMe checkbox
      final checkbox = find.byType(Checkbox);
      await tester.tap(checkbox);
      await tester.pump();

      // The text should still be visible in the field after rebuild.
      // ValidatedFormField uses initialValue, not an explicit controller,
      // so we verify the text is present in the rendered widget.
      expect(find.text('testuser'), findsOneWidget);
    });

    testWidgets('dispose does not throw LateInitializationError',
        (tester) async {
      final key = GlobalKey<_WrapperState>();
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            authStateProvider.overrideWith((ref) {
              return AuthNotifier(
                mockRepo,
                mockWsClient,
                mockHttpClient,
                NoopAnalyticsPort(),
              );
            }),
          ],
          child: MaterialApp(
            localizationsDelegates: AppLocalizations.localizationsDelegates,
            supportedLocales: AppLocalizations.supportedLocales,
            home: _Wrapper(key: key),
          ),
        ),
      );
      await tester.pumpAndSettle();

      // LoginPage is mounted; now remove it -- should not throw
      key.currentState!.showLogin = false;
      await tester.pump();
      await tester.pumpAndSettle();
    });

    testWidgets('auth error shows FormErrorBanner', (tester) async {
      await tester.pumpWidget(buildTestWidget());
      await tester.pumpAndSettle();

      // Configure login to fail with a 401 error
      mockRepo.loginError = Exception('HTTP 401 Unauthorized');

      // Enter valid credentials
      final usernameField = find.byType(TextFormField).first;
      final passwordField = find.byType(TextFormField).last;
      await tester.enterText(usernameField, 'testuser');
      await tester.enterText(passwordField, 'password123');

      // Tap the login button (GradientButton wraps an ElevatedButton)
      final loginButton = find.widgetWithText(ElevatedButton, 'Login');
      await tester.tap(loginButton);
      await tester.pumpAndSettle();

      // The FormErrorBanner should display the localized error message
      expect(find.text('Invalid username or password.'), findsOneWidget);
    });
  });
}

/// Fallback page shown when LoginPage is removed during dispose test.
class _FallbackPage extends StatelessWidget {
  const _FallbackPage();
  @override
  Widget build(BuildContext context) {
    return const Scaffold(body: Center(child: Text('fallback')));
  }
}

/// Minimal wrapper that can conditionally show [LoginPage].
class _Wrapper extends StatefulWidget {
  const _Wrapper({super.key});
  @override
  State<_Wrapper> createState() => _WrapperState();
}

class _WrapperState extends State<_Wrapper> {
  bool showLogin = true;

  @override
  Widget build(BuildContext context) {
    return showLogin ? const LoginPage() : const _FallbackPage();
  }
}
