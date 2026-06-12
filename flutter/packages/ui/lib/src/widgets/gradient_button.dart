import 'package:flutter/material.dart';

import '../theme/im_tokens.dart';

class GradientButton extends StatelessWidget {
  const GradientButton({
    required this.onPressed,
    required this.child,
    this.width,
    this.height = 48,
    this.borderRadius,
    this.enabled = true,
    super.key,
  });

  final VoidCallback? onPressed;
  final Widget child;
  final double? width;
  final double height;
  final double? borderRadius;
  final bool enabled;

  @override
  Widget build(BuildContext context) {
    final radius = borderRadius ?? ImTokens.radiusSm;

    return Opacity(
      opacity: enabled ? 1.0 : 0.5,
      child: Container(
        width: width,
        height: height,
        decoration: BoxDecoration(
          color: enabled ? ImTokens.wechatGreen : Colors.grey.shade300,
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
              fontWeight: FontWeight.w600,
              fontSize: 16,
            ),
          ),
          child: child,
        ),
      ),
    );
  }
}

class GradientTextButton extends StatelessWidget {
  const GradientTextButton({
    required this.onPressed,
    required this.child,
    super.key,
  });

  final VoidCallback? onPressed;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return TextButton(
      onPressed: onPressed,
      style: TextButton.styleFrom(
        foregroundColor: ImTokens.wechatGreen,
      ),
      child: child,
    );
  }
}
