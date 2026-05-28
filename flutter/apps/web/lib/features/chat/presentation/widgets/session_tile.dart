import 'package:flutter/material.dart';
import 'package:im_core/core.dart';
import 'package:im_web/l10n/app_localizations.dart';

class SessionTile extends StatelessWidget {
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
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final lastMsg = session.lastMessage;

    return Semantics(
      label: session.targetName.isNotEmpty ? session.targetName : AppLocalizations.of(context)!.chatSelectSession,
      button: true,
      child: ListTile(
      selected: isSelected,
      selectedTileColor: theme.colorScheme.primaryContainer.withAlpha(50),
      leading: CircleAvatar(
        radius: 24,
        backgroundImage: session.targetAvatar != null
            ? NetworkImage(session.targetAvatar!)
            : null,
        child: session.targetAvatar == null
            ? Text(
                session.targetName.isNotEmpty
                    ? session.targetName[0].toUpperCase()
                    : '?',
                style: const TextStyle(fontSize: 18),
              )
            : null,
      ),
      title: Row(
        children: [
          Expanded(
            child: Text(
              session.targetName,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(fontWeight: FontWeight.w500),
            ),
          ),
          if (session.lastMessageTime != null)
            Text(
              _formatTime(session.lastMessageTime!),
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
          if (session.unreadCount > 0)
            Container(
              margin: const EdgeInsets.only(left: 8),
              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
              decoration: BoxDecoration(
                color: theme.colorScheme.error,
                borderRadius: BorderRadius.circular(10),
              ),
              child: Text(
                session.unreadCount > 99 ? '99+' : '${session.unreadCount}',
                style: TextStyle(
                  color: theme.colorScheme.onError,
                  fontSize: 11,
                  fontWeight: FontWeight.bold,
                ),
              ),
            ),
        ],
      ),
      onTap: onTap,
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
