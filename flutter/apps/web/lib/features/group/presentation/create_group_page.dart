import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:im_web/core/di/providers.dart';
import 'package:im_web/features/contacts/presentation/contacts_provider.dart';
import 'package:im_web/l10n/app_localizations.dart';

class CreateGroupPage extends ConsumerStatefulWidget {
  const CreateGroupPage({super.key});

  @override
  ConsumerState<CreateGroupPage> createState() => _CreateGroupPageState();
}

class _CreateGroupPageState extends ConsumerState<CreateGroupPage> {
  final _nameController = TextEditingController();
  final _descController = TextEditingController();
  final Set<String> _selectedMemberIds = {};

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      ref.read(contactsStateProvider.notifier).loadFriends();
    });
  }

  @override
  void dispose() {
    _nameController.dispose();
    _descController.dispose();
    super.dispose();
  }

  Future<void> _createGroup() async {
    final name = _nameController.text.trim();
    if (name.isEmpty) return;

    final group = await ref.read(groupStateProvider.notifier).createGroup(
          name: name,
          description: _descController.text.trim().isEmpty
              ? null
              : _descController.text.trim(),
          memberIds: _selectedMemberIds.toList(),
        );

    if (group != null && mounted) {
      context.pop();
    }
  }

  @override
  Widget build(BuildContext context) {
    final loc = AppLocalizations.of(context)!;
    final contactsState = ref.watch(contactsStateProvider);
    final groupState = ref.watch(groupStateProvider);

    return Scaffold(
      appBar: AppBar(
        title: Text(loc.groupCreateTitle),
        actions: [
          TextButton(
            onPressed: groupState.isLoading ? null : _createGroup,
            child: groupState.isLoading
                ? const SizedBox(
                    width: 20,
                    height: 20,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : Text(loc.groupCreateButton),
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          TextField(
            controller: _nameController,
            decoration: InputDecoration(
              labelText: loc.groupNameLabel,
              border: const OutlineInputBorder(),
            ),
          ),
          const SizedBox(height: 16),
          TextField(
            controller: _descController,
            decoration: InputDecoration(
              labelText: loc.groupDescLabel,
              border: const OutlineInputBorder(),
            ),
            maxLines: 2,
          ),
          const SizedBox(height: 24),
          Text(loc.groupSelectMembers, style: Theme.of(context).textTheme.titleSmall),
          const SizedBox(height: 8),
          ...contactsState.friends.map((friend) => CheckboxListTile(
                value: _selectedMemberIds.contains(friend.friendId),
                onChanged: (checked) {
                  setState(() {
                    if (checked == true) {
                      _selectedMemberIds.add(friend.friendId);
                    } else {
                      _selectedMemberIds.remove(friend.friendId);
                    }
                  });
                },
                title: Text(friend.nickname ?? friend.username),
                secondary: CircleAvatar(
                  backgroundImage: friend.avatar != null
                      ? NetworkImage(friend.avatar!)
                      : null,
                  child: friend.avatar == null
                      ? Text(
                          (friend.nickname ?? friend.username).isNotEmpty
                              ? (friend.nickname ?? friend.username)[0]
                              : '?',
                        )
                      : null,
                ),
              )),
        ],
      ),
    );
  }
}
