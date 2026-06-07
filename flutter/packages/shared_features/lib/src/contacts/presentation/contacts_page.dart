import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'contacts_providers.dart';

class ContactsPage extends ConsumerStatefulWidget {
  const ContactsPage({super.key});

  @override
  ConsumerState<ContactsPage> createState() => _ContactsPageState();
}

class _ContactsPageState extends ConsumerState<ContactsPage> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      ref.read(contactsStateProvider.notifier).loadFriends();
    });
  }

  @override
  Widget build(BuildContext context) {
    final contactsState = ref.watch(contactsStateProvider);

    return Column(
      children: [
        // Header
        Container(
          padding: const EdgeInsets.all(16),
          child: Row(
            children: [
              const Expanded(
                child: Text(
                  '联系人',
                  style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
                ),
              ),
              IconButton(
                icon: const Icon(Icons.person_add),
                onPressed: () {
                  // TODO: 打开添加好友页面
                },
              ),
            ],
          ),
        ),
        const Divider(height: 1),

        // Friend requests
        if (contactsState.friendRequests.isNotEmpty) ...[
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            child: Text(
              '好友请求 (${contactsState.friendRequests.length})',
              style: const TextStyle(fontWeight: FontWeight.bold),
            ),
          ),
          ...contactsState.friendRequests.map((request) {
            final displayName =
                request.applicantNickname ?? request.applicantUsername;
            final initial =
                displayName.isNotEmpty ? displayName.substring(0, 1) : '?';
            return ListTile(
              leading: CircleAvatar(
                child: Text(
                  initial.toUpperCase(),
                ),
              ),
              title: Text(
                displayName,
              ),
              subtitle: Text(request.reason ?? '好友请求'),
              trailing: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  TextButton(
                    onPressed: () {
                      ref
                          .read(contactsStateProvider.notifier)
                          .acceptRequest(request.id);
                    },
                    child: const Text('接受'),
                  ),
                  TextButton(
                    onPressed: () {
                      ref
                          .read(contactsStateProvider.notifier)
                          .rejectRequest(request.id);
                    },
                    child: const Text('拒绝'),
                  ),
                ],
              ),
            );
          }),
          const Divider(),
        ],

        // Friends list
        Expanded(
          child: contactsState.friends.isEmpty
              ? const Center(child: Text('暂无联系人'))
              : ListView.builder(
                  itemCount: contactsState.friends.length,
                  itemBuilder: (context, index) {
                    final friend = contactsState.friends[index];
                    final displayName = (friend.remark?.isNotEmpty ?? false)
                        ? friend.remark!
                        : (friend.nickname ?? friend.username);
                    final initial = displayName.isNotEmpty
                        ? displayName.substring(0, 1)
                        : '?';
                    return ListTile(
                      leading: CircleAvatar(
                        child: Text(
                          initial.toUpperCase(),
                        ),
                      ),
                      title: Text(displayName),
                      subtitle: Text(
                        friend.isOnline == true ? '在线' : '离线',
                      ),
                      trailing: Icon(
                        Icons.circle,
                        color: friend.isOnline == true
                            ? Colors.green
                            : Colors.grey,
                        size: 12,
                      ),
                    );
                  },
                ),
        ),
      ],
    );
  }
}
