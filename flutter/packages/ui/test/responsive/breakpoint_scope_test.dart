import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:im_ui/src/layouts/breakpoint.dart';
import 'package:im_ui/src/layouts/breakpoint_scope.dart';

void main() {
  group('BreakpointScope', () {
    testWidgets('provides compact breakpoint for width < 600', (tester) async {
      late Breakpoint captured;

      await tester.pumpWidget(
        MediaQuery(
          data: const MediaQueryData(size: Size(400, 800)),
          child: BreakpointScope(
            child: Builder(
              builder: (context) {
                captured = BreakpointScope.of(context);
                return const SizedBox();
              },
            ),
          ),
        ),
      );

      expect(captured, Breakpoint.compact);
    });

    testWidgets('provides medium breakpoint for width 600-899', (tester) async {
      late Breakpoint captured;

      await tester.pumpWidget(
        MediaQuery(
          data: const MediaQueryData(size: Size(768, 1024)),
          child: BreakpointScope(
            child: Builder(
              builder: (context) {
                captured = BreakpointScope.of(context);
                return const SizedBox();
              },
            ),
          ),
        ),
      );

      expect(captured, Breakpoint.medium);
    });

    testWidgets('provides expanded breakpoint for width 900-1199', (tester) async {
      late Breakpoint captured;

      await tester.pumpWidget(
        MediaQuery(
          data: const MediaQueryData(size: Size(1024, 768)),
          child: BreakpointScope(
            child: Builder(
              builder: (context) {
                captured = BreakpointScope.of(context);
                return const SizedBox();
              },
            ),
          ),
        ),
      );

      expect(captured, Breakpoint.expanded);
    });

    testWidgets('provides large breakpoint for width >= 1200', (tester) async {
      late Breakpoint captured;

      await tester.pumpWidget(
        MediaQuery(
          data: const MediaQueryData(size: Size(1920, 1080)),
          child: BreakpointScope(
            child: Builder(
              builder: (context) {
                captured = BreakpointScope.of(context);
                return const SizedBox();
              },
            ),
          ),
        ),
      );

      expect(captured, Breakpoint.large);
    });

    testWidgets('defaults to compact when no BreakpointScope ancestor', (tester) async {
      late Breakpoint captured;

      await tester.pumpWidget(
        Builder(
          builder: (context) {
            captured = BreakpointScope.of(context);
            return const SizedBox();
          },
        ),
      );

      expect(captured, Breakpoint.compact);
    });
  });
}
