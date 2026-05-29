import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

import 'im_tokens.dart';

/// Builds Material 3 [ThemeData] from [ImTokens].
class ImTheme {
  ImTheme._();

  /// When set to `false`, skips Google Fonts loading and uses the default
  /// platform text theme. Useful for unit/widget tests that do not need
  /// real font assets.
  static bool enableGoogleFonts = true;

  static ThemeData light() => _build(Brightness.light);
  static ThemeData dark() => _build(Brightness.dark);

  static ThemeData _build(Brightness brightness) {
    final isLight = brightness == Brightness.light;
    final colors = isLight ? ImColors.light : ImColors.dark;
    final colorScheme = ColorScheme.fromSeed(
      seedColor: colors.primary,
      brightness: brightness,
    );

    final baseTextTheme = isLight
        ? ThemeData.light().textTheme
        : ThemeData.dark().textTheme;
    final textTheme = enableGoogleFonts
        ? GoogleFonts.notoSansScTextTheme(baseTextTheme)
        : baseTextTheme;

    return ThemeData(
      useMaterial3: true,
      brightness: brightness,
      colorScheme: colorScheme,
      textTheme: textTheme,
      scaffoldBackgroundColor: colors.background,
      appBarTheme: AppBarTheme(
        elevation: ImTokens.elevationNone,
        centerTitle: false,
        backgroundColor: colors.surface,
        foregroundColor: colors.textPrimary,
        surfaceTintColor: Colors.transparent,
      ),
      cardTheme: CardThemeData(
        elevation: 0,
        color: colors.surface,
        margin: EdgeInsets.zero,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(ImTokens.radiusXl),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: colors.surfaceVariant,
        contentPadding: const EdgeInsets.symmetric(horizontal: ImTokens.space4, vertical: ImTokens.space3),
        border: OutlineInputBorder(
          borderSide: BorderSide.none,
          borderRadius: BorderRadius.circular(ImTokens.radiusLg),
        ),
        enabledBorder: OutlineInputBorder(
          borderSide: BorderSide.none,
          borderRadius: BorderRadius.circular(ImTokens.radiusLg),
        ),
        focusedBorder: OutlineInputBorder(
          borderSide: BorderSide(color: colors.borderFocus, width: 2),
          borderRadius: BorderRadius.circular(ImTokens.radiusLg),
        ),
        hintStyle: TextStyle(color: colors.textSecondary),
        errorBorder: OutlineInputBorder(
          borderSide: BorderSide(color: colors.error, width: 1),
          borderRadius: BorderRadius.circular(ImTokens.radiusLg),
        ),
        focusedErrorBorder: OutlineInputBorder(
          borderSide: BorderSide(color: colors.error, width: 2),
          borderRadius: BorderRadius.circular(ImTokens.radiusLg),
        ),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: colors.primary,
          foregroundColor: colors.textPrimary,
          elevation: 0,
          shadowColor: Colors.transparent,
          padding: const EdgeInsets.symmetric(
            horizontal: ImTokens.space6,
            vertical: ImTokens.space3,
          ),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(ImTokens.radiusLg),
          ),
          textStyle: const TextStyle(fontWeight: FontWeight.bold),
        ),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          backgroundColor: colors.primary,
          foregroundColor: colors.textPrimary,
          padding: EdgeInsets.symmetric(
            horizontal: ImTokens.space6,
            vertical: ImTokens.space3,
          ),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(ImTokens.radiusMd),
          ),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: colors.primary,
          side: BorderSide(color: colors.primary),
          padding: EdgeInsets.symmetric(
            horizontal: ImTokens.space6,
            vertical: ImTokens.space3,
          ),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(ImTokens.radiusMd),
          ),
        ),
      ),
      dialogTheme: DialogThemeData(
        elevation: ImTokens.elevationLg,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(ImTokens.radiusXl),
        ),
      ),
      snackBarTheme: SnackBarThemeData(
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(ImTokens.radiusMd),
        ),
      ),
      dividerTheme: DividerThemeData(
        color: colors.border,
        thickness: 1,
        space: 1,
      ),
      tabBarTheme: TabBarThemeData(
        labelColor: colors.primary,
        unselectedLabelColor: colors.textSecondary,
        indicatorSize: TabBarIndicatorSize.label,
        indicator: UnderlineTabIndicator(
          borderSide: BorderSide(color: colors.primary, width: 2),
        ),
        labelStyle: const TextStyle(fontWeight: FontWeight.w600),
      ),
      listTileTheme: ListTileThemeData(
        contentPadding: const EdgeInsets.symmetric(horizontal: ImTokens.space4, vertical: ImTokens.space1),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(ImTokens.radiusMd),
        ),
      ),
      navigationRailTheme: NavigationRailThemeData(
        backgroundColor: colors.surface,
        indicatorColor: Colors.transparent,
        selectedIconTheme: IconThemeData(
          color: colors.primary,
          size: 24,
        ),
        unselectedIconTheme: IconThemeData(
          color: colors.textSecondary,
          size: 24,
        ),
        selectedLabelTextStyle: TextStyle(
          fontSize: ImTokens.textSm,
          fontWeight: FontWeight.w600,
          color: colors.primary,
        ),
        unselectedLabelTextStyle: TextStyle(
          fontSize: ImTokens.textSm,
          color: colors.textSecondary,
        ),
      ),
    );
  }
}
