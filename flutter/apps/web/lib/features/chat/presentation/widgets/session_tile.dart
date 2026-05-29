import 'package:flutter/material.dart';
import 'package:im_core/core.dart';
import 'package:im_web/core/theme/glass_theme.dart';
import 'package:im_web/l10n/app_localizations.dart';

class SessionTile extends StatefulWidget {
  const SessionTile({
    required this.session,
    required this.isSelected,
    required this.onTap,
    super.key,
  });

  final ChatSession session;
  final bool isSelected;
  final VoidCallback onTap;

  @override
  State<SessionTile> createState() => _SessionTileState();
}

class _SessionTileState extends State<SessionTile> {
  bool _isHovered = false;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final glass = theme.extension<GlassTheme>()!;
    final lastMsg = widget.session.lastMessage;

    return MouseRegion(
      onEnter: (_) => setState(() => _isHovered = true),
      onExit: (_) => setState(() => _isHovered = false),
      child: AnimatedContainer(
        duration: glass.animationDuration,
        margin: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
        decoration: BoxDecoration(
          color: widget.isSelected
              ? theme.colorScheme.primaryContainer.withAlpha(50)
              : _isHovered
                  ? glass.navHoverBackground
                  : Colors.transparent,
          borderRadius: BorderRadius.circular(glass.controlRadius),
        ),
        child: Semantics(
          label: widget.session.targetName.isNotEmpty
              ? widget.session.targetName
              : AppLocalizations.of(context)!.chatSelectSession,
          button: true,
          child: ListTile(
            selected: widget.isSelected,
            selectedTileColor: Colors.transparent,
            leading: CircleAvatar(
              radius: 24,
              backgroundImage: widget.session.targetAvatar != null
                  ? NetworkImage(widget.session.targetAvatar!)
                  : null,
              child: widget.session.targetAvatar == null
                  ? Text(
                      widget.session.targetName.isNotEmpty
                          ? widget.session.targetName[0].toUpperCase()
                          : '?',
                      style: const TextStyle(fontSize: 18),
                    )
                  : null,
            ),
            title: Row(
              children: [
                Expanded(
                  child: Text(
                    widget.session.targetName,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontWeight: FontWeight.w500),
                  ),
                ),
                if (widget.session.lastMessageTime != null)
                  Text(
                    _formatTime(widget.session.lastMessageTime!),
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: theme.colorScheme.onSurfaceVariant,
                    ),
                  ),
              ],
            ),
            subtitle: Row(
              children: [
                Expanded(
                  child: Text(
                    lastMsg?.content ?? '',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      color: theme.colorScheme.onSurfaceVariant,
                      fontSize: 13,
                    ),
                  ),
                ),
                if (widget.session.unreadCount > 0)
                  Container(
                    margin: const EdgeInsets.only(left: 8),
                    padding:
                        const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                    decoration: BoxDecoration(
                      gradient: glass.accentGradient,
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Text(
                      widget.session.unreadCount > 99
                          ? '99+'
                          : '${widget.session.unreadCount}',
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 11,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ),
              ],
            ),
            onTap: widget.onTap,
          ),
        ),
      ),
    );
  }

  String _formatTime(String time) {
    try {
      final dt = DateTime.parse(time);
      final now = DateTime.now();
      if (dt.year == now.year && dt.month == now.month && dt.day == now.day) {
        return '${dt.hour.toString().padLeft(2, '0')}:${dt.minute.toString().padLeft(2, '0')}';
      }
      return '${dt.month}/${dt.day}';
    } catch (_) {
      return time;
    }
  }
}
