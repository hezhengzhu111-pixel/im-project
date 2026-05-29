import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:im_web/core/di/providers.dart';
import 'package:im_web/l10n/app_localizations.dart';
import 'package:im_core/core.dart';
import 'package:im_ui/im_ui.dart';
import 'contacts_provider.dart';
import 'widgets/contacts_toolbar.dart';

class ContactsPage extends ConsumerStatefulWidget {
  const ContactsPage({super.key});

  @override
  ConsumerState<ContactsPage> createState() => _ContactsPageState();
}

class _ContactsPageState extends ConsumerState<ContactsPage>
    with SingleTickerProviderStateMixin {
  late TabController _tabController;
  String _searchKeyword = '';
  ContactsSortMode _sortMode = ContactsSortMode.name;
  final Set<String> _processingRequestIds = <String>{};

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 2, vsync: this);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      ref.read(contactsStateProvider.notifier).loadFriends();
    });
  }

  @override
  Widget build(BuildContext context) {
    final contactsState = ref.watch(contactsStateProvider);
    final loc = AppLocalizations.of(context)!;

    return Column(
      children: [
        Container(
          width: double.infinity,
          padding: EdgeInsets.symmetric(
            horizontal: ImTokens.layoutPanelPadding,
            vertical: ImTokens.space3,
          ),
          decoration: const BoxDecoration(
            color: Colors.white,
            boxShadow: [ImTokens.cardShadow],
          ),
          child: Row(
            children: [
              Expanded(
                child: TabBar(
                  controller: _tabController,
                  tabs: [
                    Tab(text: loc.contactsFriends(contactsState.friends.length)),
                    Tab(
                      text: contactsState.friendRequests.isNotEmpty
                          ? loc.contactsRequests(
                              contactsState.friendRequests.length)
                          : loc.contactsFriendRequests,
                    ),
                  ],
                ),
              ),
              IconButton(
                icon: const Icon(Icons.person_add),
                tooltip: loc.contactsAddFriend,
                onPressed: () => context.go('/contacts/add'),
              ),
              const SizedBox(width: ImTokens.layoutItemGap),
            ],
          ),
        ),
        ContactsToolbar(
          searchKeyword: _searchKeyword,
          onSearchChanged: (value) => setState(() => _searchKeyword = value),
          sortMode: _sortMode,
          onSortChanged: (mode) => setState(() => _sortMode = mode),
        ),
        Expanded(
          child: TabBarView(
            controller: _tabController,
            children: [
              _buildFriendList(contactsState, loc),
              _buildRequestList(contactsState, loc),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildFriendList(ContactsState state, AppLocalizations loc) {
    if (state.isLoading) {
      return const Center(child: CircularProgressIndicator());
    }
    if (state.friends.isEmpty) {
      return Center(child: Text(loc.contactsNoFriends));
    }

    final filteredFriends = _filterAndSortFriends(state.friends);

    if (filteredFriends.isEmpty) {
      return Center(child: Text(loc.contactsNoFriends));
    }

    return ListView.builder(
      itemCount: filteredFriends.length,
      itemBuilder: (context, index) {
        final friend = filteredFriends[index];
        return _FriendTile(
          friend: friend,
          onEditRemark: () => _showRemarkDialog(friend),
          onDelete: () => _confirmDeleteFriend(friend),
          onTap: () async {
            final chatNotifier = ref.read(chatStateProvider.notifier);
            final session = await chatNotifier.getOrCreateSession(
              friend.friendId,
              targetName: friend.nickname ?? friend.username,
              targetAvatar: friend.avatar,
            );
            if (session != null) {
              chatNotifier.setActiveSession(session.id);
              await chatNotifier.loadMessages(friend.friendId);
              if (context.mounted) {
                context.go('/chat');
              }
            }
          },
        );
      },
    );
  }

  Future<void> _showRemarkDialog(Friendship friend) async {
    final controller = TextEditingController(text: friend.remark ?? '');
    final loc = AppLocalizations.of(context)!;
    final remark = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(loc.contactsEditRemark),
        content: TextField(
          controller: controller,
          autofocus: true,
          maxLength: 30,
          decoration: InputDecoration(
            labelText: loc.contactsRemarkLabel,
            hintText: loc.contactsRemarkHint,
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: Text(loc.commonCancel),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, controller.text.trim()),
            child: Text(loc.commonConfirm),
          ),
        ],
      ),
    );
    controller.dispose();

    if (!mounted || remark == null) return;

    final ok = await ref
        .read(contactsStateProvider.notifier)
        .updateFriendRemark(friend.friendId, remark);
    if (!mounted) return;

    final message = ok ? loc.contactsRemarkSaved : loc.contactsRemarkSaveFailed;
    ScaffoldMessenger.of(context)
        .showSnackBar(SnackBar(content: Text(message)));
  }

  Future<void> _confirmDeleteFriend(Friendship friend) async {
    final loc = AppLocalizations.of(context)!;
    final displayName = friend.remark ?? friend.nickname ?? friend.username;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(loc.contactsDeleteFriend),
        content: Text(loc.contactsDeleteFriendConfirm(displayName)),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: Text(loc.commonCancel),
          ),
          FilledButton.tonal(
            onPressed: () => Navigator.pop(ctx, true),
            child: Text(loc.commonConfirm),
          ),
        ],
      ),
    );

    if (!mounted || confirmed != true) return;

    final ok = await ref
        .read(contactsStateProvider.notifier)
        .deleteFriend(friend.friendId);
    if (!mounted) return;

    final message =
        ok ? loc.contactsDeleteFriendDone : loc.contactsDeleteFriendFailed;
    ScaffoldMessenger.of(context)
        .showSnackBar(SnackBar(content: Text(message)));
  }

  Future<void> _handleRequestAction(
    FriendRequest request, {
    required bool accept,
  }) async {
    if (_processingRequestIds.contains(request.id)) return;
    setState(() => _processingRequestIds.add(request.id));

    final notifier = ref.read(contactsStateProvider.notifier);
    final ok = accept
        ? await notifier.acceptRequest(request.id)
        : await notifier.rejectRequest(request.id);

    if (!mounted) return;

    if (ok && accept) {
      _tabController.animateTo(0);
    }

    final loc = AppLocalizations.of(context)!;
    final error = ref.read(contactsStateProvider).error;
    final message = ok
        ? (accept ? loc.contactsAccepted : loc.contactsRejected)
        : (error ?? loc.commonFailed);
    ScaffoldMessenger.of(context)
        .showSnackBar(SnackBar(content: Text(message)));

    setState(() => _processingRequestIds.remove(request.id));
  }

  List<Friendship> _filterAndSortFriends(List<Friendship> friends) {
    final keyword = _searchKeyword.trim().toLowerCase();

    final filtered = keyword.isEmpty
        ? friends
        : friends.where((friend) {
            final fields = [
              friend.nickname,
              friend.username,
              friend.remark,
              friend.signature,
            ].whereType<String>();
            return fields.any(
              (field) => field.toLowerCase().contains(keyword),
            );
          }).toList();

    filtered.sort((a, b) {
      switch (_sortMode) {
        case ContactsSortMode.name:
          final nameA = (a.remark ?? a.nickname ?? a.username).toLowerCase();
          final nameB = (b.remark ?? b.nickname ?? b.username).toLowerCase();
          return nameA.compareTo(nameB);
        case ContactsSortMode.online:
          final onlineA = a.isOnline == true ? 0 : 1;
          final onlineB = b.isOnline == true ? 0 : 1;
          if (onlineA != onlineB) return onlineA.compareTo(onlineB);
          final nameA = (a.remark ?? a.nickname ?? a.username).toLowerCase();
          final nameB = (b.remark ?? b.nickname ?? b.username).toLowerCase();
          return nameA.compareTo(nameB);
        case ContactsSortMode.time:
          final timeA = a.createdAt ?? a.createTime ?? '';
          final timeB = b.createdAt ?? b.createTime ?? '';
          return timeB.compareTo(timeA);
      }
    });

    return filtered;
  }

  Widget _buildRequestList(ContactsState state, AppLocalizations loc) {
    if (state.isLoading) {
      return const Center(child: CircularProgressIndicator());
    }
    if (state.friendRequests.isEmpty) {
      return Center(child: Text(loc.contactsNoRequests));
    }

    return ListView.builder(
      itemCount: state.friendRequests.length,
      itemBuilder: (context, index) {
        final request = state.friendRequests[index];
        return _RequestTile(
          request: request,
          isBusy: _processingRequestIds.contains(request.id),
          onAccept: () => _handleRequestAction(request, accept: true),
          onReject: () => _handleRequestAction(request, accept: false),
        );
      },
    );
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }
}

