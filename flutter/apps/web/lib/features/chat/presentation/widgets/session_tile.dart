import 'package:flutter/material.dart';
import 'package:im_core/core.dart';
import 'package:im_ui/im_ui.dart';
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
    final lastMsg = widget.session.lastMessage;
    final isPinned =
        widget.session.isPinned == true || widget.session.pinned == true;
    final isMuted =
        widget.session.isMuted == true || widget.session.muted == true;
    final background = widget.isSelected
        ? ImTokens.wechatSelectedBg
        : _isHovered
            ? ImTokens.wechatHoverBg
            : Colors.transparent;

    return MouseRegion(
      onEnter: (_) => setState(() => _isHovered = true),
      onExit: (_) => setState(() => _isHovered = false),
      child: Semantics(
        label: widget.session.targetName.isNotEmpty
            ? widget.session.targetName
            : AppLocalizations.of(context)!.chatSelectSession,
        button: true,
        selected: widget.isSelected,
        child: Material(
          color: background,
          child: InkWell(
            onTap: widget.onTap,
            child: Container(
              height: 72,
              padding: const EdgeInsets.symmetric(horizontal: 12),
              decoration: BoxDecoration(
                border: Border(
                  bottom: BorderSide(color: theme.dividerColor),
                ),
              ),
              child: Row(
                children: [
                  CircleAvatar(
                    radius: 23,
                    backgroundColor: ImTokens.wechatAvatarBg,
                    backgroundImage: widget.session.targetAvatar != null
                        ? NetworkImage(widget.session.targetAvatar!)
                        : null,
                    child: widget.session.targetAvatar == null
                        ? Text(
                            widget.session.targetName.isNotEmpty
                                ? widget.session.targetName[0].toUpperCase()
                                : '?',
                            style: const TextStyle(
                              color: Color(0xFF4A4A4A),
                              fontSize: 18,
                              fontWeight: FontWeight.w600,
                            ),
                          )
                        : null,
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Expanded(
                              child: Text(
                                widget.session.targetName,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: theme.textTheme.bodyMedium?.copyWith(
                                  fontWeight: FontWeight.w500,
                                  color: ImTokens.wechatTextPrimary,
                                  fontSize: 15,
                                ),
                              ),
                            ),
                            if (isPinned) ...[
                              const SizedBox(width: 4),
                              Icon(
                                Icons.push_pin,
                                size: 13,
                                color: ImTokens.wechatTextSecondary,
                              ),
                            ],
                            if (isMuted) ...[
                              const SizedBox(width: 4),
                              Icon(
                                Icons.volume_off,
                                size: 14,
                                color: ImTokens.wechatTextSecondary,
                              ),
                            ],
                            if (widget.session.lastMessageTime != null) ...[
                              const SizedBox(width: 8),
                              Text(
                                _formatTime(widget.session.lastMessageTime!),
                                style: theme.textTheme.bodySmall?.copyWith(
                                  color: ImTokens.wechatTextSecondary,
                                  fontSize: 12,
                                ),
                              ),
                            ],
                          ],
                        ),
                        const SizedBox(height: 6),
                        Row(
                          children: [
                            Expanded(
                              child: Text(
                                _lastMessagePreview(lastMsg),
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: theme.textTheme.bodySmall?.copyWith(
                                  color: ImTokens.wechatTextSecondary,
                                  fontSize: 13,
                                ),
                              ),
                            ),
                            if (widget.session.unreadCount > 0)
                              Container(
                                margin: const EdgeInsets.only(left: 8),
                                constraints: const BoxConstraints(
                                  minWidth: 18,
                                  minHeight: 18,
                                ),
                                padding:
                                    const EdgeInsets.symmetric(horizontal: 5),
                                alignment: Alignment.center,
                                decoration: BoxDecoration(
                                  color: ImTokens.wechatUnread,
                                  borderRadius: BorderRadius.circular(9),
                                ),
                                child: Text(
                                  widget.session.unreadCount > 99
                                      ? '99+'
                                      : '${widget.session.unreadCount}',
                                  style: const TextStyle(
                                    color: Colors.white,
                                    fontSize: 11,
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                              ),
                          ],
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  String _lastMessagePreview(Message? message) {
    if (message == null) return '';
    if (message.content.trim().isNotEmpty) return message.content;
    return switch (message.messageType.toUpperCase()) {
      'IMAGE' => '[Image]',
      'FILE' => '[File]',
      'VOICE' => '[Voice]',
      'VIDEO' => '[Video]',
      _ => '',
    };
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
