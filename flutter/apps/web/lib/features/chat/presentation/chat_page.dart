import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:im_core/core.dart';
import 'package:im_web/core/di/providers.dart';
import 'package:im_web/l10n/app_localizations.dart';
import 'package:im_ui/im_ui.dart';
import '../../e2ee/presentation/encryption_banner.dart';
import 'widgets/session_tile.dart';
import 'widgets/message_bubble.dart';
import 'widgets/message_input.dart';
import 'widgets/network_status_banner.dart';

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
  final _messageInputFocusNode = FocusNode();
  bool _messageInputFocused = false;

  void _handleEsc() {
    if (_messageInputFocused) {
      _messageInputFocusNode.unfocus();
    } else {
      ref.read(chatStateProvider.notifier).setActiveSession(null);
    }
  }

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      await ref.read(chatStateProvider.notifier).loadSessions();
      if (widget.sessionId != null && mounted) {
        await _openDeepLinkedSession(widget.sessionId!);
      }
    });
  }

  @override
  void didUpdateWidget(covariant ChatPage oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.sessionId != null && widget.sessionId != oldWidget.sessionId) {
      WidgetsBinding.instance.addPostFrameCallback((_) async {
        if (mounted) {
          await _openDeepLinkedSession(widget.sessionId!);
        }
      });
    }
  }

  Future<void> _openDeepLinkedSession(String rawSessionId) async {
    final notifier = ref.read(chatStateProvider.notifier);
    notifier.setActiveSession(rawSessionId);
    final activeSessionId = ref.read(chatStateProvider).activeSessionId;
    if (activeSessionId == null) return;

    final session = ref
        .read(chatStateProvider)
        .sessions
        .where((s) => s.id == activeSessionId)
        .firstOrNull;
    if (session == null) return;

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
      return s.targetName.toLowerCase().contains(_searchQuery.toLowerCase());
    }).toList();
    final loc = AppLocalizations.of(context)!;

    return CallbackShortcuts(
      bindings: {
        LogicalKeySet(LogicalKeyboardKey.escape): _handleEsc,
      },
      child: Focus(
        autofocus: true,
        child: AdaptivePane(
          compact: activeId != null
              ? _buildChatView(activeId, loc)
              : _buildSessionList(sessions, activeId, loc),
          medium: activeId != null
              ? _buildChatView(activeId, loc)
              : _buildSessionList(sessions, activeId, loc),
          expanded: Row(
            children: [
              SizedBox(
                width: context.breakpoint
                    .value(
                      compact: 0,
                      medium: 0,
                      expanded: ImTokens.layoutChatSidebarWidth,
                      large: ImTokens.layoutChatSidebarWidth,
                    )
                    .toDouble(),
                child: _buildSessionList(sessions, activeId, loc),
              ),
              const VerticalDivider(thickness: 1, width: 1),
              Expanded(
                child: activeId == null
                    ? Center(child: Text(loc.chatSelectSession))
                    : _buildChatView(activeId, loc),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildSessionList(
      List<dynamic> sessions, String? activeId, AppLocalizations loc) {
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.all(ImTokens.layoutSectionGap),
          child: TextField(
            controller: _searchController,
            decoration: InputDecoration(
              hintText: loc.chatSearchHint,
              prefixIcon: const Icon(Icons.search, size: ImTokens.textXl),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(ImTokens.radiusFull),
              ),
              contentPadding: const EdgeInsets.symmetric(
                horizontal: ImTokens.space4,
                vertical: 10,
              ),
              isDense: true,
            ),
            onChanged: (v) => setState(() => _searchQuery = v),
          ),
        ),
        Expanded(
          child: ref.watch(chatStateProvider).isLoading
              ? const Center(child: CircularProgressIndicator())
              : sessions.isEmpty
                  ? Center(child: Text(loc.chatNoSessions))
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

  Widget _buildChatView(String sessionId, AppLocalizations loc) {
    ref.listen(chatStateProvider.select((s) => s.messages[sessionId]),
        (prev, next) {
      if (next != null && (prev == null || next.length > prev.length)) {
        _scrollToBottom();
      }
    });

    ref.listen(chatStateProvider.select((s) => s.error), (prev, next) {
      if (next != null && next != prev) {
        final errorMessage = switch (next) {
          'e2ee_not_ready' => loc.errorE2eeNotReady,
          final e => e,
        };
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(errorMessage)),
        );
      }
    });

    final chatState = ref.watch(chatStateProvider);
    final messages = chatState.messages[sessionId] ?? [];
    final session =
        chatState.sessions.where((s) => s.id == sessionId).firstOrNull;
    final isGroup =
        session?.conversationType == 'group' || session?.type == 'group';
    final sessionName =
        session?.conversationName ?? session?.targetName ?? sessionId;
    final memberCount = session?.memberCount;
    final isMobile = context.isMobile;

    return Column(
      children: [
        // Network status banner
        const NetworkStatusBanner(),
        // Header
        Container(
          padding: const EdgeInsets.symmetric(
            horizontal: ImTokens.space4,
            vertical: ImTokens.space3,
          ),
          decoration: BoxDecoration(
            border: Border(
              bottom: BorderSide(color: Theme.of(context).dividerColor),
            ),
          ),
          child: Row(
            children: [
              if (isMobile)
                IconButton(
                  icon: const Icon(Icons.arrow_back),
                  onPressed: () {
                    ref.read(chatStateProvider.notifier).setActiveSession(null);
                  },
                ),
              Text(
                sessionName,
                style: Theme.of(context).textTheme.titleMedium?.copyWith(
                      fontWeight: FontWeight.w600,
                    ),
              ),
              if (isGroup && memberCount != null) ...[
                const SizedBox(width: ImTokens.layoutItemGap),
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
                    borderRadius: BorderRadius.circular(ImTokens.radiusMd),
                  ),
                  child: Text(
                    loc.chatMemberCount(memberCount),
                    style: Theme.of(context).textTheme.bodySmall?.copyWith(
                          color: Theme.of(context).colorScheme.primary,
                        ),
                  ),
                ),
              ],
              const Spacer(),
              if (messages.isNotEmpty)
                Text(
                  loc.chatMessageCount(messages.length),
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
                    await ref
                        .read(e2eeManagerProvider)
                        .exitEncryption(sessionId);
                    ref.invalidate(e2eeSessionStatusProvider(sessionId));
                  },
                ),
                loading: () => const SizedBox.shrink(),
                error: (_, __) => const SizedBox.shrink(),
              ),
        // Messages
        Expanded(
          child: messages.isEmpty
              ? Center(child: Text(loc.noData))
              : ListView.builder(
                  controller: _scrollController,
                  padding:
                      const EdgeInsets.symmetric(vertical: ImTokens.space2),
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
          focusNode: _messageInputFocusNode,
          onFocusChanged: (focused) =>
              setState(() => _messageInputFocused = focused),
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
          onSendImage: (result) {
            if (session == null) return;
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
            if (session == null) return;
            if (isGroup) {
              ref.read(chatStateProvider.notifier).sendGroupMessage(
                    session.targetId,
                    '',
                    messageType: 'FILE',
                    mediaUrl: result.url,
                    mediaName: result.name,
                    mediaSize: result.size,
                    thumbnailUrl: result.thumbnailUrl,
                  );
            } else {
              ref.read(chatStateProvider.notifier).sendMessage(
                    session.targetId,
                    '',
                    messageType: 'FILE',
                    mediaUrl: result.url,
                    mediaName: result.name,
                    mediaSize: result.size,
                    thumbnailUrl: result.thumbnailUrl,
                  );
            }
          },
          onSendVoice: (result) {
            if (session == null) return;
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

  @override
  void dispose() {
    _searchController.dispose();
    _scrollController.dispose();
    _messageInputFocusNode.dispose();
    super.dispose();
  }
}
