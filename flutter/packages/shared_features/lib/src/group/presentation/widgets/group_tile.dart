import 'package:flutter/material.dart';
import 'package:im_core/core.dart';
import 'package:im_l10n/im_l10n.dart';
import 'package:im_ui/im_ui.dart';

class GroupTile extends StatelessWidget {
  const GroupTile({
    required this.group,
    this.session,
    this.onTap,
    super.key,
  });
  final Group group;
  final ChatSession? session;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final loc = AppLocalizations.of(context)!;
    final lastMessageText = _lastMessageText(loc);
    final unreadCount = session?.unreadCount ?? 0;
    final memberCount = session?.memberCount ?? group.memberCount ?? 0;

    return ListTile(
      minVerticalPadding: 10,
      contentPadding: const EdgeInsets.symmetric(horizontal: 12),
      leading: CircleAvatar(
        radius: 22,
        backgroundColor: ImTokens.wechatAvatarBg,
        backgroundImage:
            group.avatar != null ? NetworkImage(group.avatar!) : null,
        child: group.avatar == null
            ? Text(group.name.isNotEmpty ? group.name[0] : '?')
            : null,
      ),
      title: Row(
        children: [
          Expanded(
            child: Text(
              group.name,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                color: ImTokens.wechatTextPrimary,
                fontWeight: FontWeight.w500,
              ),
            ),
          ),
          if (unreadCount > 0)
            Padding(
              padding: const EdgeInsets.only(left: 8),
              child: Badge(
                label: Text('$unreadCount'),
                child: const SizedBox(width: 8, height: 8),
              ),
            ),
        ],
      ),
      subtitle: Text(
        lastMessageText ?? '$memberCount ${loc.chatMemberCount(memberCount)}',
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
        style: Theme.of(context).textTheme.bodySmall?.copyWith(
              color: ImTokens.wechatTextSecondary,
            ),
      ),
      onTap: onTap,
    );
  }

  String? _lastMessageText(AppLocalizations loc) {
    final last = session?.lastMessage;
    if (last == null) return null;
    final content = last.content.trim();
    if (content.isEmpty) return loc.groupLastMessageEmpty;
    return content;
  }
}
