import 'package:flutter/material.dart';
import 'package:im_core/core.dart';

class GroupTile extends StatelessWidget {
  const GroupTile({required this.group, this.onTap, super.key});
  final Group group;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return ListTile(
      leading: CircleAvatar(
        backgroundImage:
            group.avatar != null ? NetworkImage(group.avatar!) : null,
        child: group.avatar == null
            ? Text(group.name.isNotEmpty ? group.name[0] : '?')
            : null,
      ),
      title: Text(group.name),
      subtitle: Text(
        '${group.memberCount ?? 0} members',
        style: Theme.of(context).textTheme.bodySmall,
      ),
      onTap: onTap,
    );
  }
}
