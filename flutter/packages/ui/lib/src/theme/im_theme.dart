import 'package:flutter/material.dart';

import 'glass_theme.dart';
import 'im_tokens.dart';

/// Builds Material 3 [ThemeData] from [ImTokens].
class ImTheme {
  ImTheme._();

  static ThemeData light() => _build(Brightness.light);
  static ThemeData dark() => _build(Brightness.dark);

  static ThemeData _build(Brightness brightness) {
    final isLight = brightness == Brightness.light;
    final colors = isLight ? ImColors.light : ImColors.dark;
    final colorScheme = ColorScheme.fromSeed(
      seedColor: colors.primary,
      brightness: brightness,
    ).copyWith(
      primary: colors.primary,
      secondary: colors.secondary,
      error: colors.error,
      onPrimary: Colors.white,
      onSecondary: Colors.white,
      onSurface: colors.textPrimary,
      onSurfaceVariant: colors.textSecondary,
      surface: colors.surface,
      surfaceContainerHighest: colors.surfaceVariant,
      outline: colors.border,
      outlineVariant: colors.border,
    );

    final baseTextTheme =
        isLight ? ThemeData.light().textTheme : ThemeData.dark().textTheme;
    final textTheme = baseTextTheme.apply(
      bodyColor: colors.textPrimary,
      displayColor: colors.textPrimary,
    );

    return ThemeData(
      useMaterial3: true,
      brightness: brightness,
      colorScheme: colorScheme,
      textTheme: textTheme,
      scaffoldBackgroundColor: colors.background,
      splashColor: colors.primary.withValues(alpha: 0.08),
      highlightColor: colors.primary.withValues(alpha: 0.04),
      hoverColor: isLight ? ImTokens.wechatHoverBg : colors.surfaceVariant,
      appBarTheme: AppBarTheme(
        elevation: ImTokens.elevationNone,
        centerTitle: false,
        backgroundColor: colors.surface,
        foregroundColor: colors.textPrimary,
        surfaceTintColor: Colors.transparent,
        titleTextStyle: textTheme.titleMedium?.copyWith(
          color: colors.textPrimary,
          fontWeight: FontWeight.w600,
        ),
      ),
      cardTheme: CardThemeData(
        elevation: 0,
        color: colors.surface,
        margin: EdgeInsets.zero,
        surfaceTintColor: Colors.transparent,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(ImTokens.radiusSm),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: colors.surfaceVariant,
        contentPadding: const EdgeInsets.symmetric(
            horizontal: ImTokens.space3, vertical: ImTokens.space3),
        border: OutlineInputBorder(
          borderSide: BorderSide.none,
          borderRadius: BorderRadius.circular(ImTokens.radiusSm),
        ),
        enabledBorder: OutlineInputBorder(
          borderSide: BorderSide.none,
          borderRadius: BorderRadius.circular(ImTokens.radiusSm),
        ),
        focusedBorder: OutlineInputBorder(
          borderSide: BorderSide(color: colors.primary, width: 1),
          borderRadius: BorderRadius.circular(ImTokens.radiusSm),
        ),
        hintStyle: TextStyle(color: colors.textSecondary),
        errorBorder: OutlineInputBorder(
          borderSide: BorderSide(color: colors.error, width: 1),
          borderRadius: BorderRadius.circular(ImTokens.radiusSm),
        ),
        focusedErrorBorder: OutlineInputBorder(
          borderSide: BorderSide(color: colors.error, width: 2),
          borderRadius: BorderRadius.circular(ImTokens.radiusSm),
        ),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: colors.primary,
          foregroundColor: Colors.white,
          elevation: 0,
          shadowColor: Colors.transparent,
          padding: const EdgeInsets.symmetric(
            horizontal: ImTokens.space6,
            vertical: ImTokens.space3,
          ),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(ImTokens.radiusSm),
          ),
          textStyle: const TextStyle(fontWeight: FontWeight.w600),
        ).copyWith(
          overlayColor: WidgetStateProperty.all(
            ImTokens.wechatGreenPressed.withValues(alpha: 0.14),
          ),
        ),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          backgroundColor: colors.primary,
          foregroundColor: Colors.white,
          padding: EdgeInsets.symmetric(
            horizontal: ImTokens.space6,
            vertical: ImTokens.space3,
          ),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(ImTokens.radiusSm),
          ),
        ).copyWith(
          overlayColor: WidgetStateProperty.all(
            ImTokens.wechatGreenPressed.withValues(alpha: 0.16),
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
            borderRadius: BorderRadius.circular(ImTokens.radiusSm),
          ),
        ),
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(
          foregroundColor: colors.primary,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(ImTokens.radiusSm),
          ),
        ),
      ),
      iconButtonTheme: IconButtonThemeData(
        style: ButtonStyle(
          foregroundColor: WidgetStateProperty.resolveWith((states) {
            if (states.contains(WidgetState.disabled)) {
              return colors.textDisabled;
            }
            if (states.contains(WidgetState.hovered) ||
                states.contains(WidgetState.pressed) ||
                states.contains(WidgetState.selected)) {
              return colors.primary;
            }
            return isLight ? ImTokens.wechatIcon : colors.textSecondary;
          }),
          backgroundColor: WidgetStateProperty.resolveWith((states) {
            if (states.contains(WidgetState.hovered)) {
              return isLight ? ImTokens.wechatHoverBg : colors.surfaceVariant;
            }
            return Colors.transparent;
          }),
          overlayColor: WidgetStateProperty.all(
            colors.primary.withValues(alpha: 0.08),
          ),
          shape: WidgetStateProperty.all(
            RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(ImTokens.radiusSm),
            ),
          ),
          minimumSize: WidgetStateProperty.all(const Size(36, 36)),
          iconSize: WidgetStateProperty.all(22),
        ),
      ),
      dialogTheme: DialogThemeData(
        elevation: ImTokens.elevationMd,
        backgroundColor: colors.surface,
        surfaceTintColor: Colors.transparent,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(ImTokens.radiusSm),
        ),
      ),
      snackBarTheme: SnackBarThemeData(
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(ImTokens.radiusSm),
        ),
      ),
      dividerTheme: DividerThemeData(
        color: colors.border,
        thickness: 1,
        space: 1,
      ),
      navigationBarTheme: NavigationBarThemeData(
        backgroundColor: colors.surface,
        indicatorColor: Colors.transparent,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        height: 56,
        labelTextStyle: WidgetStateProperty.resolveWith((states) {
          final selected = states.contains(WidgetState.selected);
          return TextStyle(
            color: selected ? colors.primary : colors.textSecondary,
            fontSize: ImTokens.textXs,
            fontWeight: FontWeight.w400,
          );
        }),
        iconTheme: WidgetStateProperty.resolveWith((states) {
          final selected = states.contains(WidgetState.selected);
          return IconThemeData(
            color: selected ? colors.primary : colors.textSecondary,
            size: 23,
          );
        }),
      ),
      tabBarTheme: TabBarThemeData(
        labelColor: colors.primary,
        unselectedLabelColor: colors.textSecondary,
        indicatorSize: TabBarIndicatorSize.label,
        indicator: UnderlineTabIndicator(
          borderSide: BorderSide(color: colors.primary, width: 2),
        ),
        labelStyle: const TextStyle(
          fontSize: ImTokens.textSm,
          fontWeight: FontWeight.w600,
        ),
        unselectedLabelStyle: const TextStyle(fontSize: ImTokens.textSm),
      ),
      listTileTheme: ListTileThemeData(
        contentPadding: const EdgeInsets.symmetric(
            horizontal: ImTokens.space4, vertical: ImTokens.space1),
        shape: const RoundedRectangleBorder(),
        tileColor: colors.surface,
        selectedTileColor: isLight ? ImTokens.wechatSelectedBg : null,
        iconColor: isLight ? ImTokens.wechatIcon : colors.textSecondary,
        textColor: colors.textPrimary,
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
      extensions: [isLight ? GlassTheme.light : GlassTheme.dark],
    );
  }
}
