import 'package:flutter/material.dart';
import 'package:im_web/core/theme/glass_theme.dart';

class GradientButton extends StatefulWidget {
  final String text;
  final VoidCallback onPressed;
  final bool isLoading;

  const GradientButton({
    super.key,
    required this.text,
    required this.onPressed,
    this.isLoading = false,
  });

  @override
  State<GradientButton> createState() => _GradientButtonState();
}

class _GradientButtonState extends State<GradientButton> {
  bool _isHovered = false;

  // 品牌紫到青的渐变 — 与背景渐变色系呼应
  static const _brandGradient = LinearGradient(
    colors: [Color(0xFF6B48FF), Color(0xFF00BFA6)],
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
  );

  @override
  Widget build(BuildContext context) {
    final glass = Theme.of(context).extension<GlassTheme>()!;

    return MouseRegion(
      onEnter: (_) => setState(() => _isHovered = true),
      onExit: (_) => setState(() => _isHovered = false),
      child: AnimatedContainer(
        duration: glass.animationDuration,
        transform: _isHovered
            ? (Matrix4.identity()..translate(0.0, -2.0))
            : Matrix4.identity(),
        child: Container(
          decoration: BoxDecoration(
            gradient: _brandGradient,
            borderRadius: BorderRadius.circular(glass.controlRadius),
            boxShadow: _isHovered
                ? [
                    const BoxShadow(
                      color: Color(0x666B48FF), // 0.4 alpha
                      blurRadius: 20,
                      offset: Offset(0, 6),
                    ),
                  ]
                : [
                    const BoxShadow(
                      color: Color(0x336B48FF), // 0.2 alpha
                      blurRadius: 12,
                      offset: Offset(0, 4),
                    ),
                  ],
          ),
          child: ElevatedButton(
            onPressed: widget.isLoading ? null : widget.onPressed,
            style: ElevatedButton.styleFrom(
              backgroundColor: Colors.transparent,
              shadowColor: Colors.transparent,
              foregroundColor: Colors.white,
              disabledBackgroundColor: Colors.transparent,
              disabledForegroundColor: Colors.white70,
              padding: const EdgeInsets.symmetric(
                horizontal: 24,
                vertical: 16,
              ),
              textStyle: const TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.w600,
                letterSpacing: 0.5,
              ),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(glass.controlRadius),
              ),
            ),
            child: widget.isLoading
                ? const SizedBox(
                    width: 20,
                    height: 20,
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      color: Colors.white,
                    ),
                  )
                : Text(widget.text),
          ),
        ),
      ),
    );
  }
}
