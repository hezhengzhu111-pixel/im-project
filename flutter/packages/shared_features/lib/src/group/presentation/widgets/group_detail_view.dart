import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:im_core/core.dart';
import 'package:im_l10n/im_l10n.dart';
import 'package:im_ui/im_ui.dart';
import 'package:im_shared_features/auth.dart';
import 'package:im_shared_features/chat.dart';
import 'package:im_shared_features/contacts.dart';
import '../group_providers.dart';
import 'group_members_dialog.dart';

class GroupDetailPage extends ConsumerWidget {
  const GroupDetailPage({required this.group, super.key});

  final Group group;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Scaffold(
      backgroundColor: ImTokens.wechatPageBg,
      appBar: AppBar(
        leading: BackButton(
          onPressed: () => Navigator.of(context).maybePop(),
        ),
        title: Text(group.name),
      ),
      body: GroupDetailView(
        group: group,
        onEnterChat: () => _enterChat(context, ref, group),
        onLeave: (_) => _leaveGroup(context, ref, group),
        onDismiss: (_) => _dismissGroup(context, ref, group),
        showBackButton: false,
      ),
    );
  }

  void _enterChat(BuildContext context, WidgetRef ref, Group group) {
    final sessionKey =
        ref.read(chatStateProvider.notifier).getGroupSessionKey(group.id);
    ref.read(chatStateProvider.notifier).setActiveSession(sessionKey);
    ref.read(chatStateProvider.notifier).loadGroupMessages(group.id);
    context.go('/chat');
  }

  Future<void> _leaveGroup(
    BuildContext context,
    WidgetRef ref,
    Group group,
  ) async {
    final loc = AppLocalizations.of(context)!;
    final success =
        await ref.read(groupStateProvider.notifier).leaveGroup(group.id);
    if (!context.mounted) return;
    final messenger = ScaffoldMessenger.of(context);
    if (success) {
      messenger.showSnackBar(SnackBar(content: Text(loc.groupLeaveSuccess)));
      Navigator.of(context).maybePop();
    } else {
      messenger.showSnackBar(SnackBar(content: Text(loc.groupLeaveFailed)));
    }
  }

  Future<void> _dismissGroup(
    BuildContext context,
    WidgetRef ref,
    Group group,
  ) async {
    final loc = AppLocalizations.of(context)!;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(loc.groupDismiss),
        content: Text(loc.groupDismissConfirm(group.name)),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: Text(loc.commonCancel),
          ),
          TextButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: Text(
              loc.groupDismiss,
              style: TextStyle(color: Theme.of(context).colorScheme.error),
            ),
          ),
        ],
      ),
    );
    if (confirmed != true || !context.mounted) return;

    final success =
        await ref.read(groupStateProvider.notifier).dismissGroup(group.id);
    if (!context.mounted) return;
    final messenger = ScaffoldMessenger.of(context);
    if (success) {
      messenger.showSnackBar(SnackBar(content: Text(loc.groupDismissSuccess)));
      Navigator.of(context).maybePop();
    } else {
      messenger.showSnackBar(SnackBar(content: Text(loc.groupDismissFailed)));
    }
  }
}

class GroupDetailView extends ConsumerStatefulWidget {
  const GroupDetailView({
    required this.group,
    this.onEnterChat,
    this.onLeave,
    this.onDismiss,
    this.showBackButton = false,
    super.key,
  });

  final Group group;
  final VoidCallback? onEnterChat;
  final ValueChanged<Group>? onLeave;
  final ValueChanged<Group>? onDismiss;
  final bool showBackButton;

  @override
  ConsumerState<GroupDetailView> createState() => _GroupDetailViewState();
}

class _GroupDetailViewState extends ConsumerState<GroupDetailView> {
  var _isLeaving = false;
  var _isDismissing = false;

