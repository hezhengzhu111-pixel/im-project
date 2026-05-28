import 'package:flutter_test/flutter_test.dart';
import 'package:im_ui/ui.dart';

void main() {
  group('ImTokens', () {
    test('spacing values are monotonically increasing', () {
      final spacings = [
        ImTokens.space0,
        ImTokens.space1,
        ImTokens.space2,
        ImTokens.space3,
        ImTokens.space4,
        ImTokens.space5,
        ImTokens.space6,
        ImTokens.space8,
        ImTokens.space10,
        ImTokens.space12,
      ];
      for (var i = 1; i < spacings.length; i++) {
        expect(spacings[i], greaterThan(spacings[i - 1]),
            reason: 'space[$i] should be > space[${i - 1}]');
      }
    });

    test('radius values are positive and reasonable', () {
      expect(ImTokens.radiusNone, 0);
      expect(ImTokens.radiusSm, greaterThan(0));
      expect(ImTokens.radiusMd, greaterThan(ImTokens.radiusSm));
      expect(ImTokens.radiusLg, greaterThan(ImTokens.radiusMd));
      expect(ImTokens.radiusXl, greaterThan(ImTokens.radiusLg));
      expect(ImTokens.radiusFull, greaterThan(ImTokens.radiusXl));
    });

    test('breakpoints are monotonically increasing', () {
      expect(ImTokens.breakpointMobile, lessThan(ImTokens.breakpointTablet));
      expect(ImTokens.breakpointTablet, lessThan(ImTokens.breakpointDesktop));
    });
  });

  group('ImColors', () {
    test('light and dark have different backgrounds', () {
      expect(ImColors.light.background, isNot(ImColors.dark.background));
    });

    test('semantic colors are defined in both modes', () {
      expect(ImColors.light.primary, isNotNull);
      expect(ImColors.dark.primary, isNotNull);
      expect(ImColors.light.error, isNotNull);
      expect(ImColors.dark.error, isNotNull);
    });
  });

  group('ImComponentTokens', () {
    test('button tokens reference valid colors', () {
      expect(ImComponentTokens.buttonPrimaryBg, isNotNull);
      expect(ImComponentTokens.buttonPrimaryText, isNotNull);
    });

    test('input tokens reference valid colors', () {
      expect(ImComponentTokens.inputBorder, isNotNull);
      expect(ImComponentTokens.inputBorderFocus, isNotNull);
    });
  });
}
