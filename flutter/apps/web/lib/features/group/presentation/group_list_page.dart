import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
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

    return Scaffold(
      appBar: AppBar(
        title: Text(loc.navGroups),
        actions: [
          IconButton(
            icon: const Icon(Icons.search),
            onPressed: () => showDialog(
              context: context,
              builder: (_) => const JoinGroupDialog(),
            ),
            tooltip: '加入群聊',
          ),
          IconButton(
            icon: const Icon(Icons.add),
            onPressed: () => context.push('/groups/create'),
            tooltip: loc.groupCreateTooltip,
          ),
        ],
      ),
      body: groupState.isLoading
          ? const Center(child: CircularProgressIndicator())
          : groupState.groups.isEmpty
              ? Center(child: Text(loc.groupNoGroups))
              : ListView.builder(
                  itemCount: groupState.groups.length,
                  itemBuilder: (context, index) {
                    final group = groupState.groups[index];
                    return GroupTile(
                      group: group,
                      onTap: () {
                        final sessionKey = ref
                            .read(chatStateProvider.notifier)
                            .getGroupSessionKey(group.id);
                        ref
                            .read(chatStateProvider.notifier)
                            .setActiveSession(sessionKey);
                        ref
                            .read(chatStateProvider.notifier)
                            .loadGroupMessages(group.id);
                        context.go('/chat');
                      },
                    );
                  },
                ),
    );
  }
}
