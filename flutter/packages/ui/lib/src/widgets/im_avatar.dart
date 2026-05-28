import 'package:flutter/material.dart';

import '../theme/im_tokens.dart';

/// Circular avatar with image or color-hash initials fallback.
class ImAvatar extends StatelessWidget {
  const ImAvatar({
    super.key,
    this.imageUrl,
    required this.name,
    this.size = 40,
    this.showStatus = false,
    this.isOnline = false,
  });

  final String? imageUrl;
  final String name;
  final double size;
  final bool showStatus;
  final bool isOnline;

  static const _palette = [
    Color(0xFFE91E63),
    Color(0xFF9C27B0),
    Color(0xFF3F51B5),
    Color(0xFF009688),
    Color(0xFFFF5722),
    Color(0xFF795548),
    Color(0xFF607D8B),
    Color(0xFF00BCD4),
  ];

  Color get _avatarColor => _palette[name.hashCode.abs() % _palette.length];

  String get _initials {
    final parts = name.trim().split(RegExp(r'\s+'));
    if (parts.isEmpty) return '?';
    if (parts.length == 1) return parts[0][0].toUpperCase();
    return '${parts[0][0]}${parts[1][0]}'.toUpperCase();
  }

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).brightness == Brightness.light
        ? ImColors.light
        : ImColors.dark;

    final avatar = SizedBox(
      width: size,
      height: size,
      child: CircleAvatar(
        radius: size / 2,
        backgroundColor: _avatarColor,
        backgroundImage: imageUrl != null ? NetworkImage(imageUrl!) : null,
        child: imageUrl == null
            ? Text(
                _initials,
                style: TextStyle(
                  color: Colors.white,
                  fontSize: size * 0.4,
                  fontWeight: FontWeight.w600,
                ),
              )
            : null,
      ),
    );

    if (!showStatus) return avatar;

    final statusColor = isOnline ? colors.online : colors.offline;
    final statusSize = size * 0.25;

    return Stack(
      clipBehavior: Clip.none,
      children: [
        avatar,
        Positioned(
          right: 0,
          bottom: 0,
          child: Container(
            width: statusSize,
            height: statusSize,
            decoration: BoxDecoration(
              color: statusColor,
              shape: BoxShape.circle,
              border: Border.all(
                color: colors.surface,
                width: 2,
              ),
            ),
          ),
        ),
      ],
    );
  }
}
