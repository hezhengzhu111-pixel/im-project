import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../contacts/presentation/contacts_providers.dart';
import '../../group/presentation/group_providers.dart';

class CreateGroupPage extends ConsumerStatefulWidget {
  const CreateGroupPage({super.key});

  @override
  ConsumerState<CreateGroupPage> createState() => _CreateGroupPageState();
}

class _CreateGroupPageState extends ConsumerState<CreateGroupPage> {
  final _nameController = TextEditingController();
  final _descController = TextEditingController();
  final _memberIdController = TextEditingController();
  final _formKey = GlobalKey<FormState>();
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
    _memberIdController.dispose();
    super.dispose();
  }

  void _toggleMember(String friendId) {
    setState(() {
      if (_selectedMemberIds.contains(friendId)) {
        _selectedMemberIds.remove(friendId);
      } else {
        _selectedMemberIds.add(friendId);
      }
    });
  }

  void _parseMemberIds() {
    final text = _memberIdController.text.trim();
    if (text.isEmpty) return;
    final ids = text.split(',').map((s) => s.trim()).where((s) => s.isNotEmpty);
    setState(() {
      _selectedMemberIds.addAll(ids);
      _memberIdController.clear();
    });
  }

  Future<void> _createGroup() async {
    if (!_formKey.currentState!.validate()) return;

    final group = await ref.read(groupStateProvider.notifier).createGroup(
          name: _nameController.text.trim(),
          description: _descController.text.trim().isEmpty
              ? null
              : _descController.text.trim(),
          memberIds: _selectedMemberIds.toList(),
        );

    if (group != null && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text(_Strings.createSuccess)),
      );
      Navigator.of(context).pop();
    }
  }

  @override
  Widget build(BuildContext context) {
    final contactsState = ref.watch(contactsStateProvider);
    final groupState = ref.watch(groupStateProvider);
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(
        title: const Text(_Strings.title),
      ),
      body: Form(
        key: _formKey,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            TextFormField(
              controller: _nameController,
              decoration: const InputDecoration(
                labelText: _Strings.nameLabel,
                border: OutlineInputBorder(),
              ),
              validator: (value) {
                if (value == null || value.trim().isEmpty) {
                  return _Strings.nameRequired;
                }
                return null;
              },
            ),
            const SizedBox(height: 16),
            TextFormField(
              controller: _descController,
              decoration: const InputDecoration(
                labelText: _Strings.descLabel,
                border: OutlineInputBorder(),
              ),
              maxLines: 2,
            ),
            const SizedBox(height: 16),
            Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _memberIdController,
                    decoration: const InputDecoration(
                      labelText: _Strings.memberIdsLabel,
                      hintText: _Strings.memberIdsHint,
                      border: OutlineInputBorder(),
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                IconButton(
                  onPressed: _parseMemberIds,
                  icon: const Icon(Icons.add),
                  tooltip: _Strings.addMemberIds,
                ),
              ],
            ),
            const SizedBox(height: 24),
            Text(
              _Strings.selectMembers,
              style: theme.textTheme.titleSmall,
            ),
            const SizedBox(height: 8),
            if (contactsState.isLoading)
              const Center(child: CircularProgressIndicator())
            else if (contactsState.friends.isEmpty)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 16),
                child: Text(_Strings.noFriends),
              )
            else
              ...contactsState.friends.map(
                (friend) => CheckboxListTile(
                  value: _selectedMemberIds.contains(friend.friendId),
                  onChanged: (_) => _toggleMember(friend.friendId),
                  title: Text(friend.nickname ?? friend.username),
                  secondary: CircleAvatar(
                    backgroundImage: friend.avatar != null
                        ? NetworkImage(friend.avatar!)
                        : null,
                    child: friend.avatar == null
                        ? Text(
                            (friend.nickname ?? friend.username).isNotEmpty
                                ? (friend.nickname ?? friend.username)[0]
                                    .toUpperCase()
                                : '?',
                          )
                        : null,
                  ),
                ),
              ),
            if (_selectedMemberIds.isNotEmpty) ...[
              const SizedBox(height: 8),
              Text(
                '${_Strings.selectedCount}${_selectedMemberIds.length}',
                style: theme.textTheme.bodySmall,
              ),
            ],
            const SizedBox(height: 24),
            if (groupState.error != null)
              Padding(
                padding: const EdgeInsets.only(bottom: 16),
                child: Text(
                  groupState.error!,
                  style: TextStyle(color: theme.colorScheme.error),
                ),
              ),
            SizedBox(
              width: double.infinity,
              height: 48,
              child: ElevatedButton(
                onPressed: groupState.isLoading ? null : _createGroup,
                child: groupState.isLoading
                    ? const SizedBox(
                        width: 20,
                        height: 20,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Text(_Strings.createButton),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Strings {
  _Strings._();
  static const title = 'Create Group';
  static const nameLabel = 'Group Name';
  static const nameRequired = 'Group name is required';
  static const descLabel = 'Description (optional)';
  static const memberIdsLabel = 'Member IDs';
  static const memberIdsHint = 'Comma-separated user IDs';
  static const addMemberIds = 'Add member IDs';
  static const selectMembers = 'Select from contacts';
  static const noFriends = 'No contacts available';
  static const selectedCount = 'Selected members: ';
  static const createButton = 'Create Group';
  static const createSuccess = 'Group created successfully';
}
