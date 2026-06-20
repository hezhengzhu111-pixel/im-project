import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:im_core/core.dart';
import 'package:im_l10n/im_l10n.dart';
import 'package:im_shared_features/auth.dart';
import '../group_provider.dart';
import '../group_providers.dart';

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

    final success =
        await ref.read(groupStateProvider.notifier).joinGroup(group.id);

    if (mounted) {
      final loc = AppLocalizations.of(context)!;
      setState(() => _isJoining = false);
      final messenger = ScaffoldMessenger.of(context);
      if (success) {
        messenger.showSnackBar(
          SnackBar(content: Text(loc.joinGroupSuccess(group.name))),
        );
        // Reload groups list
        final userId = ref.read(authStateProvider).user?.id;
        if (userId != null) {
          ref.read(groupStateProvider.notifier).loadGroups(userId);
        }
      } else {
        messenger.showSnackBar(
          SnackBar(content: Text(loc.joinGroupError)),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final loc = AppLocalizations.of(context)!;
    final groupState = ref.watch(groupStateProvider);

    return Dialog(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 400, maxHeight: 500),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            children: [
              Text(
                loc.joinGroup,
                style: Theme.of(context).textTheme.titleLarge,
              ),
              const SizedBox(height: 16),
              TextField(
                controller: _searchController,
                onChanged: _onSearchChanged,
                decoration: InputDecoration(
                  hintText: loc.joinGroupSearchHint,
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
    final loc = AppLocalizations.of(context)!;

    if (groupState.isLoading) {
      return const Center(child: CircularProgressIndicator());
    }

    final results = groupState.searchResults;
    if (results.isEmpty) {
      return Center(
        child: Text(
          _searchController.text.isEmpty
              ? loc.joinGroupInputHint
              : loc.joinGroupNoResults,
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
                Text(loc.joinGroupMembers(group.memberCount!)),
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
                  child: Text(loc.joinGroup),
                ),
        );
      },
    );
  }
}
