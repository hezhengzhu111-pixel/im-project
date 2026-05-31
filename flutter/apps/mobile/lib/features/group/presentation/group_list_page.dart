import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../auth/auth.dart';
import 'group_providers.dart';

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
      final userId = ref.read(currentUserIdProvider);
      if (userId != null) {
        ref.read(groupStateProvider.notifier).loadGroups(userId);
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final groupState = ref.watch(groupStateProvider);

    return Column(
      children: [
        Container(
          padding: const EdgeInsets.all(16),
          child: Row(
            children: [
              const Expanded(
                child: Text(
                  '群组',
                  style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
                ),
              ),
              IconButton(
                icon: const Icon(Icons.group_add),
                onPressed: () {
                  // TODO: 打开创建群组页面
                },
              ),
            ],
          ),
        ),
        const Divider(height: 1),
        Expanded(
          child: groupState.groups.isEmpty
              ? const Center(child: Text('暂无群组'))
              : ListView.builder(
                  itemCount: groupState.groups.length,
                  itemBuilder: (context, index) {
                    final group = groupState.groups[index];
                    return ListTile(
                      leading: CircleAvatar(
                        child: Text(
                          group.name.isNotEmpty ? group.name[0] : '?',
                        ),
                      ),
                      title: Text(group.name),
                      subtitle: Text('${group.memberCount} 人'),
                    );
                  },
                ),
        ),
      ],
    );
  }
}
