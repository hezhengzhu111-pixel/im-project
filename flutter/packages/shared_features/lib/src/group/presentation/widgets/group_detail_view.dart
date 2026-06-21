import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:im_core/core.dart';
import 'package:im_l10n/im_l10n.dart';
import 'package:im_ui/im_ui.dart';
import 'package:im_shared_features/chat.dart';
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
}

class GroupDetailView extends ConsumerStatefulWidget {
  const GroupDetailView({
    required this.group,
    this.onEnterChat,
    this.onLeave,
    this.showBackButton = false,
    super.key,
  });

  final Group group;
  final VoidCallback? onEnterChat;
  final ValueChanged<Group>? onLeave;
  final bool showBackButton;

  @override
  ConsumerState<GroupDetailView> createState() => _GroupDetailViewState();
}

class _GroupDetailViewState extends ConsumerState<GroupDetailView> {
  var _isLeaving = false;

  @override
  Widget build(BuildContext context) {
    final loc = AppLocalizations.of(context)!;
    final group = widget.group;
    final theme = Theme.of(context);

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
                  icon: const Icon(Icons.people_outline),
                  label: Text(loc.groupMembers),
                  onPressed: () => _showMembers(context, group.id),
                ),
              ),
              const SizedBox(height: 12),
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

  void _showMembers(BuildContext context, String groupId) {
    showDialog<void>(
      context: context,
      builder: (_) => GroupMembersDialog(groupId: groupId),
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