class _FriendTile extends StatelessWidget {
  const _FriendTile({
    required this.friend,
    required this.onTap,
    required this.onEditRemark,
    required this.onDelete,
  });
  final Friendship friend;
  final VoidCallback onTap;
  final VoidCallback onEditRemark;
  final VoidCallback onDelete;

  @override
  Widget build(BuildContext context) {
    final loc = AppLocalizations.of(context)!;
    final displayName = (friend.remark?.trim().isNotEmpty ?? false)
        ? friend.remark!.trim()
        : (friend.nickname ?? friend.username);
    final subtitleParts = <String>[
      if (displayName != friend.username) '@${friend.username}',
      friend.signature ??
          (friend.isOnline == true ? loc.contactsOnline : loc.contactsOffline),
    ];

    return ListTile(
      leading: Stack(
        clipBehavior: Clip.none,
        children: [
          CircleAvatar(
            radius: 22,
            backgroundImage:
                friend.avatar != null ? NetworkImage(friend.avatar!) : null,
            child: friend.avatar == null
                ? Text(
                    (friend.nickname ?? friend.username)
                        .substring(0, 1)
                        .toUpperCase(),
                    style: const TextStyle(fontSize: ImTokens.textBase),
                  )
                : null,
          ),
          if (friend.isOnline == true)
            Positioned(
              right: 0,
              bottom: 0,
              child: Container(
                width: 12,
                height: 12,
                decoration: BoxDecoration(
                  color: Theme.of(context).colorScheme.primary,
                  shape: BoxShape.circle,
                  border: Border.all(
                    color: Theme.of(context).colorScheme.surface,
                    width: 2,
                  ),
                ),
              ),
            ),
        ],
      ),
      title: Text(
        displayName,
        style: const TextStyle(fontWeight: FontWeight.w500),
      ),
      subtitle: Text(
        subtitleParts.join(' · '),
        style: TextStyle(
          color: Theme.of(context).colorScheme.onSurfaceVariant,
          fontSize: ImTokens.textSm,
        ),
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
      ),
      trailing: PopupMenuButton<_FriendAction>(
        onSelected: (action) {
          switch (action) {
            case _FriendAction.editRemark:
              onEditRemark();
              break;
            case _FriendAction.delete:
              onDelete();
              break;
          }
        },
        itemBuilder: (context) => [
          PopupMenuItem(
            value: _FriendAction.editRemark,
            child: Row(
              children: [
                const Icon(Icons.edit_outlined, size: ImTokens.textLg),
                const SizedBox(width: ImTokens.space2),
                Text(loc.contactsEditRemark),
              ],
            ),
          ),
          PopupMenuItem(
            value: _FriendAction.delete,
            child: Row(
              children: [
                const Icon(Icons.delete_outline, size: ImTokens.textLg),
                const SizedBox(width: ImTokens.space2),
                Text(loc.contactsDeleteFriend),
              ],
            ),
          ),
        ],
      ),
      onTap: onTap,
    );
  }
}

