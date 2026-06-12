import 'package:flutter/material.dart';

import '../theme/im_tokens.dart';
import 'im_badge.dart';

/// Navigation item with icon, label, optional badge, and selection state.
class ImNavItem extends StatelessWidget {
  const ImNavItem({
    super.key,
    required this.icon,
    this.selectedIcon,
    required this.label,
    this.badge,
    this.isSelected = false,
    required this.onTap,
  });

  final IconData icon;
  final IconData? selectedIcon;
  final String label;
  final int? badge;
  final bool isSelected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).brightness == Brightness.light
        ? ImColors.light
        : ImColors.dark;

    final iconColor = isSelected ? colors.primary : colors.textSecondary;
    final textColor = isSelected ? colors.primary : colors.textSecondary;
    final currentIcon =
        isSelected && selectedIcon != null ? selectedIcon! : icon;

    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(ImTokens.radiusMd),
      child: Padding(
        padding: EdgeInsets.symmetric(
          horizontal: ImTokens.space3,
          vertical: ImTokens.space2,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ImBadge(
              count: badge ?? 0,
              child: Icon(currentIcon, color: iconColor, size: 24),
            ),
            SizedBox(height: ImTokens.space1),
            Text(
              label,
              style: TextStyle(
                fontSize: ImTokens.textXs,
                fontWeight: isSelected ? FontWeight.w600 : FontWeight.normal,
                color: textColor,
              ),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
          ],
        ),
      ),
    );
  }
}
