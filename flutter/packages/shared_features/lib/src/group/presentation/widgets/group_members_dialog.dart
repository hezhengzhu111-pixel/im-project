import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:im_core/core.dart';
import 'package:im_l10n/im_l10n.dart';
import '../group_providers.dart';

class GroupMembersDialog extends ConsumerStatefulWidget {
  const GroupMembersDialog({required this.groupId, super.key});

  final String groupId;

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
      final members =
          await ref.read(groupStateProvider.notifier).getMembers(widget.groupId);
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

    return ListView.builder(
      itemCount: _members.length,
      itemBuilder: (context, index) {
        final member = _members[index];
        final displayName = member.nickname?.isNotEmpty == true
            ? member.nickname!
            : member.userId;
        return ListTile(
          leading: CircleAvatar(
            child: Text(displayName.isNotEmpty ? displayName[0] : '?'),
          ),
          title: Text(displayName),
          subtitle: member.role != null && member.role!.isNotEmpty
              ? Text(member.role!)
              : null,
        );
      },
    );
  }
}
