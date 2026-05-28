import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:im_ui/src/layouts/breakpoint_scope.dart';
import 'package:im_ui/src/layouts/responsive_scaffold.dart';

List<ResponsiveNavDestination> _testDestinations() => const [
      ResponsiveNavDestination(icon: Icons.chat, label: 'Chat'),
      ResponsiveNavDestination(icon: Icons.settings, label: 'Settings'),
    ];

Widget _buildTestApp({required double width, required Widget child}) {
  return MaterialApp(
    home: MediaQuery(
      data: MediaQueryData(size: Size(width, 800)),
      child: BreakpointScope(child: child),
    ),
  );
}

void main() {
  group('ResponsiveScaffold', () {
    testWidgets('shows NavigationBar on compact', (tester) async {
      await tester.pumpWidget(_buildTestApp(
        width: 400,
        child: ResponsiveScaffold(
          destinations: _testDestinations(),
          selectedIndex: 0,
          onDestinationSelected: (_) {},
          child: const Text('content'),
        ),
      ));

      expect(find.byType(NavigationBar), findsOneWidget);
      expect(find.byType(NavigationRail), findsNothing);
    });

    testWidgets('shows NavigationBar on medium', (tester) async {
      await tester.pumpWidget(_buildTestApp(
        width: 768,
        child: ResponsiveScaffold(
          destinations: _testDestinations(),
          selectedIndex: 0,
          onDestinationSelected: (_) {},
          child: const Text('content'),
        ),
      ));

      expect(find.byType(NavigationBar), findsOneWidget);
      expect(find.byType(NavigationRail), findsNothing);
    });

    testWidgets('shows NavigationRail on expanded', (tester) async {
      await tester.pumpWidget(_buildTestApp(
        width: 1024,
        child: ResponsiveScaffold(
          destinations: _testDestinations(),
          selectedIndex: 0,
          onDestinationSelected: (_) {},
          child: const Text('content'),
        ),
      ));

      expect(find.byType(NavigationRail), findsOneWidget);
      expect(find.byType(NavigationBar), findsNothing);
    });

    testWidgets('shows NavigationRail on large', (tester) async {
      await tester.pumpWidget(_buildTestApp(
        width: 1920,
        child: ResponsiveScaffold(
          destinations: _testDestinations(),
          selectedIndex: 0,
          onDestinationSelected: (_) {},
          child: const Text('content'),
        ),
      ));

      expect(find.byType(NavigationRail), findsOneWidget);
      expect(find.byType(NavigationBar), findsNothing);
    });

    testWidgets('calls onDestinationSelected when tapped', (tester) async {
      int? tapped;

      await tester.pumpWidget(_buildTestApp(
        width: 1920,
        child: ResponsiveScaffold(
          destinations: _testDestinations(),
          selectedIndex: 0,
          onDestinationSelected: (i) => tapped = i,
          child: const Text('content'),
        ),
      ));

      await tester.tap(find.byIcon(Icons.settings));
      expect(tapped, 1);
    });
  });
}
