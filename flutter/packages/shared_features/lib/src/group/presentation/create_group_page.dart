import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:im_l10n/im_l10n.dart';
import 'package:im_shared_features/chat.dart';
import 'package:im_shared_features/contacts.dart';
import 'package:im_ui/im_ui.dart';
import 'group_providers.dart';

class CreateGroupPage extends ConsumerStatefulWidget {
  const CreateGroupPage({super.key});

  @override
  ConsumerState<CreateGroupPage> createState() => _CreateGroupPageState();
}

class _CreateGroupPageState extends ConsumerState<CreateGroupPage> {
  final _nameController = TextEditingController();
  final _avatarController = TextEditingController();
  final _descController = TextEditingController();
  final Set<String> _selectedMemberIds = {};

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      ref.read(contactsStateProvider.notifier).loadFriends();
    });
  }

  @override
  void dispose() {
    _nameController.dispose();
    _avatarController.dispose();
    _descController.dispose();
    super.dispose();
  }

  Future<void> _createGroup() async {
    final loc = AppLocalizations.of(context)!;
    final name = _nameController.text.trim();
    if (name.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(loc.validationRequired)),
      );
      return;
    }
    if (_selectedMemberIds.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(loc.groupCreateNeedMembers)),
      );
      return;
    }

    final group = await ref.read(groupStateProvider.notifier).createGroup(
          name: name,
          avatar: _avatarController.text.trim().isEmpty
              ? null
              : _avatarController.text.trim(),
          description: _descController.text.trim().isEmpty
              ? null
              : _descController.text.trim(),
          memberIds: _selectedMemberIds.toList(),
        );

    if (!mounted) return;
    if (group != null) {
      final notifier = ref.read(groupStateProvider.notifier);
      notifier.clearError();
      final sessionKey =
          ref.read(chatStateProvider.notifier).getGroupSessionKey(group.id);
      ref.read(chatStateProvider.notifier).setActiveSession(sessionKey);
      unawaited(ref.read(chatStateProvider.notifier).loadGroupMessages(group.id));
      context.go('/chat');
    } else {
      final error = ref.read(groupStateProvider).error;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(error ?? loc.groupCreateFailed),
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final loc = AppLocalizations.of(context)!;
    final contactsState = ref.watch(contactsStateProvider);
    final groupState = ref.watch(groupStateProvider);

    return Scaffold(
      backgroundColor: Colors.transparent, // 让外层渐变背景透出
      appBar: AppBar(
        title: Text(loc.groupCreateTitle),
        actions: [
          GradientTextButton(
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
        padding: const EdgeInsets.all(ImTokens.space4),
        children: [
          TextField(
            controller: _nameController,
            decoration: InputDecoration(
              labelText: loc.groupNameLabel,
              border: const OutlineInputBorder(),
            ),
          ),
          const SizedBox(height: ImTokens.space4),
          TextField(
            controller: _avatarController,
            decoration: InputDecoration(
              labelText: loc.groupAvatarLabel,
              border: const OutlineInputBorder(),
            ),
          ),
          const SizedBox(height: ImTokens.space4),
          TextField(
            controller: _descController,
            decoration: InputDecoration(
              labelText: loc.groupDescLabel,
              border: const OutlineInputBorder(),
            ),
            maxLines: 2,
          ),
          const SizedBox(height: ImTokens.space6),
          Text(loc.groupSelectMembers,
              style: Theme.of(context).textTheme.titleSmall),
          const SizedBox(height: ImTokens.space2),
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
