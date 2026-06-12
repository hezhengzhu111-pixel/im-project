import 'package:flutter/material.dart';

import '../theme/im_tokens.dart';

const Color imGlassBrand = ImTokens.wechatGreen;
const Color imGlassBrandHover = ImTokens.wechatGreenPressed;

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
    return ColoredBox(
      color: Theme.of(context).colorScheme.surfaceContainerHighest,
      child: child,
    );
  }
}

class GlassPanel extends StatelessWidget {
  const GlassPanel({
    required this.child,
    this.padding,
    this.margin,
    this.borderRadius = 4,
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
    final theme = Theme.of(context);
    return Container(
      margin: margin,
      clipBehavior: clipBehavior,
      decoration: BoxDecoration(
        color: backgroundColor ?? theme.colorScheme.surface,
        borderRadius: BorderRadius.circular(borderRadius),
        border: Border.all(color: theme.dividerColor),
      ),
      child: Padding(
        padding: padding ?? EdgeInsets.zero,
        child: child,
      ),
    );
  }
}

class HoverLiftCard extends StatefulWidget {
  const HoverLiftCard({
    required this.child,
    this.onTap,
    this.padding = const EdgeInsets.all(ImTokens.space4),
    this.borderRadius = 4,
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
    final theme = Theme.of(context);
    final card = MouseRegion(
      onEnter: (_) => setState(() => _hovered = true),
      onExit: (_) => setState(() => _hovered = false),
      child: AnimatedContainer(
        duration: ImTokens.animFast,
        curve: Curves.easeOut,
        padding: widget.padding,
        decoration: BoxDecoration(
          color: _hovered
              ? theme.colorScheme.surfaceContainerHighest
              : theme.colorScheme.surface,
          borderRadius: BorderRadius.circular(widget.borderRadius),
          border: Border.all(color: theme.dividerColor),
        ),
        child: widget.child,
      ),
    );

    if (widget.onTap == null) return card;
    return Material(
      color: Colors.transparent,
      child: InkWell(onTap: widget.onTap, child: card),
    );
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
        decoration: BoxDecoration(
          color: enabled
              ? (_hovered ? imGlassBrandHover : imGlassBrand)
              : imGlassBrand.withValues(alpha: 0.38),
          borderRadius: BorderRadius.circular(ImTokens.radiusSm),
        ),
        child: Material(
          color: Colors.transparent,
          child: InkWell(
            borderRadius: BorderRadius.circular(ImTokens.radiusSm),
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
                        fontWeight: FontWeight.w600,
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
    final color = selected ? ImTokens.wechatGreen : const Color(0xFF9A9A9A);
    return Tooltip(
      message: tooltip,
      child: InkWell(
        onTap: onPressed,
        child: AnimatedContainer(
          duration: ImTokens.animFast,
          width: 64,
          constraints: const BoxConstraints(minHeight: 58),
          padding: const EdgeInsets.symmetric(vertical: 8),
          decoration: BoxDecoration(
            border: selected
                ? const Border(
                    left: BorderSide(color: ImTokens.wechatGreen, width: 3),
                  )
                : null,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(icon, size: 24, color: color),
              if (label != null) ...[
                const SizedBox(height: 5),
                Text(
                  label!,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    color: color,
                    fontSize: 10,
                    fontWeight: selected ? FontWeight.w600 : FontWeight.w400,
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
