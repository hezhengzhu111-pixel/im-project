import 'dart:ui';

import 'package:flutter/material.dart';

import '../theme/im_tokens.dart';
import 'gradient_background.dart';

const Color imGlassBrand = Color(0xFF7B4FD1);
const Color imGlassBrandHover = Color(0xFF6F43C4);

class AppGradientBackground extends StatelessWidget {
  const AppGradientBackground({
    required this.child,
    this.animated = true,
    super.key,
  });

  final Widget child;
  final bool animated;

  @override
  Widget build(BuildContext context) {
    return GradientBackground(
      colors: const [
        Color(0xFF6679E7),
        Color(0xFF744FB5),
        Color(0xFF23A8C8),
        Color(0xFF10CF9A),
      ],
      animated: animated,
      child: child,
    );
  }
}

class GlassPanel extends StatelessWidget {
  const GlassPanel({
    required this.child,
    this.padding,
    this.margin,
    this.borderRadius = 26,
    this.backgroundColor,
    this.clipBehavior = Clip.antiAlias,
    super.key,
  });

  final Widget child;
  final EdgeInsetsGeometry? padding;
  final EdgeInsetsGeometry? margin;
  final double borderRadius;
  final Color? backgroundColor;
  final Clip clipBehavior;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: margin,
      clipBehavior: clipBehavior,
      decoration: BoxDecoration(
        color: backgroundColor ?? Colors.white.withValues(alpha: 0.48),
        borderRadius: BorderRadius.circular(borderRadius),
        border: Border.all(color: Colors.white.withValues(alpha: 0.38)),
        boxShadow: [
          BoxShadow(
            color: const Color(0xFF191C40).withValues(alpha: 0.08),
            blurRadius: 36,
            offset: const Offset(0, 14),
          ),
        ],
      ),
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: 24, sigmaY: 24),
        child: Padding(
          padding: padding ?? EdgeInsets.zero,
          child: child,
        ),
      ),
    );
  }
}

class HoverLiftCard extends StatefulWidget {
  const HoverLiftCard({
    required this.child,
    this.onTap,
    this.padding = const EdgeInsets.all(ImTokens.space4),
    this.borderRadius = 18,
    super.key,
  });

  final Widget child;
  final VoidCallback? onTap;
  final EdgeInsetsGeometry padding;
  final double borderRadius;

  @override
  State<HoverLiftCard> createState() => _HoverLiftCardState();
}

class _HoverLiftCardState extends State<HoverLiftCard> {
  bool _hovered = false;

  @override
  Widget build(BuildContext context) {
    final card = MouseRegion(
      onEnter: (_) => setState(() => _hovered = true),
      onExit: (_) => setState(() => _hovered = false),
      child: AnimatedContainer(
        duration: ImTokens.animNormal,
        curve: Curves.easeOut,
        transform: Matrix4.translationValues(0, _hovered ? -4 : 0, 0),
        padding: widget.padding,
        decoration: BoxDecoration(
          color: Colors.white.withValues(alpha: _hovered ? 0.70 : 0.50),
          borderRadius: BorderRadius.circular(widget.borderRadius),
          border: Border.all(color: Colors.white.withValues(alpha: 0.36)),
          boxShadow: [
            BoxShadow(
              color: const Color(0xFF191C40)
                  .withValues(alpha: _hovered ? 0.18 : 0.08),
              blurRadius: _hovered ? 34 : 20,
              offset: Offset(0, _hovered ? 16 : 8),
            ),
          ],
        ),
        child: widget.child,
      ),
    );

    if (widget.onTap == null) return card;
    return GestureDetector(onTap: widget.onTap, child: card);
  }
}

class PrimarySolidButton extends StatefulWidget {
  const PrimarySolidButton({
    required this.label,
    required this.onPressed,
    this.icon,
    this.isLoading = false,
    this.compact = false,
    super.key,
  });

  final String label;
  final VoidCallback? onPressed;
  final IconData? icon;
  final bool isLoading;
  final bool compact;

  @override
  State<PrimarySolidButton> createState() => _PrimarySolidButtonState();
}

class _PrimarySolidButtonState extends State<PrimarySolidButton> {
  bool _hovered = false;

  @override
  Widget build(BuildContext context) {
    final enabled = widget.onPressed != null && !widget.isLoading;
    return MouseRegion(
      onEnter: (_) => setState(() => _hovered = true),
      onExit: (_) => setState(() => _hovered = false),
      child: AnimatedContainer(
        duration: ImTokens.animFast,
        transform:
            Matrix4.translationValues(0, enabled && _hovered ? -2 : 0, 0),
        decoration: BoxDecoration(
          color: enabled
              ? (_hovered ? imGlassBrandHover : imGlassBrand)
              : imGlassBrand.withValues(alpha: 0.38),
          borderRadius: BorderRadius.circular(999),
          boxShadow: enabled
              ? [
                  BoxShadow(
                    color:
                        imGlassBrand.withValues(alpha: _hovered ? 0.32 : 0.22),
                    blurRadius: _hovered ? 30 : 22,
                    offset: const Offset(0, 12),
                  ),
                ]
              : null,
        ),
        child: Material(
          color: Colors.transparent,
          child: InkWell(
            borderRadius: BorderRadius.circular(999),
            onTap: enabled ? widget.onPressed : null,
            child: SizedBox(
              height: widget.compact ? 34 : 42,
              child: Padding(
                padding: EdgeInsets.symmetric(
                  horizontal: widget.compact ? 14 : 20,
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    if (widget.isLoading)
                      const SizedBox(
                        width: 16,
                        height: 16,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          color: Colors.white,
                        ),
                      )
                    else if (widget.icon != null)
                      Icon(widget.icon, size: 17, color: Colors.white),
                    if (widget.icon != null || widget.isLoading)
                      const SizedBox(width: 8),
                    Text(
                      widget.label,
                      style: const TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class FlatLineIconButton extends StatelessWidget {
  const FlatLineIconButton({
    required this.icon,
    required this.tooltip,
    required this.onPressed,
    this.selected = false,
    this.label,
    super.key,
  });

  final IconData icon;
  final String tooltip;
  final VoidCallback? onPressed;
  final bool selected;
  final String? label;

  @override
  Widget build(BuildContext context) {
    final color =
        selected ? imGlassBrand : Colors.white.withValues(alpha: 0.76);
    return Tooltip(
      message: tooltip,
      child: InkWell(
        onTap: onPressed,
        borderRadius: BorderRadius.circular(18),
        child: AnimatedContainer(
          duration: ImTokens.animFast,
          width: 58,
          constraints: const BoxConstraints(minHeight: 58),
          padding: const EdgeInsets.symmetric(vertical: 8),
          decoration: BoxDecoration(
            color: selected ? Colors.white : Colors.transparent,
            borderRadius: BorderRadius.circular(18),
            boxShadow: selected
                ? [
                    BoxShadow(
                      color: const Color(0xFF3C2E78).withValues(alpha: 0.18),
                      blurRadius: 28,
                      offset: const Offset(0, 12),
                    ),
                  ]
                : null,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(icon, size: 22, color: color),
              if (label != null) ...[
                const SizedBox(height: 5),
                Text(
                  label!,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    color: color,
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

enum ShellLayoutMode { normal, moments, settings }
