import 'package:flutter/material.dart';

import '../theme/im_tokens.dart';

enum ImButtonVariant { primary, secondary, danger, ghost, text }

enum ImButtonSize { sm, md, lg }

/// A versatile button component supporting multiple variants and sizes.
class ImButton extends StatelessWidget {
  const ImButton({
    super.key,
    this.variant = ImButtonVariant.primary,
    this.size = ImButtonSize.md,
    this.label,
    this.icon,
    this.onPressed,
    this.loading = false,
    this.fullWidth = false,
  });

  final ImButtonVariant variant;
  final ImButtonSize size;
  final String? label;
  final Widget? icon;
  final VoidCallback? onPressed;
  final bool loading;
  final bool fullWidth;

  bool get _enabled => onPressed != null && !loading;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colors =
        theme.brightness == Brightness.light ? ImColors.light : ImColors.dark;

    final content = loading
        ? SizedBox(
            width: _iconSize,
            height: _iconSize,
            child: CircularProgressIndicator(
              strokeWidth: 2,
              valueColor: AlwaysStoppedAnimation(_loadingColor(colors)),
            ),
          )
        : Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (icon != null) ...[
                icon!,
                SizedBox(width: ImTokens.space2),
              ],
              if (label != null) Text(label!),
            ],
          );

    final button = _buildButton(context, colors, content);

    if (fullWidth) {
      return SizedBox(width: double.infinity, child: button);
    }
    return button;
  }

  Widget _buildButton(BuildContext context, ImColors colors, Widget content) {
    final style = _buttonStyle(colors);

    switch (variant) {
      case ImButtonVariant.primary:
        return ElevatedButton(
          onPressed: _enabled ? onPressed : null,
          style: style,
          child: content,
        );
      case ImButtonVariant.secondary:
        return OutlinedButton(
          onPressed: _enabled ? onPressed : null,
          style: style,
          child: content,
        );
      case ImButtonVariant.danger:
        return ElevatedButton(
          onPressed: _enabled ? onPressed : null,
          style: style,
          child: content,
        );
      case ImButtonVariant.ghost:
        return IconButton(
          onPressed: _enabled ? onPressed : null,
          icon: content,
          style: style,
        );
      case ImButtonVariant.text:
        return TextButton(
          onPressed: _enabled ? onPressed : null,
          style: style,
          child: content,
        );
    }
  }

  ButtonStyle? _buttonStyle(ImColors colors) {
    final padding = EdgeInsets.symmetric(
      horizontal: _horizontalPadding,
      vertical: _verticalPadding,
    );

    return ButtonStyle(
      padding: WidgetStateProperty.all(padding),
      minimumSize: WidgetStateProperty.all(Size(0, _height)),
      textStyle: WidgetStateProperty.all(
        TextStyle(fontSize: _fontSize, fontWeight: FontWeight.w500),
      ),
      shape: WidgetStateProperty.all(
        RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(ImTokens.radiusMd),
        ),
      ),
      backgroundColor: _backgroundColor(colors),
      foregroundColor: WidgetStateProperty.all(_foregroundColor(colors)),
      side: _borderSide(colors),
      elevation: WidgetStateProperty.all(
        variant == ImButtonVariant.danger ? ImTokens.elevationSm : 0,
      ),
    );
  }

  WidgetStateProperty<Color>? _backgroundColor(ImColors colors) {
    switch (variant) {
      case ImButtonVariant.primary:
        return WidgetStateProperty.resolveWith((states) {
          if (states.contains(WidgetState.disabled)) {
            return colors.primary.withAlpha(97);
          }
          return colors.primary;
        });
      case ImButtonVariant.danger:
        return WidgetStateProperty.resolveWith((states) {
          if (states.contains(WidgetState.disabled)) {
            return colors.error.withAlpha(97);
          }
          return colors.error;
        });
      case ImButtonVariant.secondary:
        return WidgetStateProperty.all(Colors.transparent);
      case ImButtonVariant.ghost:
        return WidgetStateProperty.resolveWith((states) {
          if (states.contains(WidgetState.hovered)) {
            return colors.primary.withAlpha(20);
          }
          return Colors.transparent;
        });
      case ImButtonVariant.text:
        return WidgetStateProperty.all(Colors.transparent);
    }
  }

  Color _foregroundColor(ImColors colors) {
    switch (variant) {
      case ImButtonVariant.primary:
      case ImButtonVariant.danger:
        return Colors.white;
      case ImButtonVariant.secondary:
      case ImButtonVariant.ghost:
      case ImButtonVariant.text:
        return colors.primary;
    }
  }

  Color _loadingColor(ImColors colors) {
    switch (variant) {
      case ImButtonVariant.primary:
      case ImButtonVariant.danger:
        return Colors.white;
      case ImButtonVariant.secondary:
      case ImButtonVariant.ghost:
      case ImButtonVariant.text:
        return colors.primary;
    }
  }

  WidgetStateProperty<BorderSide>? _borderSide(ImColors colors) {
    if (variant == ImButtonVariant.secondary) {
      return WidgetStateProperty.resolveWith((states) {
        if (states.contains(WidgetState.disabled)) {
          return BorderSide(color: colors.primary.withAlpha(97));
        }
        return BorderSide(color: colors.primary);
      });
    }
    return null;
  }

  double get _height {
    switch (size) {
      case ImButtonSize.sm:
        return 32;
      case ImButtonSize.md:
        return 40;
      case ImButtonSize.lg:
        return 48;
    }
  }

  double get _horizontalPadding {
    switch (size) {
      case ImButtonSize.sm:
        return ImTokens.space2;
      case ImButtonSize.md:
        return ImTokens.space4;
      case ImButtonSize.lg:
        return ImTokens.space6;
    }
  }

  double get _verticalPadding {
    switch (size) {
      case ImButtonSize.sm:
        return ImTokens.space1;
      case ImButtonSize.md:
        return ImTokens.space2;
      case ImButtonSize.lg:
        return ImTokens.space3;
    }
  }

  double get _fontSize {
    switch (size) {
      case ImButtonSize.sm:
        return ImTokens.textSm;
      case ImButtonSize.md:
        return ImTokens.textBase;
      case ImButtonSize.lg:
        return ImTokens.textLg;
    }
  }

  double get _iconSize {
    switch (size) {
      case ImButtonSize.sm:
        return 14;
      case ImButtonSize.md:
        return 16;
      case ImButtonSize.lg:
        return 20;
    }
  }
}
