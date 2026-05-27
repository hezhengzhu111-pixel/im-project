import 'package:flutter/material.dart';

class MomentsCover extends StatelessWidget {
  const MomentsCover({
    required this.nickname,
    this.coverPhoto,
    this.avatar,
    super.key,
  });

  final String? coverPhoto;
  final String? avatar;
  final String nickname;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return SizedBox(
      height: 240,
      child: Stack(
        fit: StackFit.expand,
        children: [
          // Cover background
          if (coverPhoto != null && coverPhoto!.isNotEmpty)
            Image.network(
              coverPhoto!,
              fit: BoxFit.cover,
              errorBuilder: (_, __, ___) => _buildPlaceholder(theme),
            )
          else
            _buildPlaceholder(theme),

          // Gradient overlay
          const DecoratedBox(
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
                colors: [Colors.transparent, Colors.black45],
              ),
            ),
          ),

          // Nickname + Avatar
          Positioned(
            bottom: 0,
            left: 0,
            right: 0,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 0),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  const Spacer(),
                  Text(
                    nickname,
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 18,
                      fontWeight: FontWeight.w600,
                      shadows: [Shadow(blurRadius: 4, color: Colors.black45)],
                    ),
                  ),
                  const SizedBox(width: 12),
                  Transform.translate(
                    offset: const Offset(0, 20),
                    child: CircleAvatar(
                      radius: 32,
                      backgroundColor: theme.colorScheme.surface,
                      child: CircleAvatar(
                        radius: 29,
                        backgroundImage: avatar != null ? NetworkImage(avatar!) : null,
                        child: avatar == null
                            ? Text(nickname.isNotEmpty ? nickname[0].toUpperCase() : 'U',
                                style: const TextStyle(fontSize: 20))
                            : null,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildPlaceholder(ThemeData theme) {
    return Container(
      color: theme.colorScheme.primaryContainer.withValues(alpha: 0.5),
      child: Center(
        child: Icon(
          Icons.landscape,
          size: 64,
          color: theme.colorScheme.primary.withValues(alpha: 0.3),
        ),
      ),
    );
  }
}
