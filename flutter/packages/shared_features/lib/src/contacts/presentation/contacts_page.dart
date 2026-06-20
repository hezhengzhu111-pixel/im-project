import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:im_core/core.dart';
import 'package:im_l10n/im_l10n.dart';
import 'package:im_ui/im_ui.dart';
import 'package:im_shared_features/auth.dart';
import 'package:im_shared_features/chat.dart';
import 'contacts_provider.dart';
import 'contacts_providers.dart';
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
  String? _selectedFriendId;

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
    final selectedFriend = _selectedFriend(contactsState.friends);

    ref.listen(
      contactsStateProvider.select((s) => s.requestEventVersion),
      (previous, next) {
        if (next == previous) return;
        final request = ref.read(contactsStateProvider).lastIncomingRequest;
        if (request == null || !mounted) return;
        final name = request.applicantNickname ?? request.applicantUsername;
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(loc.contactsNewRequestFrom(name))),
        );
        ref.read(contactsStateProvider.notifier).clearLastIncomingRequest();
      },
    );

    if (context.isCompact) {
      return Scaffold(
        appBar: AppBar(title: Text(loc.navContacts)),
        body: _buildListPanel(contactsState, loc),
      );
    }

    return ColoredBox(
      color: ImTokens.wechatPageBg,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Row(
          children: [
            SizedBox(
              width: 304,
              child: GlassPanel(child: _buildListPanel(contactsState, loc)),
            ),
            const SizedBox(width: 18),
            Expanded(
              child: GlassPanel(
                padding: const EdgeInsets.all(24),
                child: _ContactDetailPanel(
                  friend: selectedFriend,
                  onEditRemark: selectedFriend == null
                      ? null
                      : () => _showRemarkDialog(selectedFriend),
                  onMessage: selectedFriend == null
                      ? null
                      : () => _openChatWithFriend(selectedFriend),
                ),
              ),
            ),
            if (context.isLarge) ...[
              const SizedBox(width: 18),
              SizedBox(
                width: 304,
                child: _ContactsRightPanel(state: contactsState),
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _buildListPanel(ContactsState contactsState, AppLocalizations loc) {
    final currentUserId = ref.read(currentUserIdProvider) ?? '';
    final incomingPendingCount = contactsState.friendRequests
        .where(
          (request) =>
              request.status == 'PENDING' && request.targetUserId == currentUserId,
        )
        .length;

    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(14, 12, 8, 0),
          child: Row(
            children: [
              Expanded(
                child: TabBar(
                  controller: _tabController,
                  tabs: [
                    Tab(
                        text:
                            loc.contactsFriends(contactsState.friends.length)),
                    Tab(
                      child: incomingPendingCount > 0
                          ? Badge(
                              label: Text('$incomingPendingCount'),
                              child: Text(
                                contactsState.friendRequests.isNotEmpty
                                    ? loc.contactsRequests(
                                        contactsState.friendRequests.length)
                                    : loc.contactsFriendRequests,
                              ),
                            )
                          : Text(
                              contactsState.friendRequests.isNotEmpty
                                  ? loc.contactsRequests(
                                      contactsState.friendRequests.length)
                                  : loc.contactsFriendRequests,
                            ),
                    ),
                  ],
                ),
              ),
              IconButton(
                icon: const Icon(Icons.person_add_outlined),
                tooltip: loc.contactsAddFriend,
                onPressed: () => context.go('/contacts/add'),
              ),
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

  Friendship? _selectedFriend(List<Friendship> friends) {
    if (friends.isEmpty) return null;
    for (final friend in friends) {
      if (friend.friendId == _selectedFriendId) return friend;
    }
    return friends.first;
  }

  Widget _buildFriendList(ContactsState state, AppLocalizations loc) {
    if (state.isLoading && state.friends.isEmpty && state.error == null) {
      return const Center(child: CircularProgressIndicator());
    }
    if (state.error != null) {
      return _LoadError(
        message: loc.loadingFailed(state.error!),
        onRetry: () => ref.read(contactsStateProvider.notifier).loadFriends(),
      );
    }
    if (state.friends.isEmpty) {
      return Center(child: Text(loc.contactsNoFriends));
    }

    final filteredFriends = _filterAndSortFriends(state.friends);
    if (filteredFriends.isEmpty) {
      return Center(child: Text(loc.contactsSearchNoResults));
    }

    return ListView.builder(
      padding: const EdgeInsets.fromLTRB(0, 4, 0, 12),
      itemCount: filteredFriends.length,
      itemBuilder: (context, index) {
        final friend = filteredFriends[index];
        return _FriendTile(
          friend: friend,
          isSelected: friend.friendId ==
              (_selectedFriendId ?? state.friends.first.friendId),
          onEditRemark: () => _showRemarkDialog(friend),
          onDelete: () => _confirmDeleteFriend(friend),
          onTap: () => _selectFriend(friend),
        );
      },
    );
  }

  void _selectFriend(Friendship friend) {
    if (!mounted) return;
    if (context.isCompact) {
      Navigator.of(context).push(
        MaterialPageRoute(
          builder: (_) => _ContactDetailPage(
            friend: friend,
            onEditRemark: () => _showRemarkDialog(friend),
            onMessage: () => _openChatWithFriend(friend),
          ),
        ),
      );
    } else {
      setState(() => _selectedFriendId = friend.friendId);
    }
  }

  Future<void> _openChatWithFriend(Friendship friend) async {
    final chatNotifier = ref.read(chatStateProvider.notifier);
    final session = await chatNotifier.getOrCreateSession(
      friend.friendId,
      targetName: friend.nickname ?? friend.username,
      targetAvatar: friend.avatar,
    );
    if (session != null) {
      chatNotifier.setActiveSession(session.id);
      await chatNotifier.loadMessages(friend.friendId);
      if (context.mounted) context.go('/chat');
    }
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

    if (ok) {
      if (_selectedFriendId == friend.friendId) {
        setState(() => _selectedFriendId = null);
      }
      _clearActiveChatIfNeeded(friend.friendId);
    }

    final message =
        ok ? loc.contactsDeleteFriendDone : loc.contactsDeleteFriendFailed;
    ScaffoldMessenger.of(context)
        .showSnackBar(SnackBar(content: Text(message)));
  }

  void _clearActiveChatIfNeeded(String friendId) {
    final chatState = ref.read(chatStateProvider);
    final activeId = chatState.activeSessionId;
    if (activeId == null) return;
    final session =
        chatState.sessions.where((s) => s.id == activeId).firstOrNull;
    if (session != null && session.targetId == friendId) {
      ref.read(chatStateProvider.notifier).setActiveSession(null);
    }
  }

  Future<void> _handleRequestAction(
    FriendRequest request, {
    required bool accept,
  }) async {
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
  }

  List<Friendship> _filterAndSortFriends(List<Friendship> friends) {
    final keyword = _searchKeyword.trim().toLowerCase();

    final filtered = keyword.isEmpty
        ? List<Friendship>.from(friends)
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
    if (state.isLoading && state.friendRequests.isEmpty && state.error == null) {
      return const Center(child: CircularProgressIndicator());
    }
    if (state.error != null) {
      return _LoadError(
        message: loc.loadingFailed(state.error!),
        onRetry: () => ref.read(contactsStateProvider.notifier).loadFriends(),
      );
    }
    if (state.friendRequests.isEmpty) {
      return Center(child: Text(loc.contactsNoRequests));
    }

    return ListView.builder(
      padding: const EdgeInsets.fromLTRB(0, 4, 0, 12),
      itemCount: state.friendRequests.length,
      itemBuilder: (context, index) {
        final request = state.friendRequests[index];
        return _RequestTile(
          request: request,
          isBusy: state.processingIds.contains('request:${request.id}'),
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

class _LoadError extends StatelessWidget {
  const _LoadError({required this.message, this.onRetry});

  final String message;
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) {
    final loc = AppLocalizations.of(context)!;
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              Icons.error_outline,
              size: 48,
              color: Theme.of(context).colorScheme.error,
            ),
            const SizedBox(height: 12),
            Text(
              message,
              textAlign: TextAlign.center,
              style: TextStyle(color: Theme.of(context).colorScheme.error),
            ),
            if (onRetry != null) ...[
              const SizedBox(height: 12),
              FilledButton.tonal(
                onPressed: onRetry,
                child: Text(loc.retry),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _FriendTile extends StatelessWidget {
  const _FriendTile({
    required this.friend,
    required this.isSelected,
    required this.onTap,
    required this.onEditRemark,
    required this.onDelete,
  });

  final Friendship friend;
  final bool isSelected;
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
      if (friend.signature != null && friend.signature!.isNotEmpty)
        friend.signature!
      else if (friend.isOnline == true)
        loc.contactsOnline
      else if (friend.isOnline == false)
        loc.contactsOffline,
    ];

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
      child: HoverLiftCard(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        onTap: onTap,
        child: Row(
          children: [
            _FriendAvatar(friend: friend),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    displayName,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      fontWeight: FontWeight.w700,
                      color: isSelected ? imGlassBrand : null,
                    ),
                  ),
                  const SizedBox(height: 3),
                  Text(
                    subtitleParts.join(' / '),
                    style: TextStyle(
                      color: Theme.of(context).colorScheme.onSurfaceVariant,
                      fontSize: ImTokens.textSm,
                    ),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ],
              ),
            ),
            PopupMenuButton<_FriendAction>(
              icon: const Icon(Icons.more_horiz, size: 18),
              onSelected: (action) {
                switch (action) {
                  case _FriendAction.editRemark:
                    onEditRemark();
                  case _FriendAction.delete:
                    onDelete();
                }
              },
              itemBuilder: (context) => [
                PopupMenuItem(
                  value: _FriendAction.editRemark,
                  child: Text(loc.contactsEditRemark),
                ),
                PopupMenuItem(
                  value: _FriendAction.delete,
                  child: Text(loc.contactsDeleteFriend),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

enum _FriendAction { editRemark, delete }

class _FriendAvatar extends StatelessWidget {
  const _FriendAvatar({required this.friend, this.radius = 22});

  final Friendship friend;
  final double radius;

  @override
  Widget build(BuildContext context) {
    final showStatusDot = friend.isOnline != null;

    return Stack(
      clipBehavior: Clip.none,
      children: [
        CircleAvatar(
          radius: radius,
          backgroundImage:
              friend.avatar != null ? NetworkImage(friend.avatar!) : null,
          child: friend.avatar == null
              ? Text(
                  (friend.nickname ?? friend.username)
                      .substring(0, 1)
                      .toUpperCase(),
                  style: TextStyle(fontSize: radius * 0.72),
                )
              : null,
        ),
        if (showStatusDot)
          Positioned(
            right: 0,
            bottom: 0,
            child: Container(
              width: 12,
              height: 12,
              decoration: BoxDecoration(
                color: friend.isOnline == true
                    ? const Color(0xFF23D5AB)
                    : Colors.blueGrey.shade200,
                shape: BoxShape.circle,
                border: Border.all(color: Colors.white, width: 2),
              ),
            ),
          ),
      ],
    );
  }
}

class _ContactDetailPage extends StatelessWidget {
  const _ContactDetailPage({
    required this.friend,
    this.onEditRemark,
    this.onMessage,
  });

  final Friendship friend;
  final VoidCallback? onEditRemark;
  final VoidCallback? onMessage;

  @override
  Widget build(BuildContext context) {
    final displayName = (friend.remark?.trim().isNotEmpty ?? false)
        ? friend.remark!.trim()
        : (friend.nickname ?? friend.username);
    return Scaffold(
      appBar: AppBar(
        title: Text(displayName),
      ),
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: _ContactDetailPanel(
          friend: friend,
          onEditRemark: onEditRemark,
          onMessage: onMessage,
        ),
      ),
    );
  }
}

class _ContactDetailPanel extends StatelessWidget {
  const _ContactDetailPanel({
    required this.friend,
    this.onEditRemark,
    this.onMessage,
  });

  final Friendship? friend;
  final VoidCallback? onEditRemark;
  final VoidCallback? onMessage;

  @override
  Widget build(BuildContext context) {
    final loc = AppLocalizations.of(context)!;
    final current = friend;
    if (current == null) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              Icons.person_outline,
              size: 58,
              color: Theme.of(context)
                  .colorScheme
                  .onSurfaceVariant
                  .withValues(alpha: 0.48),
            ),
            const SizedBox(height: 12),
            Text(loc.contactsNoFriends),
          ],
        ),
      );
    }

    final displayName = (current.remark?.trim().isNotEmpty ?? false)
        ? current.remark!.trim()
        : (current.nickname ?? current.username);
    final account = '@${current.username}';

    return ListView(
      children: [
        Row(
          children: [
            _FriendAvatar(friend: current, radius: 38),
            const SizedBox(width: 18),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    displayName,
                    style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                          fontWeight: FontWeight.w800,
                        ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    account,
                    style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                          color: Theme.of(context).colorScheme.onSurfaceVariant,
                        ),
                  ),
                ],
              ),
            ),
            if (current.isOnline != null)
              _StatusPill(
                text: current.isOnline == true
                    ? loc.contactsOnline
                    : loc.contactsOffline,
                active: current.isOnline == true,
              ),
          ],
        ),
        const SizedBox(height: 24),
        Wrap(
          spacing: 12,
          runSpacing: 12,
          children: [
            PrimarySolidButton(
              label: loc.contactsSendMessage,
              icon: Icons.chat_bubble_outline,
              onPressed: onMessage,
            ),
            _DisabledAction(label: loc.contactsVoiceCall, icon: Icons.call_outlined),
            _DisabledAction(label: loc.contactsVideoCall, icon: Icons.videocam_outlined),
          ],
        ),
        const SizedBox(height: 28),
        _DetailGrid(
          items: [
            _DetailItem(loc.contactsRemarkLabel,
                current.remark ?? loc.contactsNoValue, onTap: onEditRemark),
            _DetailItem(loc.contactsPermission, loc.contactsNoValue),
            _DetailItem(loc.contactsSource, loc.contactsNoValue),
            _DetailItem(loc.contactsAddedTime,
                current.createdAt ?? current.createTime ?? loc.contactsNoValue),
            _DetailItem(loc.contactsOnlineStatus,
                current.lastSeen ?? current.lastActiveTime ?? loc.contactsNoValue),
            _DetailItem(loc.contactsSignature,
                current.signature ?? loc.contactsNoValue),
          ],
        ),
        const SizedBox(height: 24),
        Text(
          loc.contactsMoments,
          style: Theme.of(context).textTheme.titleMedium?.copyWith(
                fontWeight: FontWeight.w800,
              ),
        ),
        const SizedBox(height: 12),
        Container(
          height: 118,
          decoration: BoxDecoration(
            color: Theme.of(context).colorScheme.surface,
            borderRadius: BorderRadius.circular(4),
            border: Border.all(color: Theme.of(context).dividerColor),
          ),
          child: Center(
            child: Text(
              loc.contactsNoValue,
              style: TextStyle(
                color: Theme.of(context).colorScheme.onSurfaceVariant,
              ),
            ),
          ),
        ),
      ],
    );
  }
}

class _DetailGrid extends StatelessWidget {
  const _DetailGrid({required this.items});

  final List<_DetailItem> items;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final columns = constraints.maxWidth > 620 ? 2 : 1;
        return GridView.builder(
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          itemCount: items.length,
          gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
            crossAxisCount: columns,
            mainAxisExtent: 78,
            crossAxisSpacing: 12,
            mainAxisSpacing: 12,
          ),
          itemBuilder: (context, index) {
            final item = items[index];
            return HoverLiftCard(
              onTap: item.onTap,
              padding: const EdgeInsets.all(14),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Text(
                    item.label,
                    style: TextStyle(
                      color: Theme.of(context).colorScheme.onSurfaceVariant,
                      fontSize: 12,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    item.value,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontWeight: FontWeight.w700),
                  ),
                ],
              ),
            );
          },
        );
      },
    );
  }
}

