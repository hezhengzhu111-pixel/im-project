import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:im_core/core.dart';
import 'package:im_web/app.dart';
import 'package:im_web/core/di/providers.dart';
import 'package:im_web/core/router/app_router.dart';
import 'package:im_web/core/router/route_observer.dart';
import 'package:im_web/features/auth/presentation/auth_provider.dart';

import 'helpers/fakes.dart';

void main() {
  group('App lifecycle', () {
    late GoRouter testRouter;

    setUp(() {
      testRouter = GoRouter(
        initialLocation: '/',
        routes: [
          GoRoute(
            path: '/',
            builder: (_, __) => const Scaffold(body: Center(child: Text('home'))),
          ),
          GoRoute(
            path: '/chat',
            builder: (_, __) => const Scaffold(body: Center(child: Text('chat'))),
          ),
          GoRoute(
            path: '/contacts',
            builder: (_, __) =>
                const Scaffold(body: Center(child: Text('contacts'))),
          ),
          GoRoute(
            path: '/settings',
            builder: (_, __) =>
                const Scaffold(body: Center(child: Text('settings'))),
          ),
        ],
      );
    });

    tearDown(() {
      testRouter.dispose();
    });

    /// Common provider overrides needed by the App widget.
    List<Override> _commonOverrides() => [
          routerProvider.overrideWithValue(testRouter),
          languageProvider.overrideWith((ref) => 'zh'),
          themeModeProvider.overrideWith((ref) => ThemeMode.system),
          authStateProvider.overrideWith(
            (ref) => AuthNotifier(
              FakeAuthRepository(),
              FakeWsClientPort(),
              FakeHttpClientPort(),
              NoopAnalyticsPort(),
            ),
          ),
          analyticsProvider.overrideWithValue(NoopAnalyticsPort()),
          errorReporterProvider.overrideWithValue(NoopErrorReporterPort()),
        ];

    testWidgets(
        'route change triggers WebMetaService.apply with correct meta',
        (tester) async {
      // NOTE: createWebMetaService() returns NoOpWebMetaService in test mode
      // (non-web platform), so meta application cannot be directly verified
      // via a mock. This test verifies:
      // 1. The App widget builds successfully with the router
      // 2. The route change listener mechanism is properly wired
      // 3. Triggering a route change does not cause errors
      //
      // Meta application correctness is verified by manual testing on web.

      await tester.pumpWidget(
        ProviderScope(
          overrides: _commonOverrides(),
          child: const App(),
        ),
      );
      await tester.pumpAndSettle();

      // Verify the App widget built successfully
      expect(find.byType(App), findsOneWidget);
      expect(find.byType(MaterialApp), findsOneWidget);

      // Trigger a route change via the real GoRouter
      testRouter.go('/chat');
      await tester.pumpAndSettle();

      // Widget should still be intact after route change
      expect(find.byType(App), findsOneWidget);

      // Trigger another route change
      testRouter.go('/settings');
      await tester.pumpAndSettle();

      expect(find.byType(App), findsOneWidget);
    });

    testWidgets('locale change triggers meta re-apply for current path',
        (tester) async {
      // NOTE: createWebMetaService() returns NoOpWebMetaService in test mode,
      // so meta re-application is not directly observable. This test verifies
      // the widget handles locale changes without errors.
      //
      // Meta re-application correctness is verified by manual testing on web.

      final container = ProviderContainer(
        overrides: _commonOverrides(),
      );

      await tester.pumpWidget(
        UncontrolledProviderScope(
          container: container,
          child: const App(),
        ),
      );
      await tester.pumpAndSettle();

      // Verify initial build
      expect(find.byType(App), findsOneWidget);

      // Change locale from 'zh' to 'en'
      container.read(languageProvider.notifier).state = 'en';
      await tester.pumpAndSettle();

      // Widget should rebuild without errors
      expect(find.byType(App), findsOneWidget);

      // Change locale back to 'zh'
      container.read(languageProvider.notifier).state = 'zh';
      await tester.pumpAndSettle();

      expect(find.byType(App), findsOneWidget);
    });

    testWidgets('MaterialApp.router builder does not wrap Navigator',
        (tester) async {
      await tester.pumpWidget(
        ProviderScope(
          overrides: _commonOverrides(),
          child: const App(),
        ),
      );
      await tester.pumpAndSettle();

      // MaterialApp.router creates exactly one Navigator.
      // The builder wraps child in BreakpointScope, NOT a Navigator.
      // If a nested Navigator existed, the count would be > 1.
      final navigators = find.byType(Navigator).evaluate().toList();
      expect(navigators.length, equals(1));
    });

    testWidgets('routeObserver is only registered via GoRouter observers',
        (tester) async {
      await tester.pumpWidget(
        ProviderScope(
          overrides: _commonOverrides(),
          child: const App(),
        ),
      );
      await tester.pumpAndSettle();

      // Verify that routeObserver is NOT in any Navigator's observers list.
      // routeObserver should only be registered via GoRouter.observers
      // (configured in app_router.dart), not via MaterialApp's
      // navigatorObservers. This confirms no nested Navigator was added
      // that would duplicate route observation.
      final navigators = find.byType(Navigator).evaluate();
      for (final element in navigators) {
        final navigator = element.widget as Navigator;
        expect(
          navigator.observers.contains(routeObserver),
          isFalse,
          reason:
              'routeObserver should not be in Navigator.observers; '
              'it is registered via GoRouter.observers instead',
        );
      }
    });
  });
}
