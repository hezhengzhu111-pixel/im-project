import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:im_l10n/im_l10n.dart';
import 'package:im_shared_features/auth.dart';
import 'package:im_shared_features/chat.dart';
import 'package:im_ui/im_ui.dart';
import 'group_provider.dart';
import 'group_providers.dart';
import 'widgets/group_tile.dart';
import 'widgets/join_group_dialog.dart';
import 'widgets/group_detail_view.dart';

// Group model comes from core and is not re-exported transitively by providers.
import 'package:im_core/core.dart' show Group;

class GroupListPage extends ConsumerStatefulWidget {
  const GroupListPage({super.key});

  @override
  ConsumerState<GroupListPage> createState() => _GroupListPageState();
}

class _GroupListPageState extends ConsumerState<GroupListPage> {
  ProviderSubscription<AuthState>? _authSubscription;

  void _onAuthChanged(AuthState? previous, AuthState next) {
    final userId = next.user?.id;
    if (next.authReady && userId != null && userId.isNotEmpty) {
      final groupStateValue = ref.read(groupStateProvider);
      if (groupStateValue.groups.isEmpty &&
          !groupStateValue.isLoading &&
          groupStateValue.error == null) {
        ref.read(groupStateProvider.notifier).loadGroups(userId);
      }
    }
  }