  @override
  Widget build(BuildContext context) {
    final loc = AppLocalizations.of(context)!;
    final group = widget.group;
    final theme = Theme.of(context);
    final currentUserId = ref.watch(authStateProvider).user?.id;
    final isOwner = currentUserId != null && currentUserId == group.ownerId;

    return SingleChildScrollView(
      padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 32),
      child: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 520),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              CircleAvatar(
                radius: 56,
                backgroundColor: ImTokens.wechatAvatarBg,
                backgroundImage:
                    group.avatar != null ? NetworkImage(group.avatar!) : null,
                child: group.avatar == null
                    ? Text(
                        group.name.isNotEmpty ? group.name[0] : '?',
                        style: theme.textTheme.displaySmall?.copyWith(
                          color: ImTokens.wechatTextPrimary,
                          fontWeight: FontWeight.w600,
                        ),
                      )
                    : null,
              ),
              const SizedBox(height: 20),
              Text(
                group.name,
                textAlign: TextAlign.center,
                style: theme.textTheme.headlineSmall?.copyWith(
                  fontWeight: FontWeight.w800,
                ),
              ),
              const SizedBox(height: 8),
              Text(
                group.description?.isNotEmpty == true
                    ? group.description!
                    : loc.groupNoDescription,
                textAlign: TextAlign.center,
                style: theme.textTheme.bodyLarge?.copyWith(
                  color: theme.colorScheme.onSurfaceVariant,
                ),
              ),
              const SizedBox(height: 12),
              _GroupRoleChip(isOwner: isOwner),
              const SizedBox(height: 18),
              _GroupInfoChip(
                icon: Icons.people_outline,
                label: loc.chatMemberCount(group.memberCount ?? 0),
              ),
              const SizedBox(height: 32),
              SizedBox(
                width: double.infinity,
                child: PrimarySolidButton(
                  label: loc.groupEnterChat,
                  icon: Icons.chat_bubble_outline,
                  onPressed: widget.onEnterChat,
                ),
              ),
              const SizedBox(height: 12),
              SizedBox(
                width: double.infinity,
                child: OutlinedButton.icon(
                  icon: const Icon(Icons.person_add_outlined),
                  label: Text(loc.groupInviteMember),
                  onPressed: () => _inviteMembers(context, group.id),
                ),
              ),
              const SizedBox(height: 12),
              SizedBox(
                width: double.infinity,
                child: OutlinedButton.icon(
                  icon: const Icon(Icons.people_outline),
                  label: Text(loc.groupMembers),
                  onPressed: () => _showMembers(context, group.id, isOwner),
                ),
              ),
              const SizedBox(height: 12),
              if (isOwner)
                SizedBox(
                  width: double.infinity,
                  child: OutlinedButton.icon(
                    key: const Key('group_dismiss_button'),
                    icon: const Icon(Icons.delete_outline),
                    label: _isDismissing
                        ? SizedBox(
                            width: 16,
                            height: 16,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              color: theme.colorScheme.error,
                            ),
                          )
                        : Text(loc.groupDismiss),
                    style: OutlinedButton.styleFrom(
                      foregroundColor: theme.colorScheme.error,
                    ),
                    onPressed: _isDismissing ? null : () => _confirmDismiss(),
                  ),
                ),
              if (isOwner) const SizedBox(height: 12),
              SizedBox(
                width: double.infinity,
                child: OutlinedButton.icon(
                  key: const Key('group_leave_button'),
                  icon: const Icon(Icons.logout),
                  label: _isLeaving
                      ? SizedBox(
                          width: 16,
                          height: 16,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: theme.colorScheme.error,
                          ),
                        )
                      : Text(loc.groupLeave),
                  style: OutlinedButton.styleFrom(
                    foregroundColor: theme.colorScheme.error,
                  ),
                  onPressed: _isLeaving ? null : () => _confirmLeave(group),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  void _showMembers(BuildContext context, String groupId, bool isOwner) {
    showDialog<void>(
      context: context,
      builder: (_) => GroupMembersDialog(
        groupId: groupId,
        allowRemove: isOwner,
      ),
    );
  }

  void _inviteMembers(BuildContext context, String groupId) {
    showDialog<void>(
      context: context,
      builder: (_) => _InviteMembersDialog(groupId: groupId),
    );
  }

  Future<void> _confirmLeave(Group group) async {
    final loc = AppLocalizations.of(context)!;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(loc.groupLeave),
        content: Text(loc.groupLeaveConfirm(group.name)),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: Text(loc.commonCancel),
          ),
          TextButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: Text(
              loc.groupLeave,
              style: TextStyle(color: Theme.of(context).colorScheme.error),
            ),
          ),
        ],
      ),
    );

    if (confirmed != true || !mounted) return;

    setState(() => _isLeaving = true);
    final notifier = ref.read(groupStateProvider.notifier);
    final success = await notifier.leaveGroup(group.id);
    if (!mounted) return;
    setState(() => _isLeaving = false);

    final messenger = ScaffoldMessenger.of(context);
    if (success) {
      messenger.showSnackBar(SnackBar(content: Text(loc.groupLeaveSuccess)));
      widget.onLeave?.call(group);
    } else {
      messenger.showSnackBar(SnackBar(content: Text(loc.groupLeaveFailed)));
    }
  }

  Future<void> _confirmDismiss() async {
    final loc = AppLocalizations.of(context)!;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(loc.groupDismiss),
        content: Text(loc.groupDismissConfirm(widget.group.name)),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: Text(loc.commonCancel),
          ),
          TextButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: Text(
              loc.groupDismiss,
              style: TextStyle(color: Theme.of(context).colorScheme.error),
            ),
          ),
        ],
      ),
    );

    if (confirmed != true || !mounted) return;

    setState(() => _isDismissing = true);
    final notifier = ref.read(groupStateProvider.notifier);
    final success = await notifier.dismissGroup(widget.group.id);
    if (!mounted) return;
    setState(() => _isDismissing = false);

    final messenger = ScaffoldMessenger.of(context);
    if (success) {
      messenger.showSnackBar(SnackBar(content: Text(loc.groupDismissSuccess)));
      widget.onDismiss?.call(widget.group);
    } else {
      messenger.showSnackBar(SnackBar(content: Text(loc.groupDismissFailed)));
    }
  }
}

