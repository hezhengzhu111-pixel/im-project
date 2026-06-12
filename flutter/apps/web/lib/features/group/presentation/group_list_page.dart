import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:im_ui/im_ui.dart';
import 'package:im_web/core/di/providers.dart';
import 'package:im_web/l10n/app_localizations.dart';
import 'widgets/group_tile.dart';
import 'widgets/join_group_dialog.dart';

class GroupListPage extends ConsumerStatefulWidget {
  const GroupListPage({super.key});

  @override
  ConsumerState<GroupListPage> createState() => _GroupListPageState();
}

class _GroupListPageState extends ConsumerState<GroupListPage> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final userId = ref.read(authStateProvider).user?.id;
      if (userId != null) {
        ref.read(groupStateProvider.notifier).loadGroups(userId);
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final loc = AppLocalizations.of(context)!;
    final groupState = ref.watch(groupStateProvider);

    return Padding(
      padding: const EdgeInsets.all(16),
      child: Row(
        children: [
          SizedBox(
            width: context.isCompact ? 0 : 304,
            child: context.isCompact
                ? const SizedBox.shrink()
                : GlassPanel(
                    child: _GroupListPanel(
                      groups: groupState.groups,
                      isLoading: groupState.isLoading,
                      onGroupTap: _openGroupChat,
                    ),
                  ),
          ),
          if (!context.isCompact) const SizedBox(width: 18),
          Expanded(
            child: GlassPanel(
              padding: const EdgeInsets.all(24),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Text(
                        loc.navGroups,
                        style:
                            Theme.of(context).textTheme.headlineSmall?.copyWith(
                                  fontWeight: FontWeight.w800,
                                ),
                      ),
                      const Spacer(),
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
                  const SizedBox(height: 18),
                  Expanded(
                    child: groupState.isLoading
                        ? const Center(child: CircularProgressIndicator())
                        : groupState.groups.isEmpty
                            ? _GroupEmptyState(message: loc.groupNoGroups)
                            : context.isCompact
                                ? _GroupListPanel(
                                    groups: groupState.groups,
                                    isLoading: false,
                                    onGroupTap: _openGroupChat,
                                  )
                                : _GroupDetailPlaceholder(
                                    count: groupState.groups.length,
                                  ),
                  ),
                ],
              ),
            ),
          ),
          if (context.isLarge) ...[
            const SizedBox(width: 18),
            SizedBox(
              width: 304,
              child: GlassPanel(
                padding: const EdgeInsets.all(18),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      '今日概览',
                      style: Theme.of(context).textTheme.titleMedium?.copyWith(
                            fontWeight: FontWeight.w800,
                          ),
                    ),
                    const SizedBox(height: 16),
                    _GroupStatCard(
                      label: loc.navGroups,
                      value: '${groupState.groups.length}',
                    ),
                    const SizedBox(height: 18),
                    Text(
                      '最近互动',
                      style: Theme.of(context).textTheme.titleMedium?.copyWith(
                            fontWeight: FontWeight.w800,
                          ),
                    ),
                    const SizedBox(height: 12),
                    Expanded(
                      child: groupState.groups.isEmpty
                          ? Center(child: Text(loc.groupNoGroups))
                          : ListView(
                              children: groupState.groups.take(6).map((group) {
                                return ListTile(
                                  contentPadding: EdgeInsets.zero,
                                  leading: CircleAvatar(
                                    backgroundImage: group.avatar != null
                                        ? NetworkImage(group.avatar!)
                                        : null,
                                    child: group.avatar == null
                                        ? Text(group.name.isNotEmpty
                                            ? group.name[0]
                                            : '?')
                                        : null,
                                  ),
                                  title: Text(
                                    group.name,
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                  ),
                                  subtitle:
                                      Text('${group.memberCount ?? 0} members'),
                                );
                              }).toList(),
                            ),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }

  void _openGroupChat(dynamic group) {
    final sessionKey =
        ref.read(chatStateProvider.notifier).getGroupSessionKey(group.id);
    ref.read(chatStateProvider.notifier).setActiveSession(sessionKey);
    ref.read(chatStateProvider.notifier).loadGroupMessages(group.id);
    context.go('/chat');
  }
}

class _GroupListPanel extends StatelessWidget {
  const _GroupListPanel({
    required this.groups,
    required this.isLoading,
    required this.onGroupTap,
  });

  final List<dynamic> groups;
  final bool isLoading;
  final ValueChanged<dynamic> onGroupTap;

  @override
  Widget build(BuildContext context) {
    final loc = AppLocalizations.of(context)!;
    if (isLoading) return const Center(child: CircularProgressIndicator());
    if (groups.isEmpty) return _GroupEmptyState(message: loc.groupNoGroups);
    return ListView.builder(
      padding: const EdgeInsets.all(12),
      itemCount: groups.length,
      itemBuilder: (context, index) {
        final group = groups[index];
        return Padding(
          padding: const EdgeInsets.only(bottom: 8),
          child: HoverLiftCard(
            padding: EdgeInsets.zero,
            onTap: () => onGroupTap(group),
            child: GroupTile(group: group),
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

class _GroupDetailPlaceholder extends StatelessWidget {
  const _GroupDetailPlaceholder({required this.count});

  final int count;

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
              '选择一个群组开始聊天',
              style: Theme.of(context).textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.w800,
                  ),
            ),
            const SizedBox(height: 6),
            Text(
              '当前共有 $count 个群组',
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

class _GroupStatCard extends StatelessWidget {
  const _GroupStatCard({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surface,
        borderRadius: BorderRadius.circular(4),
        border: Border.all(color: Theme.of(context).dividerColor),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            value,
            style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                  color: imGlassBrand,
                  fontWeight: FontWeight.w900,
                ),
          ),
          Text(
            label,
            style: TextStyle(
              color: Theme.of(context).colorScheme.onSurfaceVariant,
            ),
          ),
        ],
      ),
    );
  }
}
