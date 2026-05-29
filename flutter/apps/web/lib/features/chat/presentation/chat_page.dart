import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:im_core/core.dart';
import 'package:im_web/core/di/providers.dart';
import 'package:im_web/core/theme/glass_theme.dart';
import 'package:im_web/l10n/app_localizations.dart';
import 'package:im_ui/im_ui.dart';
import '../../e2ee/presentation/e2ee_glass_widgets.dart';
import 'widgets/session_tile.dart';
import 'widgets/message_bubble.dart';
import 'widgets/message_input.dart';
import 'widgets/network_status_banner.dart';
import 'widgets/load_more_history_button.dart';

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
  List<GroupMember> _groupMembers = [];

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
      if (!mounted) return;

      if (widget.sessionId != null) {
        await _openDeepLinkedSession(widget.sessionId!);
      } else {
        // No route sessionId: keep existing active session, or select first.
        final chatState = ref.read(chatStateProvider);
        if (chatState.activeSessionId == null &&
            chatState.sessions.isNotEmpty) {
          await _selectSession(chatState.sessions.first);
        }
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

    await _selectSession(session);
  }

  Future<void> _selectSession(dynamic session) async {
    final notifier = ref.read(chatStateProvider.notifier);
    notifier.setActiveSession(session.id);
    final isGroup =
        session.conversationType == 'group' || session.type == 'group';
    if (isGroup) {
      await notifier.loadGroupMessages(session.targetId);
      _loadGroupMembers(session.targetId);
    } else {
      await notifier.loadMessages(session.targetId);
      setState(() => _groupMembers = []);
    }

    // Check for cached negotiation request after switching session
    if (!isGroup && mounted) setState(() {});
  }

  Future<void> _loadGroupMembers(String groupId) async {
    try {
      final groupApi = ref.read(groupApiProvider);
      final members = await groupApi.getMembers(groupId);
      if (mounted) {
        setState(() => _groupMembers = members);
      }
    } catch (_) {
      // Silently fail - mention will just not show members
    }
  }

  @override
  Widget build(BuildContext context) {
    final chatState = ref.watch(chatStateProvider);
    final activeId = chatState.activeSessionId;
    final sessions = chatState.sessions.where((s) {
      if (_searchQuery.isEmpty) return true;
      final query = _searchQuery.toLowerCase();
      return s.targetName.toLowerCase().contains(query) ||
          (s.conversationName?.toLowerCase().contains(query) ?? false) ||
          (s.name?.toLowerCase().contains(query) ?? false) ||
          (s.lastMessage?.content.toLowerCase().contains(query) ?? false);
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
              Container(
                width: context.breakpoint
                    .value(
                      compact: 0,
                      medium: 0,
                      expanded: ImTokens.layoutChatSidebarWidth,
                      large: ImTokens.layoutChatSidebarWidth,
                    )
                    .toDouble(),
                color: Colors.transparent, // 透出外层 #F7F8FA 背景
                child: _buildSessionList(sessions, activeId, loc),
              ),
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
                          onTap: () => _selectSession(session),
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

  String? _e2eeSessionIdForSession(ChatSession session) {
    final isGroup =
        session.conversationType == 'group' || session.type == 'group';
    if (isGroup) return null;
    final currentUserId = ref.read(authStateProvider).user?.id ?? '';
    if (currentUserId.isEmpty || session.targetId.isEmpty) return null;
    return '${currentUserId}_private_${session.targetId}';
  }

  Future<void> _startEncryption(
    ChatSession session,
    String e2eeSessionId,
  ) async {
    final started = await ref
        .read(chatStateProvider.notifier)
        .initiateEncryptionForSession(session.id);
    ref.invalidate(e2eeSessionStatusProvider(e2eeSessionId));
    if (!started && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Failed to start encryption negotiation.'),
        ),
      );
    }
  }

  void _showGroupE2eeUnavailable() {
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text(
          'Group E2EE requires sender-key support before it can be enabled.',
        ),
      ),
    );
  }

  Widget _buildChatView(String sessionId, AppLocalizations loc) {
    final glass = Theme.of(context).extension<GlassTheme>()!;
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
          'e2ee_encrypt_failed' =>
            'Failed to encrypt message. Please restart encryption negotiation.',
          'group_e2ee_unavailable' =>
            'Group E2EE requires sender-key support before it can be enabled.',
          final e => e,
        };
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(errorMessage)),
        );
      }
    });

    // Listen for all E2EE negotiation events for notifications
    ref.listen(
      chatStateProvider.select((s) => s.pendingNegotiations),
      (prev, next) {
        if (next.length > (prev?.length ?? 0)) {
          for (final entry in next.entries) {
            if (prev == null || !prev.containsKey(entry.key)) {
              final event = entry.value;
              if (event.action == E2eeNegotiationAction.request) {
                final activeId = ref.read(chatStateProvider).activeSessionId;
                // Only show notification if not the current session
                if (entry.key != activeId && mounted) {
                  final name = event.requesterName ?? event.requesterId;
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(
                      content: Text(loc.e2eeNegotiationNotification(name)),
                      duration: const Duration(seconds: 5),
                    ),
                  );
                }
              }
            }
          }
        }
      },
    );

    final chatState = ref.watch(chatStateProvider);
    final messages = chatState.messages[sessionId] ?? [];
    final session =
        chatState.sessions.where((s) => s.id == sessionId).firstOrNull;
    if (session == null) return const SizedBox.shrink();
    final isGroup =
        session.conversationType == 'group' || session.type == 'group';
    final isMobile = context.isMobile;
    final e2eeSessionId = _e2eeSessionIdForSession(session);
    final privateE2eeSessionId = e2eeSessionId ?? '';
    final e2eeStatusAsync = e2eeSessionId == null
        ? null
        : ref.watch(e2eeSessionStatusProvider(e2eeSessionId));
    final pendingNegotiation = isGroup
        ? null
        : ref
            .read(chatStateProvider.notifier)
            .pendingNegotiationForSession(session.id);

    return Column(
      children: [
        // Network status banner
        const NetworkStatusBanner(),
        // Header
        _GlassChatHeader(
          session: session,
          isMobile: isMobile,
          onBackPressed: () {
            ref.read(chatStateProvider.notifier).setActiveSession(null);
          },
          e2eeStatus: e2eeStatusAsync?.whenOrNull(
            data: (statusStr) => E2eeSessionStatus.fromString(statusStr),
          ),
          onStartEncryption: e2eeSessionId == null
              ? null
              : () => _startEncryption(session, e2eeSessionId),
          onShowGroupEncryptionUnavailable:
              isGroup ? _showGroupE2eeUnavailable : null,
        ),
        // E2EE encryption banner (private chats only)
        if (e2eeStatusAsync != null)
          e2eeStatusAsync.when(
            data: (statusStr) => E2eeNegotiationBanner(
              status: E2eeSessionStatus.fromString(statusStr),
              pending: pendingNegotiation,
              onAccept: pendingNegotiation == null
                  ? null
                  : () async {
                      final accepted = await ref
                          .read(chatStateProvider.notifier)
                          .acceptPendingNegotiation(session.id);
                      ref.invalidate(
                        e2eeSessionStatusProvider(privateE2eeSessionId),
                      );
                      if (!accepted && mounted) {
                        ScaffoldMessenger.of(context).showSnackBar(
                          const SnackBar(content: Text('接受加密请求失败')),
                        );
                      }
                    },
              onReject: pendingNegotiation == null
                  ? null
                  : () async {
                      await ref
                          .read(chatStateProvider.notifier)
                          .rejectPendingNegotiation(session.id);
                      ref.invalidate(
                        e2eeSessionStatusProvider(privateE2eeSessionId),
                      );
                    },
              onStart: () => _startEncryption(session, privateE2eeSessionId),
              onExit: () async {
                await ref
                    .read(chatStateProvider.notifier)
                    .disableEncryptionForSession(privateE2eeSessionId);
                ref.invalidate(
                  e2eeSessionStatusProvider(privateE2eeSessionId),
                );
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
                  itemCount: messages.length + 1,
                  itemBuilder: (context, index) {
                    if (index == 0) {
                      return LoadMoreHistoryButton(sessionId: sessionId);
                    }
                    final msg = messages[index - 1];
                    final currentUserId =
                        ref.watch(authStateProvider).user?.id ?? '';
                    return AnimatedEntrance(
                      duration: glass.animationDuration,
                      offset: 8,
                      child: MessageBubble(
                        message: msg,
                        isMe: msg.senderId == currentUserId,
                      ),
                    );
                  },
                ),
        ),
        // Input
        MessageInput(
          focusNode: _messageInputFocusNode,
          onFocusChanged: (focused) =>
              setState(() => _messageInputFocused = focused),
          members: isGroup ? _groupMembers : null,
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

class _GlassChatHeader extends StatelessWidget {
  const _GlassChatHeader({
    required this.session,
    required this.isMobile,
    required this.onBackPressed,
    this.e2eeStatus,
    this.onStartEncryption,
    this.onShowGroupEncryptionUnavailable,
  });

  final ChatSession session;
  final bool isMobile;
  final VoidCallback onBackPressed;
  final E2eeSessionStatus? e2eeStatus;
  final VoidCallback? onStartEncryption;
  final VoidCallback? onShowGroupEncryptionUnavailable;

  @override
  Widget build(BuildContext context) {
    final loc = AppLocalizations.of(context)!;
    final sessionName = session.conversationName ?? session.targetName;
    final isGroup =
        session.conversationType == 'group' || session.type == 'group';
    final status = e2eeStatus ?? E2eeSessionStatus.plaintext;
    final subtitle = isGroup
        ? (session.memberCount == null
            ? '群聊'
            : loc.chatMemberCount(session.memberCount!))
        : switch (status) {
            E2eeSessionStatus.encrypted => '安全会话',
            E2eeSessionStatus.negotiating => '正在协商安全会话',
            E2eeSessionStatus.failed => '加密状态异常',
            E2eeSessionStatus.plaintext => '在线 / 明文聊天',
          };

    return Container(
      height: 76,
      margin: const EdgeInsets.fromLTRB(18, 0, 18, 10),
      padding: const EdgeInsets.symmetric(horizontal: 20),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.28),
        borderRadius: BorderRadius.circular(22),
        border: Border.all(color: Colors.white.withValues(alpha: 0.42)),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.05),
            blurRadius: 18,
            offset: const Offset(0, 8),
          ),
        ],
      ),
      child: Row(
        children: [
          if (isMobile)
            IconButton(
              icon: const Icon(Icons.arrow_back),
              onPressed: onBackPressed,
            ),
          CircleAvatar(
            radius: 20,
            backgroundImage: session.targetAvatar != null
                ? NetworkImage(session.targetAvatar!)
                : null,
            child: session.targetAvatar == null
                ? Text(sessionName.isNotEmpty ? sessionName[0] : '?')
                : null,
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  sessionName,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.w800,
                      ),
                ),
                const SizedBox(height: 2),
                Text(
                  subtitle,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        color: Theme.of(context).colorScheme.onSurfaceVariant,
                      ),
                ),
              ],
            ),
          ),
          if (!isGroup && e2eeStatus != null) ...[
            E2eeStatusPill(status: status),
            if (status == E2eeSessionStatus.plaintext &&
                onStartEncryption != null) ...[
              const SizedBox(width: 10),
              PrimarySolidButton(
                label: '开启加密',
                icon: Icons.lock_outline,
                compact: true,
                onPressed: onStartEncryption,
              ),
            ],
          ],
          if (isGroup && onShowGroupEncryptionUnavailable != null)
            IconButton(
              tooltip: 'Group E2EE unavailable',
              icon: const Icon(Icons.lock_outline),
              onPressed: onShowGroupEncryptionUnavailable,
            ),
        ],
      ),
    );
  }
}
