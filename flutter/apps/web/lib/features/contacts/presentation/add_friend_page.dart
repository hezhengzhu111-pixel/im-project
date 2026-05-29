import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:im_core/core.dart';
import 'package:im_ui/im_ui.dart';
import 'package:im_web/core/di/providers.dart';
import 'package:im_web/l10n/app_localizations.dart';

class AddFriendPage extends ConsumerStatefulWidget {
  const AddFriendPage({super.key});

  @override
  ConsumerState<AddFriendPage> createState() => _AddFriendPageState();
}

class _AddFriendPageState extends ConsumerState<AddFriendPage> {
  final _searchController = TextEditingController();
  final _requestMessageController = TextEditingController();
  Timer? _debounce;
  List<User> _results = [];
  bool _isSearching = false;
  String? _error;
  User? _selectedUser;
  bool _isSending = false;
  String _searchType = 'username';
  bool _requestMessageInitialized = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (!_requestMessageInitialized) {
      _requestMessageController.text =
          AppLocalizations.of(context)!.contactsFriendRequestReason;
      _requestMessageInitialized = true;
    }
  }

  @override
  void dispose() {
    _searchController.dispose();
    _requestMessageController.dispose();
    _debounce?.cancel();
    super.dispose();
  }

  bool _isFriend(String userId) {
    final contactsState = ref.read(contactsStateProvider);
    return contactsState.friends.any((f) => f.friendId == userId);
  }

  bool _hasSentRequest(String userId) {
    final contactsState = ref.read(contactsStateProvider);
    return contactsState.sentRequestUserIds.contains(userId);
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
          .searchUsers(keyword, type: _searchType);
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
          _error = AppLocalizations.of(context)!.addFriendSearchFailed;
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
            reason: _requestMessageController.text,
          );
      if (mounted) {
        ref.read(contactsStateProvider.notifier).markRequestSent(user.id);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              AppLocalizations.of(context)!
                  .addFriendRequestSent(user.nickname ?? user.username),
            ),
          ),
        );
        setState(() {
          _selectedUser = null;
          _requestMessageController.text =
              AppLocalizations.of(context)!.contactsFriendRequestReason;
        });
      }
    } catch (e) {
      if (mounted) {
        final msg = e.toString();
        const duplicateRequestBackendMarker =
            '\u5df2\u6709\u5f85\u5904\u7406\u7684\u597d\u53cb\u7533\u8bf7';
        if (msg.contains(duplicateRequestBackendMarker)) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(
                AppLocalizations.of(context)!.addFriendRequestDuplicate,
              ),
            ),
          );
          ref.read(contactsStateProvider.notifier).markRequestSent(user.id);
        } else {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content:
                  Text(AppLocalizations.of(context)!.addFriendRequestFailed),
            ),
          );
        }
      }
    } finally {
      if (mounted) setState(() => _isSending = false);
    }
  }

  InputDecoration _searchInputDecoration(AppLocalizations loc) {
    return InputDecoration(
      hintText: _searchType == 'username'
          ? loc.addFriendSearchHint
          : _searchType == 'email'
              ? loc.addFriendSearchByEmail
              : loc.addFriendSearchByPhone,
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
    );
  }

  @override
  Widget build(BuildContext context) {
    final loc = AppLocalizations.of(context)!;
    return Scaffold(
      appBar: AppBar(
        title: Text(loc.addFriendTitle),
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(ImTokens.layoutPanelPadding),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                SegmentedButton<String>(
                  segments: [
                    ButtonSegment(
                      value: 'username',
                      label: Text(loc.addFriendTypeUsername),
                    ),
                    ButtonSegment(
                      value: 'email',
                      label: Text(loc.addFriendTypeEmail),
                    ),
                    ButtonSegment(
                      value: 'phone',
                      label: Text(loc.addFriendTypePhone),
                    ),
                  ],
                  selected: {_searchType},
                  onSelectionChanged: (selection) {
                    setState(() => _searchType = selection.first);
                    if (_searchController.text.isNotEmpty) {
                      _performSearch(_searchController.text.trim());
                    }
                  },
                ),
                const SizedBox(height: ImTokens.layoutItemGap),
                TextField(
                  controller: _searchController,
                  onChanged: _onSearchChanged,
                  decoration: _searchInputDecoration(loc),
                ),
                if (_selectedUser != null &&
                    !_isFriend(_selectedUser!.id) &&
                    !_hasSentRequest(_selectedUser!.id)) ...[
                  const SizedBox(height: ImTokens.layoutItemGap),
                  TextField(
                    controller: _requestMessageController,
                    decoration: InputDecoration(
                      hintText: loc.addFriendVerificationHint,
                      border: const OutlineInputBorder(),
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
              padding: EdgeInsets.all(ImTokens.layoutPanelPadding),
              child: CircularProgressIndicator(),
            ),
          if (_error != null)
            Padding(
              padding: const EdgeInsets.all(ImTokens.layoutPanelPadding),
              child: Text(
                _error!,
                style: TextStyle(color: Theme.of(context).colorScheme.error),
              ),
            ),
          if (!_isSearching &&
              _error == null &&
              _results.isEmpty &&
              _searchController.text.isNotEmpty)
            Padding(
              padding: const EdgeInsets.all(ImTokens.space8),
              child: Text(
                loc.addFriendNoMatch,
                style: TextStyle(
                  color: Theme.of(context).colorScheme.onSurfaceVariant,
                ),
              ),
            ),
          if (!_isSearching &&
              _error == null &&
              _results.isEmpty &&
              _searchController.text.isEmpty)
            Padding(
              padding: const EdgeInsets.all(ImTokens.space8),
              child: Text(
                loc.addFriendSearchPrompt,
                style: TextStyle(
                  color: Theme.of(context).colorScheme.onSurfaceVariant,
                ),
              ),
            ),
          Expanded(
            child: ListView.builder(
              itemCount: _results.length,
              itemBuilder: (context, index) {
                final user = _results[index];
                final isAlreadyFriend = _isFriend(user.id);
                final hasSent = _hasSentRequest(user.id);
                final canSend = !isAlreadyFriend && !hasSent;
                return ListTile(
                  leading: CircleAvatar(
                    backgroundImage:
                        user.avatar != null ? NetworkImage(user.avatar!) : null,
                    child: user.avatar == null
                        ? Text(
                            (user.nickname ?? user.username)
                                .substring(0, 1)
                                .toUpperCase(),
                            style: const TextStyle(fontSize: ImTokens.textBase),
                          )
                        : null,
                  ),
                  title: Text(
                    user.nickname ?? user.username,
                    style: const TextStyle(fontWeight: FontWeight.w500),
                  ),
                  subtitle: _buildSubtitle(user),
                  trailing: _buildTrailing(
                    user,
                    isAlreadyFriend,
                    hasSent,
                    canSend,
                    loc,
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

  Widget? _buildSubtitle(User user) {
    final parts = <String>[];
    parts.add('@${user.username}');
    if (user.email != null && user.email!.isNotEmpty) {
      parts.add(user.email!);
    }
    if (user.phone != null && user.phone!.isNotEmpty) {
      parts.add(user.phone!);
    }
    return Text(
      parts.join(' / '),
      style: TextStyle(color: Theme.of(context).colorScheme.onSurfaceVariant),
    );
  }

  Widget _buildTrailing(
    User user,
    bool isAlreadyFriend,
    bool hasSent,
    bool canSend,
    AppLocalizations loc,
  ) {
    if (isAlreadyFriend) {
      return Chip(
        label: Text(loc.addFriendAlreadyFriend),
        visualDensity: VisualDensity.compact,
      );
    }
    if (hasSent) {
      return Tooltip(
        message: loc.addFriendRequestDuplicate,
        child: const Icon(Icons.check_circle_outline),
      );
    }
    return FilledButton.tonal(
      onPressed: _isSending && _selectedUser?.id == user.id
          ? null
          : () => _sendRequest(user),
      child: _isSending && _selectedUser?.id == user.id
          ? const SizedBox(
              width: 16,
              height: 16,
              child: CircularProgressIndicator(strokeWidth: 2),
            )
          : Text(loc.addFriendButton),
    );
  }
}