  @override
  void initState() {
    super.initState();
    _authSubscription = ref.listenManual(
      authStateProvider,
      _onAuthChanged,
    );
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _onAuthChanged(null, ref.read(authStateProvider));
    });
  }

  @override
  void dispose() {
    _authSubscription?.close();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final loc = AppLocalizations.of(context)!;
    final groupState = ref.watch(groupStateProvider);
    final isCompact = context.isCompact;

    return ColoredBox(
      color: ImTokens.wechatPageBg,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Row(
          children: [
            if (!isCompact)
              SizedBox(
                width: 304,
                child: GlassPanel(
                  child: _GroupListPanel(
                    groups: groupState.groups,
                    isLoading: groupState.isLoading,
                    selectedGroupId: groupState.selectedGroupId,
                    onGroupTap: _selectGroup,
                  ),
                ),
              ),
            if (!isCompact) const SizedBox(width: 18),
            Expanded(
              child: GlassPanel(
                padding: const EdgeInsets.all(24),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    SingleChildScrollView(
                      scrollDirection: Axis.horizontal,
                      child: Row(
                        children: [
                          Text(
                            loc.navGroups,
                            style: Theme.of(context)
                                .textTheme
                                .headlineSmall
                                ?.copyWith(
                                  fontWeight: FontWeight.w800,
                                ),
                          ),
                          const SizedBox(width: 18),
                          IconButton(
                            icon: const Icon(Icons.search_outlined),
                            onPressed: () => showDialog(
                              context: context,
                              builder: (_) => const JoinGroupDialog(),
                            ),
                            tooltip: loc.joinGroupTooltip,
                          ),
                          PrimarySolidButton(
                            label: loc.groupCreateTooltip,
                            icon: Icons.add,
                            compact: true,
                            onPressed: () => context.push('/groups/create'),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 18),
                    Expanded(
                      child: _buildBody(context, groupState, isCompact),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildBody(BuildContext context, GroupState groupState, bool isCompact) {
    final loc = AppLocalizations.of(context)!;

    if (groupState.isLoading && groupState.groups.isEmpty) {
      return const Center(child: CircularProgressIndicator());
    }

    if (groupState.error != null && groupState.groups.isEmpty) {
      return _GroupErrorState(
        message: loc.loadingFailed(groupState.error!),
        onRetry: _retryLoad,
      );
    }

    if (groupState.groups.isEmpty) {
      return _GroupEmptyState(message: loc.groupNoGroups);
    }

    if (isCompact) {
      return _GroupListPanel(
        groups: groupState.groups,
        isLoading: groupState.isLoading,
        selectedGroupId: groupState.selectedGroupId,
        onGroupTap: (group) => _openGroupDetail(context, group),
      );
    }

    final selectedGroup = groupState.selectedGroup;
    if (selectedGroup == null) {
      return _GroupDetailPlaceholder(
        message: loc.groupSelectGroupHint,
        subMessage: loc.groupTotalGroups(groupState.groups.length),
      );
    }

    return GroupDetailView(
      group: selectedGroup,
      onEnterChat: () => _openGroupChat(selectedGroup),
      onLeave: _leaveGroup,
    );
  }

  void _selectGroup(Group group) {
    ref.read(groupStateProvider.notifier).selectGroup(group.id);
  }

  void _openGroupDetail(BuildContext context, Group group) {
    Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => GroupDetailPage(group: group),
      ),
    );
  }

  void _openGroupChat(Group group) {
    final sessionKey =
        ref.read(chatStateProvider.notifier).getGroupSessionKey(group.id);
    ref.read(chatStateProvider.notifier).setActiveSession(sessionKey);
    ref.read(chatStateProvider.notifier).loadGroupMessages(group.id);
    context.go('/chat');
  }

  Future<void> _leaveGroup(Group group) async {
    final loc = AppLocalizations.of(context)!;
    final notifier = ref.read(groupStateProvider.notifier);
    final success = await notifier.leaveGroup(group.id);
    if (!mounted) return;
    final messenger = ScaffoldMessenger.of(context);
    if (success) {
      messenger.showSnackBar(SnackBar(content: Text(loc.groupLeaveSuccess)));
    } else {
      messenger.showSnackBar(SnackBar(content: Text(loc.groupLeaveFailed)));
    }
  }

  void _retryLoad() {
    final userId = ref.read(authStateProvider).user?.id;
    if (userId != null) {
      ref.read(groupStateProvider.notifier).loadGroups(userId);
    }
  }
}

class _GroupListPanel extends StatelessWidget {
  const _GroupListPanel({
    required this.groups,
    required this.isLoading,
    this.selectedGroupId,
    required this.onGroupTap,
  });

  final List<Group> groups;
  final bool isLoading;
  final String? selectedGroupId;
  final ValueChanged<Group> onGroupTap;

  @override
  Widget build(BuildContext context) {
    final loc = AppLocalizations.of(context)!;
    if (isLoading && groups.isEmpty) {
      return const Center(child: CircularProgressIndicator());
    }
    if (groups.isEmpty) return _GroupEmptyState(message: loc.groupNoGroups);
    return ListView.builder(
      padding: const EdgeInsets.all(12),
      itemCount: groups.length,
      itemBuilder: (context, index) {
        final group = groups[index];
        final isSelected = selectedGroupId == group.id;
        return Padding(
          padding: const EdgeInsets.only(bottom: 8),
          child: ColoredBox(
            color: isSelected
                ? Theme.of(context)
                    .colorScheme
                    .primary
                    .withValues(alpha: 0.08)
                : Colors.transparent,
            child: HoverLiftCard(
              padding: EdgeInsets.zero,
              onTap: () => onGroupTap(group),
              child: GroupTile(group: group),
            ),
          ),
        );
      },
    );
  }
}

class _GroupEmptyState extends StatelessWidget {
  const _GroupEmptyState({required this.message});

  final String message;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            Icons.groups_2_outlined,
            size: 64,
            color: Theme.of(context)
                .colorScheme
                .onSurfaceVariant
                .withValues(alpha: 0.48),
          ),
          const SizedBox(height: 14),
          Text(
            message,
            style: Theme.of(context).textTheme.titleMedium?.copyWith(
                  color: Theme.of(context).colorScheme.onSurfaceVariant,
                  fontWeight: FontWeight.w700,
                ),
          ),
        ],
      ),
    );
  }
}

class _GroupErrorState extends StatelessWidget {
  const _GroupErrorState({required this.message, required this.onRetry});

  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final loc = AppLocalizations.of(context)!;
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            Icons.error_outline,
            size: 64,
            color: Theme.of(context).colorScheme.error.withValues(alpha: 0.48),
          ),
          const SizedBox(height: 14),
          Text(
            message,
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.titleMedium?.copyWith(
                  color: Theme.of(context).colorScheme.onSurfaceVariant,
                  fontWeight: FontWeight.w700,
                ),
          ),
          const SizedBox(height: 14),
          OutlinedButton(
            onPressed: onRetry,
            child: Text(loc.retry),
          ),
        ],
      ),
    );
  }
}

class _GroupDetailPlaceholder extends StatelessWidget {
  const _GroupDetailPlaceholder({
    required this.message,
    required this.subMessage,
  });

  final String message;
  final String subMessage;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Container(
        constraints: const BoxConstraints(maxWidth: 360),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              Icons.forum_outlined,
              size: 64,
              color: imGlassBrand.withValues(alpha: 0.62),
            ),
            const SizedBox(height: 14),
            Text(
              message,
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.w800,
                  ),
            ),
            const SizedBox(height: 6),
            Text(
              subMessage,
              textAlign: TextAlign.center,
              style: TextStyle(
                color: Theme.of(context).colorScheme.onSurfaceVariant,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
