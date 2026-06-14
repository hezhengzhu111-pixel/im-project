import 'package:flutter/material.dart';
import 'package:im_core/core.dart';
import 'package:im_ui/im_ui.dart';

class GroupTile extends StatelessWidget {
  const GroupTile({required this.group, this.onTap, super.key});
  final Group group;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
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
      title: Text(
        group.name,
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
        style: const TextStyle(
          color: ImTokens.wechatTextPrimary,
          fontWeight: FontWeight.w500,
        ),
      ),
      subtitle: Text(
        '${group.memberCount ?? 0} members',
        style: Theme.of(context).textTheme.bodySmall?.copyWith(
              color: ImTokens.wechatTextSecondary,
            ),
      ),
      onTap: onTap,
    );
  }
}
