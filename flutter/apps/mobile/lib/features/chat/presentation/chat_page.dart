import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:im_core/core.dart';
import 'package:im_mobile/features/auth/auth.dart';
import '../presentation/chat_providers.dart';
import 'widgets/session_tile.dart';
import 'widgets/message_bubble.dart';
import 'widgets/message_input.dart';

class ChatPage extends ConsumerStatefulWidget {
  const ChatPage({super.key});

  @override
  ConsumerState<ChatPage> createState() => _ChatPageState();
}

class _ChatPageState extends ConsumerState<ChatPage> {
  final _searchController = TextEditingController();
  final _scrollController = ScrollController();
  final _messageInputFocusNode = FocusNode();
  String _searchQuery = '';

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      ref.read(chatStateProvider.notifier).loadSessions();
    });
  }

  @override
  void dispose() {
    _searchController.dispose();
    _scrollController.dispose();
    _messageInputFocusNode.dispose();
    super.dispose();
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

  Future<void> _selectSession(ChatSession session) async {
    final notifier = ref.read(chatStateProvider.notifier);
    notifier.setActiveSession(session.id);
    final isGroup =
        session.conversationType == 'group' || session.type == 'group';
    if (isGroup) {
      await notifier.loadGroupMessages(session.targetId);
    } else {
      await notifier.loadMessages(session.targetId);
    }
  }

  @override
  Widget build(BuildContext context) {
    final chatState = ref.watch(chatStateProvider);
    final activeId = chatState.activeSessionId;
    final sessions = chatState.sessions.where((s) {
      if (_searchQuery.isEmpty) return true;
      final query = _searchQuery.toLowerCase();
      return s.targetName.toLowerCase().contains(query);
    }).toList();

    return CallbackShortcuts(
      bindings: {
        LogicalKeySet(LogicalKeyboardKey.escape): () {
          ref.read(chatStateProvider.notifier).setActiveSession(null);
        },
      },
      child: Focus(
        autofocus: true,
        child: Row(
          children: [
            // Session list sidebar
            SizedBox(
              width: 320,
              child: _buildSessionList(sessions, activeId),
            ),
            // Divider
            const VerticalDivider(width: 1),
            // Chat view
            Expanded(
              child: activeId == null
                  ? const Center(child: Text('选择一个会话'))
                  : _buildChatView(activeId),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildSessionList(List<ChatSession> sessions, String? activeId) {
    return Column(
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
              contentPadding:
                  const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
              isDense: true,
            ),
            onChanged: (v) => setState(() => _searchQuery = v),
          ),
        ),
        Expanded(
          child: ref.watch(chatStateProvider).isLoading
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
                          onTap: () => _selectSession(session),
                        );
                      },
                    ),
        ),
      ],
    );
  }

  Widget _buildChatView(String sessionId) {
    ref.listen(chatStateProvider.select((s) => s.messages[sessionId]),
        (prev, next) {
      if (next != null && (prev == null || next.length > prev.length)) {
        _scrollToBottom();
      }
    });

    ref.listen(chatStateProvider.select((s) => s.error), (prev, next) {
      if (next != null && next != prev) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(next)),
        );
      }
    });

    final chatState = ref.watch(chatStateProvider);
    final messages = chatState.messages[sessionId] ?? [];
    final session =
        chatState.sessions.where((s) => s.id == sessionId).firstOrNull;

    if (session == null) {
      return const Center(child: Text('会话不存在'));
    }

    final isGroup =
        session.conversationType == 'group' || session.type == 'group';
    final currentUserId = ref.read(currentUserIdProvider) ?? '';

    return Column(
      children: [
        // Header
        Container(
          height: 56,
          padding: const EdgeInsets.symmetric(horizontal: 16),
          decoration: BoxDecoration(
            color: Theme.of(context).colorScheme.surface,
            border: Border(
              bottom: BorderSide(
                color: Theme.of(context).colorScheme.outlineVariant,
              ),
            ),
          ),
          child: Row(
            children: [
              CircleAvatar(
                radius: 18,
                backgroundImage: session.targetAvatar != null
                    ? NetworkImage(session.targetAvatar!)
                    : null,
                child: session.targetAvatar == null
                    ? Text(
                        session.targetName.isNotEmpty
                            ? session.targetName[0].toUpperCase()
                            : '?',
                        style: const TextStyle(fontSize: 14),
                      )
                    : null,
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      session.targetName,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontSize: 15,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    if (isGroup)
                      Text(
                        session.memberCount != null
                            ? '${session.memberCount} 人'
                            : '群聊',
                        style: TextStyle(
                          fontSize: 12,
                          color: Theme.of(context).colorScheme.onSurfaceVariant,
                        ),
                      ),
                  ],
                ),
              ),
            ],
          ),
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
                    return MessageBubble(
                      message: msg,
                      isMe: msg.senderId == currentUserId,
                    );
                  },
                ),
        ),
        // Input
        MessageInput(
          focusNode: _messageInputFocusNode,
          onSend: (text, mentionedUserIds) {
            if (isGroup) {
              ref.read(chatStateProvider.notifier).sendGroupMessage(
                    session.targetId,
                    text,
                    mentionedUserIds:
                        mentionedUserIds.isNotEmpty ? mentionedUserIds : null,
                  );
            } else {
              ref.read(chatStateProvider.notifier).sendMessage(
                    session.targetId,
                    text,
                  );
            }
          },
          onSendImage: (result) {
            if (isGroup) {
              ref.read(chatStateProvider.notifier).sendGroupMessage(
                    session.targetId,
                    '',
                    messageType: 'IMAGE',
                    mediaUrl: result.url,
                    mediaName: result.name,
                    mediaSize: result.size,
                    thumbnailUrl: result.thumbnailUrl,
                  );
            } else {
              ref.read(chatStateProvider.notifier).sendMessage(
                    session.targetId,
                    '',
                    messageType: 'IMAGE',
                    mediaUrl: result.url,
                    mediaName: result.name,
                    mediaSize: result.size,
                    thumbnailUrl: result.thumbnailUrl,
                  );
            }
          },
          onSendFile: (result) {
            if (isGroup) {
              ref.read(chatStateProvider.notifier).sendGroupMessage(
                    session.targetId,
                    '',
                    messageType: 'FILE',
                    mediaUrl: result.url,
                    mediaName: result.name,
                    mediaSize: result.size,
                  );
            } else {
              ref.read(chatStateProvider.notifier).sendMessage(
                    session.targetId,
                    '',
                    messageType: 'FILE',
                    mediaUrl: result.url,
                    mediaName: result.name,
                    mediaSize: result.size,
                  );
            }
          },
          onSendVoice: (result) {
            if (isGroup) {
              ref.read(chatStateProvider.notifier).sendGroupMessage(
                    session.targetId,
                    '',
                    messageType: 'VOICE',
                    mediaUrl: result.url,
                    mediaName: result.name,
                    mediaSize: result.size,
                  );
            } else {
              ref.read(chatStateProvider.notifier).sendMessage(
                    session.targetId,
                    '',
                    messageType: 'VOICE',
                    mediaUrl: result.url,
                    mediaName: result.name,
                    mediaSize: result.size,
                  );
            }
          },
        ),
      ],
    );
  }
}
