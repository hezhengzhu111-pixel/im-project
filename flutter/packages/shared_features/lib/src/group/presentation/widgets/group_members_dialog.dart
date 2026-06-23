import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:im_core/core.dart';
import 'package:im_l10n/im_l10n.dart';
import 'package:im_shared_features/auth.dart';
import '../group_providers.dart';

class GroupMembersDialog extends ConsumerStatefulWidget {
  const GroupMembersDialog({
    required this.groupId,
    this.allowRemove = false,
    super.key,
  });

  final String groupId;
  final bool allowRemove;

  @override
  ConsumerState<GroupMembersDialog> createState() => _GroupMembersDialogState();
}

class _GroupMembersDialogState extends ConsumerState<GroupMembersDialog> {
  var _isLoading = true;
  String? _error;
  List<GroupMember> _members = [];

  @override
  void initState() {
    super.initState();
    _loadMembers();
  }

  Future<void> _loadMembers() async {
    try {
      final members = await ref
          .read(groupStateProvider.notifier)
          .getMembers(widget.groupId);
      if (!mounted) return;
      setState(() {
        _members = members;
        _isLoading = false;
        _error = null;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.toString();
        _isLoading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final loc = AppLocalizations.of(context)!;
    return Dialog(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 400, maxHeight: 500),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                loc.groupMemberListTitle,
                style: Theme.of(context).textTheme.titleLarge,
              ),
              const SizedBox(height: 16),
              Expanded(child: _buildContent(loc)),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildContent(AppLocalizations loc) {
    if (_isLoading) {
      return const Center(child: CircularProgressIndicator());
    }

    if (_error != null) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(loc.groupLoadMembersFailed),
            const SizedBox(height: 8),
            Text(
              _error!,
              textAlign: TextAlign.center,
              style: TextStyle(
                color: Theme.of(context).colorScheme.error,
              ),
            ),
            const SizedBox(height: 12),
            OutlinedButton(
              onPressed: _loadMembers,
              child: Text(loc.retry),
            ),
          ],
        ),
      );
    }

    if (_members.isEmpty) {
      return Center(child: Text(loc.groupNoMembers));
    }

    final currentUserId = ref.watch(authStateProvider).user?.id;

    return ListView.builder(
      itemCount: _members.length,
      itemBuilder: (context, index) {
        final member = _members[index];
        final displayName = member.nickname?.isNotEmpty == true
            ? member.nickname!
            : member.userId;
        final roleLabel = _roleLabel(loc, member.role);
        final isSelf = currentUserId == member.userId;
        return ListTile(
          leading: CircleAvatar(
            child: Text(displayName.isNotEmpty ? displayName[0] : '?'),
          ),
          title: Text(displayName),
          subtitle: roleLabel != null ? Text(roleLabel) : null,
          trailing: widget.allowRemove && !isSelf && !_isOwnerRole(member.role)
              ? IconButton(
                  icon: const Icon(Icons.remove_circle_outline),
                  color: Theme.of(context).colorScheme.error,
                  tooltip: loc.groupRemoveMember,
                  onPressed: () => _confirmRemove(loc, member),
                )
              : null,
        );
      },
    );
  }

  String? _roleLabel(AppLocalizations loc, String? role) {
    if (role == null || role.isEmpty) return null;
    final lower = role.toLowerCase();
    if (lower == 'owner' || role == '3') return loc.groupOwner;
    if (lower == 'admin' || role == '2') return loc.groupAdmin;
    return loc.groupMember;
  }

  bool _isOwnerRole(String? role) {
    if (role == null || role.isEmpty) return false;
    final lower = role.toLowerCase();
    return lower == 'owner' || role == '3';
  }

  Future<void> _confirmRemove(AppLocalizations loc, GroupMember member) async {
    final displayName = member.nickname?.isNotEmpty == true
        ? member.nickname!
        : member.userId;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(loc.groupRemoveMember),
        content: Text(loc.groupRemoveMemberConfirm(displayName)),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: Text(loc.commonCancel),
          ),
          TextButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: Text(
              loc.groupRemoveMember,
              style: TextStyle(color: Theme.of(context).colorScheme.error),
            ),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;

    final success = await ref
        .read(groupStateProvider.notifier)
        .removeMembers(widget.groupId, [member.userId]);
    if (!mounted) return;

    if (success) {
      await _loadMembers();
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(loc.groupRemoveMemberSuccess)),
      );
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(loc.groupRemoveMemberFailed)),
      );
    }
  }
}
