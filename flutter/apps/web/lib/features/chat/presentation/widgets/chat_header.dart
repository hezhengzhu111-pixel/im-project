import 'package:flutter/material.dart';
import 'package:im_core/core.dart';
import 'package:im_web/l10n/app_localizations.dart';
import '../../../e2ee/presentation/encryption_badge.dart';

class ChatHeader extends StatelessWidget {
  const ChatHeader({
    required this.session,
    required this.isMobile,
    required this.onBackPressed,
    this.e2eeStatus,
    super.key,
  });

  final ChatSession session;
  final bool isMobile;
  final VoidCallback onBackPressed;
  final E2eeSessionStatus? e2eeStatus;

  @override
  Widget build(BuildContext context) {
    final loc = AppLocalizations.of(context)!;
    final sessionName =
        session.conversationName ?? session.targetName ?? session.id;
    final isGroup =
        session.conversationType == 'group' || session.type == 'group';
    final memberCount = session.memberCount;

    return Container(
      padding: const EdgeInsets.symmetric(
        horizontal: 16,
        vertical: 12,
      ),
      decoration: BoxDecoration(
        border: Border(
          bottom: BorderSide(color: Theme.of(context).dividerColor),
        ),
      ),
      child: Row(
        children: [
          if (isMobile)
            IconButton(
              icon: const Icon(Icons.arrow_back),
              onPressed: onBackPressed,
            ),
          _buildAvatar(context),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  sessionName,
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.w600,
                      ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
                if (isGroup && memberCount != null)
                  Text(
                    loc.chatMemberCount(memberCount),
                    style: Theme.of(context).textTheme.bodySmall?.copyWith(
                          color: Theme.of(context).colorScheme.onSurfaceVariant,
                        ),
                  ),
              ],
            ),
          ),
          if (!isGroup && e2eeStatus != null)
            EncryptionBadge(status: e2eeStatus!),
        ],
      ),
    );
  }

  Widget _buildAvatar(BuildContext context) {
    return CircleAvatar(
      radius: 18,
      backgroundImage: session.targetAvatar != null
          ? NetworkImage(session.targetAvatar!)
          : null,
      child: session.targetAvatar == null
          ? Text(
              session.targetName.isNotEmpty
                  ? session.targetName[0].toUpperCase()
                  : '?',
              style: const TextStyle(fontSize: 16),
            )
          : null,
    );
  }
}
