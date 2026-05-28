import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:im_web/core/di/providers.dart';
import 'package:im_web/l10n/app_localizations.dart';
import 'package:im_core/core.dart';
import '../../chat/presentation/chat_providers.dart';
import 'contacts_provider.dart';

class ContactsPage extends ConsumerStatefulWidget {
  const ContactsPage({super.key});

  @override
  ConsumerState<ContactsPage> createState() => _ContactsPageState();
}

class _ContactsPageState extends ConsumerState<ContactsPage>
    with SingleTickerProviderStateMixin {
  late TabController _tabController;

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
        Row(
          children: [
            Expanded(
              child: TabBar(
                controller: _tabController,
                tabs: [
                  Tab(text: loc.contactsFriends(contactsState.friends.length)),
                  Tab(
                    text: contactsState.friendRequests.isNotEmpty
                        ? loc.contactsRequests(contactsState.friendRequests.length)
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
            const SizedBox(width: 8),
          ],
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

    return ListView.builder(
      itemCount: state.friends.length,
      itemBuilder: (context, index) {
        final friend = state.friends[index];
        return _FriendTile(
          friend: friend,
          onTap: () async {
            final chatNotifier = ref.read(chatStateProvider.notifier);
            final session =
                await chatNotifier.getOrCreateSession(friend.friendId);
            if (session != null) {
              chatNotifier.setActiveSession(session.id);
              if (context.mounted) {
                context.go('/chat');
              }
            }
          },
        );
      },
    );
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
          onAccept: () async {
            await ref
                .read(contactsStateProvider.notifier)
                .acceptRequest(request.id);
          },
          onReject: () async {
            await ref
                .read(contactsStateProvider.notifier)
                .rejectRequest(request.id);
          },
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
  const _FriendTile({required this.friend, required this.onTap});
  final Friendship friend;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final loc = AppLocalizations.of(context)!;
    return ListTile(
      leading: Stack(
        clipBehavior: Clip.none,
        children: [
          CircleAvatar(
            radius: 22,
            backgroundImage: friend.avatar != null
                ? NetworkImage(friend.avatar!)
                : null,
            child: friend.avatar == null
                ? Text(
                    (friend.nickname ?? friend.username)
                        .substring(0, 1)
                        .toUpperCase(),
                    style: const TextStyle(fontSize: 16),
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
                  color: Colors.green,
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
        friend.nickname ?? friend.username,
        style: const TextStyle(fontWeight: FontWeight.w500),
      ),
      subtitle: Text(
        friend.signature ?? (friend.isOnline == true ? loc.contactsOnline : loc.contactsOffline),
        style: TextStyle(
          color: Theme.of(context).colorScheme.onSurfaceVariant,
          fontSize: 13,
        ),
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
      ),
      onTap: onTap,
    );
  }
}

class _RequestTile extends StatelessWidget {
  const _RequestTile({
    required this.request,
    required this.onAccept,
    required this.onReject,
  });
  final FriendRequest request;
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
          fontSize: 13,
        ),
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
      ),
      trailing: request.status == 'PENDING'
          ? Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextButton(
                  onPressed: onReject,
                  child: Text(loc.contactsReject),
                ),
                FilledButton.tonal(
                  onPressed: onAccept,
                  child: Text(loc.contactsAccept),
                ),
              ],
            )
          : Text(
              request.status == 'ACCEPTED' ? loc.contactsAccepted : loc.contactsRejected,
              style: TextStyle(
                color: theme.colorScheme.onSurfaceVariant,
                fontSize: 13,
              ),
            ),
    );
  }
}