class _GroupRoleChip extends StatelessWidget {
  const _GroupRoleChip({required this.isOwner});

  final bool isOwner;

  @override
  Widget build(BuildContext context) {
    final loc = AppLocalizations.of(context)!;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
      decoration: BoxDecoration(
        color: isOwner
            ? Theme.of(context).colorScheme.primary.withValues(alpha: 0.12)
            : Theme.of(context).colorScheme.surface,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(
          color: isOwner
              ? Theme.of(context).colorScheme.primary.withValues(alpha: 0.5)
              : Theme.of(context).dividerColor,
        ),
      ),
      child: Text(
        isOwner ? loc.groupOwner : loc.groupMember,
        style: Theme.of(context).textTheme.labelLarge?.copyWith(
              color: isOwner
                  ? Theme.of(context).colorScheme.primary
                  : Theme.of(context).colorScheme.onSurfaceVariant,
              fontWeight: FontWeight.w600,
            ),
      ),
    );
  }
}

class _InviteMembersDialog extends ConsumerStatefulWidget {
  const _InviteMembersDialog({required this.groupId});

  final String groupId;

  @override
  ConsumerState<_InviteMembersDialog> createState() =>
      _InviteMembersDialogState();
}

class _InviteMembersDialogState extends ConsumerState<_InviteMembersDialog> {
  final Set<String> _selectedIds = {};
  var _isInviting = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      ref.read(contactsStateProvider.notifier).loadFriends();
    });
  }

  @override
  Widget build(BuildContext context) {
    final loc = AppLocalizations.of(context)!;
    final contactsState = ref.watch(contactsStateProvider);
    return Dialog(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 400, maxHeight: 500),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                loc.groupInviteMember,
                style: Theme.of(context).textTheme.titleLarge,
              ),
              const SizedBox(height: 16),
              Expanded(
                child: contactsState.friends.isEmpty
                    ? Center(child: Text(loc.contactsNoFriends))
                    : ListView.builder(
                        itemCount: contactsState.friends.length,
                        itemBuilder: (context, index) {
                          final friend = contactsState.friends[index];
                          return CheckboxListTile(
                            value: _selectedIds.contains(friend.friendId),
                            onChanged: (checked) {
                              setState(() {
                                if (checked == true) {
                                  _selectedIds.add(friend.friendId);
                                } else {
                                  _selectedIds.remove(friend.friendId);
                                }
                              });
                            },
                            title: Text(friend.nickname ?? friend.username),
                            secondary: CircleAvatar(
                              child: Text(
                                (friend.nickname ?? friend.username)
                                        .isNotEmpty
                                    ? (friend.nickname ?? friend.username)[0]
                                    : '?',
                              ),
                            ),
                          );
                        },
                      ),
              ),
              const SizedBox(height: 12),
              SizedBox(
                width: double.infinity,
                child: PrimarySolidButton(
                  label: loc.groupInviteMember,
                  onPressed:
                      _isInviting || _selectedIds.isEmpty ? null : _invite,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _invite() async {
    final loc = AppLocalizations.of(context)!;
    setState(() => _isInviting = true);
    final success = await ref
        .read(groupStateProvider.notifier)
        .inviteMembers(widget.groupId, _selectedIds.toList());
    if (!mounted) return;
    setState(() => _isInviting = false);

    final messenger = ScaffoldMessenger.of(context);
    if (success) {
      messenger.showSnackBar(SnackBar(content: Text(loc.groupInviteSuccess)));
      Navigator.of(context).pop();
    } else {
      messenger.showSnackBar(SnackBar(content: Text(loc.groupInviteFailed)));
    }
  }
}

class _GroupInfoChip extends StatelessWidget {
  const _GroupInfoChip({required this.icon, required this.label});

  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surface,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: Theme.of(context).dividerColor),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 18),
          const SizedBox(width: 6),
          Text(label),
        ],
      ),
    );
  }
}
