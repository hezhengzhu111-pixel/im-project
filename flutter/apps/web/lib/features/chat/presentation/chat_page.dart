import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:im_core/core.dart';
import 'package:im_shared_features/chat.dart' show ChatState;
import 'package:im_web/core/di/providers.dart';
import 'package:im_web/features/auth/presentation/auth_provider.dart';
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
  bool _initialLoadStarted = false;
  ProviderSubscription<AuthState>? _authSubscription;
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
    _authSubscription = ref.listenManual<AuthState>(
      authStateProvider,
      (_, next) {
        if (next.isAuthenticated) {
          _scheduleInitialLoad();
        }
      },
    );
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _scheduleInitialLoad();
    });
  }

  void _scheduleInitialLoad() {
    if (!mounted || _initialLoadStarted) return;
    final authState = ref.read(authStateProvider);
    if (!authState.isAuthenticated) return;
    _initialLoadStarted = true;
    unawaited(_loadInitialChatState());
  }

  Future<void> _loadInitialChatState() async {
    await ref.read(chatStateProvider.notifier).loadSessions();
    if (!mounted) return;

    if (widget.sessionId != null) {
      await _openDeepLinkedSession(widget.sessionId!);
    } else {
      // No route sessionId: keep existing active session, or select first.
      final chatState = ref.read(chatStateProvider);
      if (chatState.activeSessionId == null && chatState.sessions.isNotEmpty) {
        await _selectSession(chatState.sessions.first);
      }
    }
  }

  @override
  void didUpdateWidget(covariant ChatPage oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.sessionId != null && widget.sessionId != oldWidget.sessionId) {
      WidgetsBinding.instance.addPostFrameCallback((_) async {
        if (mounted && ref.read(authStateProvider).isAuthenticated) {
          await _openDeepLinkedSession(widget.sessionId!);
        }
      });
    }
  }

  Future<void> _openDeepLinkedSession(String rawSessionId) async {
    final session =
        _resolveDeepLinkedSession(rawSessionId, ref.read(chatStateProvider));
    if (session == null) return;

    await _selectSession(session);
  }

  ChatSession? _resolveDeepLinkedSession(
    String rawSessionId,
    ChatState chatState,
  ) {
    if (rawSessionId.isEmpty) return null;

    String groupTargetId(String value) {
      if (value.startsWith('group_')) return value.substring('group_'.length);
      if (value.startsWith('g_')) return value.substring('g_'.length);
      return value;
    }

    final normalizedGroupId = groupTargetId(rawSessionId);
    return chatState.sessions.where((session) {
      if (session.id == rawSessionId ||
          session.conversationId == rawSessionId ||
          session.targetId == rawSessionId) {
        return true;
      }

      final isGroup =
          session.conversationType == 'group' || session.type == 'group';
      return isGroup && session.targetId == normalizedGroupId;
    }).firstOrNull;
  }

  Future<void> _selectSession(ChatSession session) async {
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
    final authState = ref.watch(authStateProvider);
    if (!authState.authReady) {
      return const Center(child: CircularProgressIndicator());
    }
    if (!authState.isAuthenticated) {
      return const SizedBox.shrink();
    }

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
        child: ColoredBox(
          color: ImTokens.wechatPageBg,
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
                  decoration: BoxDecoration(
                    color: ImTokens.wechatPanelBg,
                    border: Border(
                      right: BorderSide(color: Theme.of(context).dividerColor),
                    ),
                  ),
                  child: _buildSessionList(sessions, activeId, loc),
                ),
                Expanded(
                  child: activeId == null
                      ? _ChatEmptyState(message: loc.chatSelectSession)
                      : _buildChatView(activeId, loc),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildSessionList(
      List<ChatSession> sessions, String? activeId, AppLocalizations loc) {
    final chatState = ref.watch(chatStateProvider);

    return ColoredBox(
      color: ImTokens.wechatPanelBg,
      child: Column(
        children: [
          Container(
            padding: const EdgeInsets.fromLTRB(12, 8, 12, 10),
            decoration: BoxDecoration(
              color: ImTokens.wechatPanelBg,
              border: Border(
                bottom: BorderSide(color: Theme.of(context).dividerColor),
              ),
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        loc.navChat,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style:
                            Theme.of(context).textTheme.titleMedium?.copyWith(
                                  fontWeight: FontWeight.w700,
                                ),
                      ),
                    ),
                    IconButton(
                      icon: const Icon(Icons.person_add_alt_1, size: 20),
                      tooltip: loc.contactsAddFriend,
                      onPressed: () => context.go('/contacts/add'),
                    ),
                  ],
                ),
                const SizedBox(height: 6),
                TextField(
                  controller: _searchController,
                  style: const TextStyle(
                    fontSize: 14,
                    color: ImTokens.wechatTextPrimary,
                  ),
                  decoration: InputDecoration(
                    hintText: loc.chatSearchHint,
                    prefixIcon: const Icon(
                      Icons.search,
                      size: 18,
                      color: ImTokens.wechatTextSecondary,
                    ),
                    filled: true,
                    fillColor: ImTokens.wechatSearchBg,
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(4),
                      borderSide: BorderSide.none,
                    ),
                    contentPadding:
                        const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                    isDense: true,
                  ),
                  onChanged: (v) => setState(() => _searchQuery = v),
                ),
              ],
            ),
          ),
          Expanded(
            child: chatState.isLoading && sessions.isEmpty
                ? const _SessionListSkeleton()
                : sessions.isEmpty && chatState.error != null
                    ? _SessionListError(
                        message: loc.loadingFailed(chatState.error!),
                        onRetry: () =>
                            ref.read(chatStateProvider.notifier).loadSessions(),
                      )
                    : sessions.isEmpty
                        ? _SessionEmptyState(message: loc.chatNoSessions)
                        : ListView.builder(
                            padding: EdgeInsets.zero,
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
      ),
    );
  }

  bool _isNearBottom() {
    if (!_scrollController.hasClients) return true;
    final position = _scrollController.position;
    return position.maxScrollExtent - position.pixels <= 180;
  }

  void _scrollToBottom({bool force = false}) {
    if (!_scrollController.hasClients) return;
    if (!force && !_isNearBottom()) return;

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

  String? _e2eeSessionIdForSession(ChatSession session) {
    final isGroup =
        session.conversationType == 'group' || session.type == 'group';
    if (isGroup) return null;
    final currentUserId = ref.read(authStateProvider).user?.id ?? '';
    if (currentUserId.isEmpty || session.targetId.isEmpty) return null;
    return _compareIds(currentUserId, session.targetId) <= 0
        ? 'p_${currentUserId}_${session.targetId}'
        : 'p_${session.targetId}_$currentUserId';
  }

  int _compareIds(String left, String right) {
    final leftId = BigInt.tryParse(left);
    final rightId = BigInt.tryParse(right);
    if (leftId != null &&
        rightId != null &&
        leftId > BigInt.zero &&
        rightId > BigInt.zero) {
      return leftId.compareTo(rightId);
    }
    return left.compareTo(right);
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
    ref.listen(chatStateProvider.select((s) => s.messages[sessionId]),
        (prev, next) {
      if (next != null && (prev == null || next.length > prev.length)) {
        final currentUserId = ref.read(authStateProvider).user?.id ?? '';
        final fromCurrentUser =
            next.isNotEmpty && next.last.senderId == currentUserId;
        _scrollToBottom(force: prev == null || fromCurrentUser);
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

    return Container(
      color: ImTokens.wechatPageBg,
      child: Column(
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
                            const SnackBar(
                              content: Text(
                                'Failed to accept encryption request.',
                              ),
                            ),
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
                ? _ChatEmptyState(message: loc.noData)
                : ListView.builder(
                    controller: _scrollController,
                    padding: const EdgeInsets.symmetric(
                      horizontal: 2,
                      vertical: 12,
                    ),
                    itemCount: messages.length + 1,
                    itemBuilder: (context, index) {
                      if (index == 0) {
                        return LoadMoreHistoryButton(sessionId: sessionId);
                      }
                      final msg = messages[index - 1];
                      final currentUserId =
                          ref.watch(authStateProvider).user?.id ?? '';
                      return AnimatedEntrance(
                        duration: ImTokens.animFast,
                        offset: 4,
                        child: MessageBubble(
                          message: msg,
                          isMe: msg.senderId == currentUserId,
                          onRetry: () => ref
                              .read(chatStateProvider.notifier)
                              .retryMessage(
                                sessionId,
                                msg.clientMessageId ?? msg.messageId ?? msg.id,
                              ),
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
                return ref.read(chatStateProvider.notifier).sendGroupMessage(
                      session.targetId,
                      text,
                      mentionedUserIds:
                          mentionedUserIds.isNotEmpty ? mentionedUserIds : null,
                    );
              } else {
                return ref.read(chatStateProvider.notifier).sendMessage(
                      session.targetId,
                      text,
                    );
              }
            },
            onSendImage: (result) {
              if (isGroup) {
                return ref.read(chatStateProvider.notifier).sendGroupMessage(
                      session.targetId,
                      '',
                      messageType: 'IMAGE',
                      mediaUrl: result.url,
                      mediaName: result.name,
                      mediaSize: result.size,
                      thumbnailUrl: result.thumbnailUrl,
                    );
              } else {
                return ref.read(chatStateProvider.notifier).sendMessage(
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
                return ref.read(chatStateProvider.notifier).sendGroupMessage(
                      session.targetId,
                      '',
                      messageType: 'FILE',
                      mediaUrl: result.url,
                      mediaName: result.name,
                      mediaSize: result.size,
                      thumbnailUrl: result.thumbnailUrl,
                    );
              } else {
                return ref.read(chatStateProvider.notifier).sendMessage(
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
                return ref.read(chatStateProvider.notifier).sendGroupMessage(
                      session.targetId,
                      '',
                      messageType: 'VOICE',
                      mediaUrl: result.url,
                      mediaName: result.name,
                      mediaSize: result.size,
                    );
              } else {
                return ref.read(chatStateProvider.notifier).sendMessage(
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
      ),
    );
  }

  @override
  void dispose() {
    _authSubscription?.close();
    _searchController.dispose();
    _scrollController.dispose();
    _messageInputFocusNode.dispose();
    super.dispose();
  }
}

class _SessionListSkeleton extends StatelessWidget {
  const _SessionListSkeleton();

  @override
  Widget build(BuildContext context) {
    final color = ImTokens.wechatTextSecondary.withValues(alpha: 0.12);
    return ListView.builder(
      itemCount: 7,
      itemBuilder: (context, index) {
        return Container(
          height: 72,
          padding: const EdgeInsets.symmetric(horizontal: 12),
          decoration: BoxDecoration(
            border: Border(
              bottom: BorderSide(color: Theme.of(context).dividerColor),
            ),
          ),
          child: Row(
            children: [
              DecoratedBox(
                decoration: BoxDecoration(
                  color: color,
                  shape: BoxShape.circle,
                ),
                child: const SizedBox(width: 46, height: 46),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    FractionallySizedBox(
                      widthFactor: index.isEven ? 0.58 : 0.42,
                      child: DecoratedBox(
                        decoration: BoxDecoration(
                          color: color,
                          borderRadius: BorderRadius.circular(4),
                        ),
                        child: const SizedBox(height: 14),
                      ),
                    ),
                    const SizedBox(height: 9),
                    FractionallySizedBox(
                      widthFactor: index.isEven ? 0.74 : 0.60,
                      child: DecoratedBox(
                        decoration: BoxDecoration(
                          color: color,
                          borderRadius: BorderRadius.circular(4),
                        ),
                        child: const SizedBox(height: 12),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}

class _SessionEmptyState extends StatelessWidget {
  const _SessionEmptyState({required this.message});

  final String message;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Text(
        message,
        style: Theme.of(context).textTheme.bodyMedium?.copyWith(
              color: ImTokens.wechatTextSecondary,
            ),
      ),
    );
  }
}

class _ChatEmptyState extends StatelessWidget {
  const _ChatEmptyState({required this.message});

  final String message;

  @override
  Widget build(BuildContext context) {
    return ColoredBox(
      color: ImTokens.wechatPageBg,
      child: Center(
        child: Text(
          message,
          style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                color: ImTokens.wechatTextSecondary,
                fontSize: 14,
              ),
        ),
      ),
    );
  }
}

class _SessionListError extends StatelessWidget {
  const _SessionListError({
    required this.message,
    required this.onRetry,
  });

  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final loc = AppLocalizations.of(context)!;
    final theme = Theme.of(context);
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              message,
              textAlign: TextAlign.center,
              style: theme.textTheme.bodyMedium?.copyWith(
                color: ImTokens.wechatTextSecondary,
              ),
            ),
            const SizedBox(height: 14),
            TextButton.icon(
              onPressed: onRetry,
              icon: const Icon(Icons.refresh),
              label: Text(loc.retry),
            ),
          ],
        ),
      ),
    );
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
            ? 'Group chat'
            : loc.chatMemberCount(session.memberCount!))
        : switch (status) {
            E2eeSessionStatus.encrypted => loc.e2eeEncrypted,
            E2eeSessionStatus.negotiating => loc.e2eeNegotiating,
            E2eeSessionStatus.failed => loc.e2eeFailed,
            E2eeSessionStatus.plaintext => loc.e2eePlaintext,
          };

    return Container(
      height: 56,
      padding: const EdgeInsets.symmetric(horizontal: 16),
      decoration: BoxDecoration(
        color: ImTokens.wechatPanelBg,
        border: Border(
          bottom: BorderSide(color: Theme.of(context).dividerColor),
        ),
      ),
      child: Row(
        children: [
          if (isMobile)
            IconButton(
              icon: const Icon(Icons.arrow_back),
              onPressed: onBackPressed,
            ),
          CircleAvatar(
            radius: 18,
            backgroundColor: ImTokens.wechatAvatarBg,
            backgroundImage: session.targetAvatar != null
                ? NetworkImage(session.targetAvatar!)
                : null,
            child: session.targetAvatar == null
                ? Text(
                    sessionName.isNotEmpty ? sessionName[0] : '?',
                    style: const TextStyle(
                      color: Color(0xFF4A4A4A),
                      fontWeight: FontWeight.w600,
                    ),
                  )
                : null,
          ),
          const SizedBox(width: 10),
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
                        color: ImTokens.wechatTextPrimary,
                        fontWeight: FontWeight.w600,
                        fontSize: 16,
                      ),
                ),
                const SizedBox(height: 2),
                Text(
                  subtitle,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        color: ImTokens.wechatTextSecondary,
                        fontSize: 12,
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
                label: loc.e2eeInitiate,
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