class _DetailItem {
  const _DetailItem(this.label, this.value, {this.onTap});

  final String label;
  final String value;
  final VoidCallback? onTap;
}

class _StatusPill extends StatelessWidget {
  const _StatusPill({required this.text, required this.active});

  final String text;
  final bool active;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
      decoration: BoxDecoration(
        color: (active ? const Color(0xFF23D5AB) : Colors.blueGrey)
            .withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        text,
        style: TextStyle(
          color: active ? const Color(0xFF0B8F72) : Colors.blueGrey.shade600,
          fontWeight: FontWeight.w800,
          fontSize: 12,
        ),
      ),
    );
  }
}

class _DisabledAction extends StatelessWidget {
  const _DisabledAction({required this.label, required this.icon});

  final String label;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    return OutlinedButton.icon(
      onPressed: null,
      icon: Icon(icon, size: 18),
      label: Text(label),
      style: OutlinedButton.styleFrom(
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(ImTokens.radiusSm),
        ),
        padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 14),
      ),
    );
  }
}

class _ContactsRightPanel extends StatelessWidget {
  const _ContactsRightPanel({required this.state});

  final ContactsState state;

  @override
  Widget build(BuildContext context) {
    final loc = AppLocalizations.of(context)!;
    final onlineCount =
        state.friends.where((friend) => friend.isOnline == true).length;
    return Column(
      children: [
        GlassPanel(
          padding: const EdgeInsets.all(18),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                loc.contactsDailyOverview,
                style: Theme.of(context).textTheme.titleMedium?.copyWith(
                      fontWeight: FontWeight.w800,
                    ),
              ),
              const SizedBox(height: 16),
              Row(
                children: [
                  _OverviewStat(
                      label: loc.navContacts, value: '${state.friends.length}'),
                  const SizedBox(width: 12),
                  _OverviewStat(
                      label: loc.contactsOnline, value: '$onlineCount'),
                ],
              ),
            ],
          ),
        ),
        const SizedBox(height: 18),
        Expanded(
          child: GlassPanel(
            padding: const EdgeInsets.all(18),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  loc.contactsRecentInteractions,
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.w800,
                      ),
                ),
                const SizedBox(height: 16),
                Expanded(
                  child: state.friends.isEmpty
                      ? Center(child: Text(loc.contactsNoFriends))
                      : ListView(
                          children: state.friends.take(6).map((friend) {
                            return ListTile(
                              dense: true,
                              contentPadding: EdgeInsets.zero,
                              leading:
                                  _FriendAvatar(friend: friend, radius: 16),
                              title: Text(
                                friend.remark ??
                                    friend.nickname ??
                                    friend.username,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                              ),
                              subtitle: Text(
                                friend.lastActiveTime ??
                                    friend.lastSeen ??
                                    loc.contactsNoValue,
                              ),
                            );
                          }).toList(),
                        ),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

class _OverviewStat extends StatelessWidget {
  const _OverviewStat({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: Theme.of(context).colorScheme.surface,
          borderRadius: BorderRadius.circular(4),
          border: Border.all(color: Theme.of(context).dividerColor),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              value,
              style: Theme.of(context).textTheme.titleLarge?.copyWith(
                    fontWeight: FontWeight.w900,
                    color: imGlassBrand,
                  ),
            ),
            Text(
              label,
              style: TextStyle(
                color: Theme.of(context).colorScheme.onSurfaceVariant,
                fontSize: 12,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

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
    final loc = AppLocalizations.of(context)!;

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
      child: HoverLiftCard(
        padding: const EdgeInsets.all(12),
        child: Row(
          children: [
            CircleAvatar(
              radius: 22,
              backgroundImage: request.applicantAvatar != null
                  ? NetworkImage(request.applicantAvatar!)
                  : null,
              child: request.applicantAvatar == null
                  ? Text(
                      (request.applicantNickname ?? request.applicantUsername)
                          .substring(0, 1)
                          .toUpperCase(),
                    )
                  : null,
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    request.applicantNickname ?? request.applicantUsername,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontWeight: FontWeight.w700),
                  ),
                  const SizedBox(height: 3),
                  Text(
                    request.reason ?? loc.contactsFriendRequestReason,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      color: Theme.of(context).colorScheme.onSurfaceVariant,
                      fontSize: ImTokens.textSm,
                    ),
                  ),
                ],
              ),
            ),
            if (request.status == 'PENDING') ...[
              TextButton(
                onPressed: isBusy ? null : onReject,
                child: Text(loc.contactsReject),
              ),
              PrimarySolidButton(
                label: loc.contactsAccept,
                compact: true,
                isLoading: isBusy,
                onPressed: isBusy ? null : onAccept,
              ),
            ] else
              Text(
                request.status == 'ACCEPTED'
                    ? loc.contactsAccepted
                    : loc.contactsRejected,
              ),
          ],
        ),
      ),
    );
  }
}
