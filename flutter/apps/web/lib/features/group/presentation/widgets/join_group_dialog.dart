import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:im_core/core.dart';
import 'package:im_web/core/di/providers.dart';
import '../group_provider.dart';

class JoinGroupDialog extends ConsumerStatefulWidget {
  const JoinGroupDialog({super.key});

  @override
  ConsumerState<JoinGroupDialog> createState() => _JoinGroupDialogState();
}

class _JoinGroupDialogState extends ConsumerState<JoinGroupDialog> {
  final _searchController = TextEditingController();
  Timer? _debounceTimer;
  bool _isJoining = false;

  @override
  void dispose() {
    _searchController.dispose();
    _debounceTimer?.cancel();
    super.dispose();
  }

  void _onSearchChanged(String query) {
    _debounceTimer?.cancel();
    _debounceTimer = Timer(const Duration(milliseconds: 300), () {
      ref.read(groupStateProvider.notifier).searchGroups(query);
    });
  }

  Future<void> _joinGroup(Group group) async {
    if (_isJoining) return;
    setState(() => _isJoining = true);

    final success = await ref.read(groupStateProvider.notifier).joinGroup(group.id);

    if (mounted) {
      setState(() => _isJoining = false);
      final messenger = ScaffoldMessenger.of(context);
      if (success) {
        messenger.showSnackBar(
          SnackBar(content: Text('已加入 ${group.name}')),
        );
        // Reload groups list
        final userId = ref.read(authStateProvider).user?.id;
        if (userId != null) {
          ref.read(groupStateProvider.notifier).loadGroups(userId);
        }
      } else {
        messenger.showSnackBar(
          const SnackBar(content: Text('加入失败，请重试')),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final groupState = ref.watch(groupStateProvider);

    return Dialog(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 400, maxHeight: 500),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            children: [
              Text(
                '加入群聊',
                style: Theme.of(context).textTheme.titleLarge,
              ),
              const SizedBox(height: 16),
              TextField(
                controller: _searchController,
                onChanged: _onSearchChanged,
                decoration: InputDecoration(
                  hintText: '搜索群组名称...',
                  prefixIcon: const Icon(Icons.search),
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(8),
                  ),
                ),
              ),
              const SizedBox(height: 16),
              Expanded(
                child: _buildSearchResults(groupState),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildSearchResults(GroupState groupState) {
    if (groupState.isLoading) {
      return const Center(child: CircularProgressIndicator());
    }

    final results = groupState.searchResults;
    if (results.isEmpty) {
      return Center(
        child: Text(
          _searchController.text.isEmpty
              ? '输入关键词搜索群组'
              : '未找到匹配的群组',
        ),
      );
    }

    return ListView.builder(
      itemCount: results.length,
      itemBuilder: (context, index) {
        final group = results[index];
        return ListTile(
          leading: CircleAvatar(
            backgroundImage:
                group.avatar != null ? NetworkImage(group.avatar!) : null,
            child: group.avatar == null
                ? Text(group.name.isNotEmpty ? group.name[0] : '?')
                : null,
          ),
          title: Text(group.name),
          subtitle: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (group.description != null && group.description!.isNotEmpty)
                Text(
                  group.description!,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              if (group.memberCount != null)
                Text('${group.memberCount} 成员'),
            ],
          ),
          trailing: _isJoining
              ? const SizedBox(
                  width: 24,
                  height: 24,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              : TextButton(
                  onPressed: () => _joinGroup(group),
                  child: const Text('加入'),
                ),
        );
      },
    );
  }
}
