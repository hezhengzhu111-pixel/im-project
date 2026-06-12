import 'package:flutter_test/flutter_test.dart';
import 'package:im_ui/src/layouts/breakpoint.dart';

void main() {
  group('Breakpoint.fromWidth', () {
    test('returns compact for width < 600', () {
      expect(Breakpoint.fromWidth(0), Breakpoint.compact);
      expect(Breakpoint.fromWidth(320), Breakpoint.compact);
      expect(Breakpoint.fromWidth(599), Breakpoint.compact);
    });

    test('returns medium for width 600-899', () {
      expect(Breakpoint.fromWidth(600), Breakpoint.medium);
      expect(Breakpoint.fromWidth(768), Breakpoint.medium);
      expect(Breakpoint.fromWidth(899), Breakpoint.medium);
    });

    test('returns expanded for width 900-1199', () {
      expect(Breakpoint.fromWidth(900), Breakpoint.expanded);
      expect(Breakpoint.fromWidth(1024), Breakpoint.expanded);
      expect(Breakpoint.fromWidth(1199), Breakpoint.expanded);
    });

    test('returns large for width >= 1200', () {
      expect(Breakpoint.fromWidth(1200), Breakpoint.large);
      expect(Breakpoint.fromWidth(1920), Breakpoint.large);
    });
  });

  group('Breakpoint.value', () {
    test('returns compact value when breakpoint is compact', () {
      expect(
        Breakpoint.compact
            .value(compact: 'a', medium: 'b', expanded: 'c', large: 'd'),
        'a',
      );
    });

    test('falls back to compact when medium is null', () {
      expect(
        Breakpoint.medium.value(compact: 'a'),
        'a',
      );
    });

    test('falls back through chain when values are null', () {
      expect(
        Breakpoint.large.value(compact: 'a'),
        'a',
      );
    });

    test('returns correct value for each breakpoint', () {
      expect(
          Breakpoint.compact
              .value(compact: 1, medium: 2, expanded: 3, large: 4),
          1);
      expect(
          Breakpoint.medium.value(compact: 1, medium: 2, expanded: 3, large: 4),
          2);
      expect(
          Breakpoint.expanded
              .value(compact: 1, medium: 2, expanded: 3, large: 4),
          3);
      expect(
          Breakpoint.large.value(compact: 1, medium: 2, expanded: 3, large: 4),
          4);
    });
  });
}
