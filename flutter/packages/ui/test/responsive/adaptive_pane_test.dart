import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:im_ui/src/layouts/adaptive_pane.dart';
import 'package:im_ui/src/layouts/breakpoint_scope.dart';

Widget _buildTestApp({required double width, required AdaptivePane pane}) {
  return Directionality(
    textDirection: TextDirection.ltr,
    child: MediaQuery(
      data: MediaQueryData(size: Size(width, 800)),
      child: BreakpointScope(child: pane),
    ),
  );
}

void main() {
  group('AdaptivePane', () {
    testWidgets('shows compact widget when width < 600', (tester) async {
      await tester.pumpWidget(_buildTestApp(
        width: 400,
        pane: const AdaptivePane(
          compact: Text('compact'),
          medium: Text('medium'),
          expanded: Text('expanded'),
          large: Text('large'),
        ),
      ));

      expect(find.text('compact'), findsOneWidget);
      expect(find.text('medium'), findsNothing);
    });

    testWidgets('shows medium widget when width 600-899', (tester) async {
      await tester.pumpWidget(_buildTestApp(
        width: 768,
        pane: const AdaptivePane(
          compact: Text('compact'),
          medium: Text('medium'),
          expanded: Text('expanded'),
          large: Text('large'),
        ),
      ));

      expect(find.text('medium'), findsOneWidget);
      expect(find.text('compact'), findsNothing);
    });

    testWidgets('falls back to expanded when medium is null', (tester) async {
      await tester.pumpWidget(_buildTestApp(
        width: 768,
        pane: const AdaptivePane(
          compact: Text('compact'),
          expanded: Text('expanded'),
          large: Text('large'),
        ),
      ));

      expect(find.text('expanded'), findsOneWidget);
    });

    testWidgets('falls back to compact when all others null', (tester) async {
      await tester.pumpWidget(_buildTestApp(
        width: 1920,
        pane: const AdaptivePane(compact: Text('compact')),
      ));

      expect(find.text('compact'), findsOneWidget);
    });

    testWidgets('shows SizedBox.shrink when nothing provided', (tester) async {
      await tester.pumpWidget(_buildTestApp(
        width: 400,
        pane: const AdaptivePane(),
      ));

      expect(find.byType(SizedBox), findsOneWidget);
    });
  });
}
