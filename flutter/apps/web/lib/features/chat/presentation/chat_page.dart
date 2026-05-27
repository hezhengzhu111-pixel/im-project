import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:im_core/core.dart';
import 'package:im_web/core/di/providers.dart';
import '../../auth/presentation/auth_provider.dart';
import '../../e2ee/presentation/encryption_banner.dart';
import '../../e2ee/presentation/e2ee_provider.dart';
import 'widgets/session_tile.dart';
import 'widgets/message_bubble.dart';
import 'widgets/message_input.dart';

class ChatPage extends ConsumerStatefulWidget {
  const ChatPage({this.sessionId, super.key});
  final String? sessionId;

  @override
  ConsumerState<ChatPage> createState() => _ChatPageState();
}

class _ChatPageState extends ConsumerState<ChatPage> {
  final _searchController = TextEditingController();
  String _searchQuery = '';
  final _scrollController = ScrollController();

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      ref.read(chatStateProvider.notifier).loadSessions();
    });
  }

  @override
  Widget build(BuildContext context) {
    final chatState = ref.watch(chatStateProvider);
    final activeId = chatState.activeSessionId;
    final sessions = chatState.sessions.where((s) {
      if (_searchQuery.isEmpty) return true;
      return s.targetName.toLowerCase().contains(_searchQuery.toLowerCase());
    }).toList();

    return Row(
      children: [
        // Session list panel
        SizedBox(
          width: 320,
          child: Column(
            children: [
              Padding(
                padding: const EdgeInsets.all(12),
                child: TextField(
                  controller: _searchController,
                  decoration: InputDecoration(
                    hintText: '搜索会话...',
                    prefixIcon: const Icon(Icons.search, size: 20),
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(24),
                    ),
                    contentPadding: const EdgeInsets.symmetric(
                      horizontal: 16,
                      vertical: 10,
                    ),
                    isDense: true,
                  ),
                  onChanged: (v) => setState(() => _searchQuery = v),
                ),
              ),
              Expanded(
                child: chatState.isLoading
                    ? const Center(child: CircularProgressIndicator())
                    : sessions.isEmpty
                        ? const Center(child: Text('暂无会话'))
                        : ListView.builder(
                            itemCount: sessions.length,
                            itemBuilder: (context, index) {
                              final session = sessions[index];
                              return SessionTile(
                                session: session,
                                isSelected: session.id == activeId,
                                onTap: () {
                                  ref
                                      .read(chatStateProvider.notifier)
                                      .setActiveSession(session.id);
                                  final isGroup =
                                      session.conversationType == 'group' ||
                                          session.type == 'group';
                                  if (isGroup) {
                                    ref
                                        .read(chatStateProvider.notifier)
                                        .loadGroupMessages(session.targetId);
                                  } else {
                                    ref
                                        .read(chatStateProvider.notifier)
                                        .loadMessages(session.targetId);
                                  }
                                },
                              );
                            },
                          ),
              ),
            ],
          ),
        ),
        const VerticalDivider(thickness: 1, width: 1),
        // Message area
        Expanded(
          child: activeId == null
              ? const Center(child: Text('选择一个会话开始聊天'))
              : _buildChatView(activeId),
        ),
      ],
    );
  }

  void _scrollToBottom() {
    if (_scrollController.hasClients) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (_scrollController.hasClients) {
          _scrollController.animateTo(
            _scrollController.position.maxScrollExtent,
            duration: const Duration(milliseconds: 200),
            curve: Curves.easeOut,
          );
        }
      });
    }
  }

  Widget _buildChatView(String sessionId) {
    ref.listen(chatStateProvider.select((s) => s.messages[sessionId]),
        (prev, next) {
      if (next != null && (prev == null || next.length > prev.length)) {
        _scrollToBottom();
      }
    });

    final chatState = ref.watch(chatStateProvider);
    final messages = chatState.messages[sessionId] ?? [];
    final session = chatState.sessions.where((s) => s.id == sessionId).firstOrNull;
    final isGroup = session?.conversationType == 'group' ||
        session?.type == 'group';
    final sessionName =
        session?.conversationName ?? session?.targetName ?? sessionId;
    final memberCount = session?.memberCount;

    return Column(
      children: [
        // Header
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          decoration: BoxDecoration(
            border: Border(
              bottom: BorderSide(color: Theme.of(context).dividerColor),
            ),
          ),
          child: Row(
            children: [
              Text(
                sessionName,
                style: Theme.of(context).textTheme.titleMedium?.copyWith(
                      fontWeight: FontWeight.w600,
                    ),
              ),
              if (isGroup && memberCount != null) ...[
                const SizedBox(width: 8),
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 6,
                    vertical: 2,
                  ),
                  decoration: BoxDecoration(
                    color: Theme.of(context)
                        .colorScheme
                        .primaryContainer
                        .withValues(alpha: 0.5),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Text(
                    '$memberCount 人',
                    style: Theme.of(context).textTheme.bodySmall?.copyWith(
                          color: Theme.of(context).colorScheme.primary,
                        ),
                  ),
                ),
              ],
              const Spacer(),
              if (messages.isNotEmpty)
                Text(
                  '${messages.length} 条消息',
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        color: Theme.of(context).colorScheme.onSurfaceVariant,
                      ),
                ),
            ],
          ),
        ),
        // E2EE encryption banner (private chats only)
        if (!isGroup)
          ref.watch(e2eeSessionStatusProvider(sessionId)).when(
            data: (statusStr) => EncryptionBanner(
              status: E2eeSessionStatus.fromString(statusStr),
              onExit: () async {
                await ref.read(e2eeManagerProvider).exitEncryption(sessionId);
                ref.invalidate(e2eeSessionStatusProvider(sessionId));
              },
            ),
            loading: () => const SizedBox.shrink(),
            error: (_, __) => const SizedBox.shrink(),
          ),
        // Messages
        Expanded(
          child: messages.isEmpty
              ? const Center(child: Text('暂无消息'))
              : ListView.builder(
                  controller: _scrollController,
                  padding: const EdgeInsets.symmetric(vertical: 8),
                  itemCount: messages.length,
                  itemBuilder: (context, index) {
                    final msg = messages[index];
                    final currentUserId =
                        ref.watch(authStateProvider).user?.id ?? '';
                    return MessageBubble(
                      message: msg,
                      isMe: msg.senderId == currentUserId,
                    );
                  },
                ),
        ),
        // Input
        MessageInput(
          onSend: (text) {
            if (session == null) return;
            if (isGroup) {
              ref.read(chatStateProvider.notifier).sendGroupMessage(
                    session.targetId,
                    text,
                  );
            } else {
              ref.read(chatStateProvider.notifier).sendMessage(
                    session.targetId,
                    text,
                  );
            }
          },
          onSendImage: (_) {
            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(content: Text('图片发送功能开发中...')),
            );
          },
          onSendFile: (_) {
            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(content: Text('文件发送功能开发中...')),
            );
          },
        ),
      ],
    );
  }

  @override
  void dispose() {
    _searchController.dispose();
    _scrollController.dispose();
    super.dispose();
  }
}