enum _FriendAction { editRemark, delete }

class _RequestTile extends StatelessWidget {
  const _RequestTile({
    required this.request,
    required this.isBusy,
    required this.onAccept,
    required this.onReject,
  });
  final FriendRequest request;
  final bool isBusy;
  final VoidCallback onAccept;
  final VoidCallback onReject;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final loc = AppLocalizations.of(context)!;

    return ListTile(
      leading: CircleAvatar(
        radius: 22,
        backgroundImage: request.applicantAvatar != null
            ? NetworkImage(request.applicantAvatar!)
            : null,
        child: request.applicantAvatar == null
            ? Text(
                (request.applicantNickname ?? request.applicantUsername)
                    .substring(0, 1)
                    .toUpperCase(),
                style: const TextStyle(fontSize: 16),
              )
            : null,
      ),
      title: Text(
        request.applicantNickname ?? request.applicantUsername,
        style: const TextStyle(fontWeight: FontWeight.w500),
      ),
      subtitle: Text(
        request.reason ?? loc.contactsFriendRequestReason,
        style: TextStyle(
          color: theme.colorScheme.onSurfaceVariant,
          fontSize: ImTokens.textSm,
        ),
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
      ),
      trailing: request.status == 'PENDING'
          ? Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextButton(
                  onPressed: isBusy ? null : onReject,
                  child: Text(loc.contactsReject),
                ),
                FilledButton.tonal(
                  onPressed: isBusy ? null : onAccept,
                  child: isBusy
                      ? const SizedBox(
                          width: 16,
                          height: 16,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : Text(loc.contactsAccept),
                ),
              ],
            )
          : Text(
              request.status == 'ACCEPTED'
                  ? loc.contactsAccepted
                  : loc.contactsRejected,
              style: TextStyle(
                color: theme.colorScheme.onSurfaceVariant,
                fontSize: ImTokens.textSm,
              ),
            ),
    );
  }
}
