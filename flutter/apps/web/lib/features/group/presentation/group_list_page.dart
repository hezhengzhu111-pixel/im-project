import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:im_web/core/di/providers.dart';
import 'package:im_web/features/auth/presentation/auth_provider.dart';
import 'package:im_web/features/chat/presentation/chat_provider.dart';
import 'widgets/group_tile.dart';

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
    final groupState = ref.watch(groupStateProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('群组'),
        actions: [
          IconButton(
            icon: const Icon(Icons.add),
            onPressed: () => context.push('/groups/create'),
            tooltip: '创建群组',
          ),
        ],
      ),
      body: groupState.isLoading
          ? const Center(child: CircularProgressIndicator())
          : groupState.groups.isEmpty
              ? const Center(child: Text('暂无群组'))
              : ListView.builder(
                  itemCount: groupState.groups.length,
                  itemBuilder: (context, index) {
                    final group = groupState.groups[index];
                    return GroupTile(
                      group: group,
                      onTap: () {
                        ref
                            .read(chatStateProvider.notifier)
                            .setActiveSession(group.id);
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
