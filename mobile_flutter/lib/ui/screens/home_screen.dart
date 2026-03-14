import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../models/chat_models.dart';
import '../../state/auth_controller.dart';
import '../../state/chat_controller.dart';
import 'chat_screen.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  int _index = 0;

  @override
  Widget build(BuildContext context) {
    final chat = context.watch<ChatController>();
    final pages = [
      const _ChatsTab(),
      const _FriendsTab(),
      const _GroupsTab(),
      const _ProfileTab(),
    ];
    return Scaffold(
      body: pages[_index],
      bottomNavigationBar: NavigationBar(
        selectedIndex: _index,
        onDestinationSelected: (value) => setState(() => _index = value),
        destinations: [
          NavigationDestination(
            icon: _BadgeIcon(
              icon: Icons.chat_bubble_outline,
              count: chat.totalUnread,
            ),
            label: '会话',
          ),
          const NavigationDestination(icon: Icon(Icons.people_outline), label: '好友'),
          const NavigationDestination(icon: Icon(Icons.groups_outlined), label: '群组'),
          const NavigationDestination(icon: Icon(Icons.person_outline), label: '我的'),
        ],
      ),
      floatingActionButton: chat.wsState == 'connected'
          ? null
          : FloatingActionButton.extended(
              onPressed: chat.reconnectWs,
              icon: const Icon(Icons.wifi_find),
              label: Text(chat.wsState == 'reconnecting' ? '重连中' : '重连'),
            ),
    );
  }
}

class _BadgeIcon extends StatelessWidget {
  const _BadgeIcon({
    required this.icon,
    required this.count,
  });

  final IconData icon;
  final int count;

  @override
  Widget build(BuildContext context) {
    if (count <= 0) {
      return Icon(icon);
    }
    return Badge(
      label: Text(count > 99 ? '99+' : '$count'),
      child: Icon(icon),
    );
  }
}

class _ChatsTab extends StatelessWidget {
  const _ChatsTab();

  @override
  Widget build(BuildContext context) {
    final chat = context.watch<ChatController>();
    return Scaffold(
      appBar: AppBar(title: const Text('会话')),
      body: RefreshIndicator(
        onRefresh: chat.loadSessions,
        child: chat.loadingSessions
            ? const Center(child: CircularProgressIndicator())
            : ListView.builder(
                itemCount: chat.sessions.length,
                itemBuilder: (_, index) {
                  final session = chat.sessions[index];
                  return ListTile(
                    title: Text(session.targetName),
                    subtitle: Text(session.lastMessage ?? ''),
                    trailing: session.unreadCount > 0 ? CircleAvatar(radius: 10, child: Text('${session.unreadCount}', style: const TextStyle(fontSize: 10))) : null,
                    onTap: () => _openChat(context, session),
                  );
                },
              ),
      ),
    );
  }

  void _openChat(BuildContext context, ChatSession session) {
    Navigator.of(context).push(
      MaterialPageRoute(builder: (_) => ChatScreen(session: session)),
    );
  }
}

class _FriendsTab extends StatelessWidget {
  const _FriendsTab();

  @override
  Widget build(BuildContext context) {
    final chat = context.watch<ChatController>();
    return Scaffold(
      appBar: AppBar(title: const Text('好友')),
      body: RefreshIndicator(
        onRefresh: chat.loadFriends,
        child: ListView.builder(
          itemCount: chat.friends.length,
          itemBuilder: (_, index) {
            final item = chat.friends[index];
            return ListTile(
              leading: const CircleAvatar(child: Icon(Icons.person)),
              title: Text(item.nickname?.isNotEmpty == true ? item.nickname! : item.username),
              subtitle: Text('ID: ${item.userId}'),
              onTap: () {
                final session = chat.ensureSessionForFriend(item);
                Navigator.of(context).push(
                  MaterialPageRoute(builder: (_) => ChatScreen(session: session)),
                );
              },
            );
          },
        ),
      ),
    );
  }
}

class _GroupsTab extends StatelessWidget {
  const _GroupsTab();

  @override
  Widget build(BuildContext context) {
    final chat = context.watch<ChatController>();
    return Scaffold(
      appBar: AppBar(title: const Text('群组')),
      body: RefreshIndicator(
        onRefresh: chat.loadGroups,
        child: ListView.builder(
          itemCount: chat.groups.length,
          itemBuilder: (_, index) {
            final item = chat.groups[index];
            return ListTile(
              leading: const CircleAvatar(child: Icon(Icons.group)),
              title: Text(item.groupName),
              subtitle: Text(item.description ?? ''),
              onTap: () {
                final session = chat.ensureSessionForGroup(item);
                Navigator.of(context).push(
                  MaterialPageRoute(builder: (_) => ChatScreen(session: session)),
                );
              },
            );
          },
        ),
      ),
    );
  }
}

class _ProfileTab extends StatelessWidget {
  const _ProfileTab();

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthController>();
    final chat = context.watch<ChatController>();
    return Scaffold(
      appBar: AppBar(title: const Text('我的')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          ListTile(
            contentPadding: EdgeInsets.zero,
            title: Text(auth.user?.nickname?.isNotEmpty == true ? auth.user!.nickname! : (auth.user?.username ?? '')),
            subtitle: Text('ID: ${auth.user?.id ?? ''}'),
          ),
          ListTile(
            contentPadding: EdgeInsets.zero,
            title: const Text('连接状态'),
            subtitle: Text(chat.wsState),
            trailing: TextButton(
              onPressed: chat.reconnectWs,
              child: const Text('重连'),
            ),
          ),
          const SizedBox(height: 20),
          FilledButton.tonalIcon(
            onPressed: () => context.read<AuthController>().logout(),
            icon: const Icon(Icons.logout),
            label: const Text('退出登录'),
          ),
        ],
      ),
    );
  }
}
