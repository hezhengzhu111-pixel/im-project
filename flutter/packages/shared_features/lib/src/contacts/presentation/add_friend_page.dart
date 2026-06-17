import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:im_core/core.dart';
import '../../auth/presentation/auth_providers.dart';
import '../../contacts/presentation/contacts_provider.dart';
import '../../contacts/presentation/contacts_providers.dart';

class AddFriendPage extends ConsumerStatefulWidget {
  const AddFriendPage({super.key});

  @override
  ConsumerState<AddFriendPage> createState() => _AddFriendPageState();
}

class _AddFriendPageState extends ConsumerState<AddFriendPage> {
  final _searchController = TextEditingController();
  final _reasonController = TextEditingController();
  Timer? _debounce;
  List<User> _results = [];
  bool _isSearching = false;
  String? _error;
  User? _selectedUser;
  bool _isSending = false;

  @override
  void initState() {
    super.initState();
    _reasonController.text = _Strings.defaultReason;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final contactsState = ref.read(contactsStateProvider);
      if (!contactsState.isLoading &&
          contactsState.friends.isEmpty &&
          contactsState.friendRequests.isEmpty) {
        ref.read(contactsStateProvider.notifier).loadFriends();
      }
    });
  }

  @override
  void dispose() {
    _searchController.dispose();
    _reasonController.dispose();
    _debounce?.cancel();
    super.dispose();
  }

  bool _isFriend(ContactsState contactsState, String userId) {
    return contactsState.friends.any((f) => f.friendId == userId);
  }

  bool _isCurrentUser(String userId) {
    return ref.read(currentUserIdProvider) == userId;
  }

  bool _hasSentRequest(ContactsState contactsState, String userId) {
    final currentUserId = ref.read(currentUserIdProvider);
    if (currentUserId == null || currentUserId.isEmpty) return false;

    final pendingOutgoing = contactsState.friendRequests.any(
      (r) =>
          r.status == 'PENDING' &&
          r.applicantId == currentUserId &&
          r.targetUserId == userId,
    );
    return pendingOutgoing || contactsState.sentRequestUserIds.contains(userId);
  }

  void _onSearchChanged(String keyword) {
    _debounce?.cancel();
    if (keyword.trim().isEmpty) {
      setState(() {
        _results = [];
        _selectedUser = null;
        _error = null;
      });
      return;
    }
    _debounce = Timer(const Duration(milliseconds: 500), () {
      _performSearch(keyword.trim());
    });
  }

  Future<void> _performSearch(String keyword) async {
    setState(() {
      _isSearching = true;
      _error = null;
    });
    try {
      final results = await ref
          .read(contactsStateProvider.notifier)
          .searchUsers(keyword);
      if (mounted) {
        setState(() {
          _results = results;
          _isSearching = false;
          _selectedUser = results.isNotEmpty ? results.first : null;
        });
      }
    } catch (_) {
      if (mounted) {
        setState(() {
          _isSearching = false;
          _error = _Strings.searchFailed;
        });
      }
    }
  }

  Future<void> _sendRequest(User user) async {
    if (_isSending) return;
    setState(() => _isSending = true);
    try {
      await ref.read(contactsStateProvider.notifier).sendFriendRequest(
            user.id,
            reason: _reasonController.text,
          );
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              '${_Strings.requestSentPrefix}${user.nickname ?? user.username}',
            ),
          ),
        );
      }
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text(_Strings.requestFailed)),
        );
      }
    } finally {
      if (mounted) setState(() => _isSending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final contactsState = ref.watch(contactsStateProvider);
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(
        title: const Text(_Strings.title),
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                TextField(
                  controller: _searchController,
                  onChanged: _onSearchChanged,
                  decoration: InputDecoration(
                    hintText: _Strings.searchHint,
                    prefixIcon: const Icon(Icons.search),
                    border: const OutlineInputBorder(),
                    suffixIcon: _searchController.text.isNotEmpty
                        ? IconButton(
                            icon: const Icon(Icons.clear),
                            onPressed: () {
                              _searchController.clear();
                              setState(() {
                                _results = [];
                                _selectedUser = null;
                                _error = null;
                              });
                            },
                          )
                        : null,
                  ),
                ),
                if (_selectedUser != null &&
                    !_isCurrentUser(_selectedUser!.id) &&
                    !_isFriend(contactsState, _selectedUser!.id) &&
                    !_hasSentRequest(contactsState, _selectedUser!.id)) ...[
                  const SizedBox(height: 8),
                  TextField(
                    controller: _reasonController,
                    decoration: const InputDecoration(
                      hintText: _Strings.reasonHint,
                      border: OutlineInputBorder(),
                      counterText: '',
                    ),
                    maxLength: 100,
                    maxLines: 2,
                  ),
                ],
              ],
            ),
          ),
          if (_isSearching)
            const Padding(
              padding: EdgeInsets.all(16),
              child: CircularProgressIndicator(),
            ),
          if (_error != null)
            Padding(
              padding: const EdgeInsets.all(16),
              child: Text(
                _error!,
                style: TextStyle(color: theme.colorScheme.error),
              ),
            ),
          if (!_isSearching &&
              _error == null &&
              _results.isEmpty &&
              _searchController.text.isNotEmpty)
            Padding(
              padding: const EdgeInsets.all(8),
              child: Text(
                _Strings.noMatch,
                style: TextStyle(
                  color: theme.colorScheme.onSurfaceVariant,
                ),
              ),
            ),
          if (!_isSearching &&
              _error == null &&
              _results.isEmpty &&
              _searchController.text.isEmpty)
            Padding(
              padding: const EdgeInsets.all(8),
              child: Text(
                _Strings.searchPrompt,
                style: TextStyle(
                  color: theme.colorScheme.onSurfaceVariant,
                ),
              ),
            ),
          Expanded(
            child: ListView.builder(
              itemCount: _results.length,
              itemBuilder: (context, index) {
                final user = _results[index];
                final isAlreadyFriend = _isFriend(contactsState, user.id);
                final hasSent = _hasSentRequest(contactsState, user.id);
                final isSelf = _isCurrentUser(user.id);

                return ListTile(
                  selected: _selectedUser?.id == user.id,
                  leading: CircleAvatar(
                    backgroundImage: user.avatar != null
                        ? NetworkImage(user.avatar!)
                        : null,
                    child: user.avatar == null
                        ? Text(
                            (user.nickname ?? user.username)
                                .substring(0, 1)
                                .toUpperCase(),
                          )
                        : null,
                  ),
                  title: Text(
                    user.nickname ?? user.username,
                    style: const TextStyle(fontWeight: FontWeight.w500),
                  ),
                  subtitle: Text(
                    '@${user.username}',
                    style: TextStyle(
                      color: theme.colorScheme.onSurfaceVariant,
                    ),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  trailing: _buildTrailing(
                    user,
                    isSelf,
                    isAlreadyFriend,
                    hasSent,
                    theme,
                  ),
                  onTap: () {
                    setState(() => _selectedUser = user);
                  },
                );
              },
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildTrailing(
    User user,
    bool isSelf,
    bool isAlreadyFriend,
    bool hasSent,
    ThemeData theme,
  ) {
    if (isSelf) {
      return const Chip(
        label: Text(_Strings.self),
        visualDensity: VisualDensity.compact,
      );
    }
    if (isAlreadyFriend) {
      return const Chip(
        label: Text(_Strings.alreadyFriend),
        visualDensity: VisualDensity.compact,
      );
    }
    if (hasSent) {
      return const Chip(
        avatar: Icon(Icons.schedule_outlined, size: 16),
        label: Text(_Strings.pending),
        visualDensity: VisualDensity.compact,
      );
    }
    return ElevatedButton(
      onPressed:
          _isSending && _selectedUser?.id == user.id ? null : () => _sendRequest(user),
      child: _isSending && _selectedUser?.id == user.id
          ? const SizedBox(
              width: 16,
              height: 16,
              child: CircularProgressIndicator(strokeWidth: 2),
            )
          : const Text(_Strings.addButton),
    );
  }
}

class _Strings {
  _Strings._();
  static const title = 'Add Friend';
  static const searchHint = 'Search by username';
  static const reasonHint = 'Verification message (optional)';
  static const searchPrompt = 'Enter a username to search';
  static const noMatch = 'No users found';
  static const searchFailed = 'Search failed. Please try again.';
  static const requestSentPrefix = 'Request sent to ';
  static const requestFailed = 'Failed to send request';
  static const defaultReason = 'Hi, I would like to add you as a friend.';
  static const self = 'You';
  static const alreadyFriend = 'Already friend';
  static const pending = 'Pending';
  static const addButton = 'Add';
}
