import 'package:flutter/material.dart';
import '../theme/im_tokens.dart';

/// 四色渐变主按钮
///
/// 用于所有主要操作（保存、确认、退出登录等）。
/// 渐变色：#667eea → #764BA2 → #23a6d5 → #23d5ab
class GradientButton extends StatelessWidget {
  const GradientButton({
    super.key,
    required this.onPressed,
    required this.child,
    this.width,
    this.height = 48,
    this.borderRadius,
    this.enabled = true,
  });

  final VoidCallback? onPressed;
  final Widget child;
  final double? width;
  final double height;
  final double? borderRadius;
  final bool enabled;

  @override
  Widget build(BuildContext context) {
    final radius = borderRadius ?? ImTokens.radiusLg;

    return Opacity(
      opacity: enabled ? 1.0 : 0.5,
      child: Container(
        width: width,
        height: height,
        decoration: BoxDecoration(
          gradient: enabled ? ImTokens.brandGradient : null,
          color: enabled ? null : Colors.grey.shade300,
          borderRadius: BorderRadius.circular(radius),
        ),
        child: ElevatedButton(
          onPressed: enabled ? onPressed : null,
          style: ElevatedButton.styleFrom(
            backgroundColor: Colors.transparent,
            shadowColor: Colors.transparent,
            foregroundColor: Colors.white,
            disabledBackgroundColor: Colors.transparent,
            disabledForegroundColor: Colors.white70,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(radius),
            ),
            textStyle: const TextStyle(
              fontWeight: FontWeight.bold,
              fontSize: 16,
            ),
          ),
          child: child,
        ),
      ),
    );
  }
}

/// 渐变文字按钮（无背景，文字带渐变色）
class GradientTextButton extends StatelessWidget {
  const GradientTextButton({
    super.key,
    required this.onPressed,
    required this.child,
  });

  final VoidCallback? onPressed;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return TextButton(
      onPressed: onPressed,
      style: TextButton.styleFrom(
        foregroundColor: ImTokens.brandPurple,
      ),
      child: child,
    );
  }
}
