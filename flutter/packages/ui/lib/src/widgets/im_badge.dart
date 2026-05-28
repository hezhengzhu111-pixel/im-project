import 'package:flutter/material.dart';

import '../theme/im_tokens.dart';

/// Badge displaying a count or a dot indicator.
class ImBadge extends StatelessWidget {
  const ImBadge({
    super.key,
    this.count = 0,
    this.maxCount = 99,
    this.child,
  });

  final int count;
  final int maxCount;
  final Widget? child;

  @override
  Widget build(BuildContext context) {
    if (child == null && count <= 0) return const SizedBox.shrink();

    final displayText = count > maxCount ? '$maxCount+' : '$count';
    final showBadge = count > 0;

    if (child == null) {
      return Container(
        padding: EdgeInsets.symmetric(
          horizontal: ImTokens.space2,
          vertical: ImTokens.space0 + 2,
        ),
        decoration: BoxDecoration(
          color: ImComponentTokens.badgeBg,
          borderRadius: BorderRadius.circular(ImTokens.radiusFull),
        ),
        child: Text(
          displayText,
          style: TextStyle(
            color: ImComponentTokens.badgeText,
            fontSize: ImTokens.textXs,
            fontWeight: FontWeight.w600,
            height: 1.2,
          ),
        ),
      );
    }

    return Stack(
      clipBehavior: Clip.none,
      children: [
        child!,
        if (showBadge)
          Positioned(
            right: -6,
            top: -6,
            child: Container(
              padding: EdgeInsets.symmetric(
                horizontal: count > 9 ? ImTokens.space1 : 4,
                vertical: 1,
              ),
              decoration: BoxDecoration(
                color: ImComponentTokens.badgeBg,
                borderRadius: BorderRadius.circular(ImTokens.radiusFull),
              ),
              child: Text(
                displayText,
                style: TextStyle(
                  color: ImComponentTokens.badgeText,
                  fontSize: 10,
                  fontWeight: FontWeight.w600,
                  height: 1.2,
                ),
              ),
            ),
          ),
      ],
    );
  }
}
