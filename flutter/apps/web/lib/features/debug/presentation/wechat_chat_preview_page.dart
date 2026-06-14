import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:im_core/core.dart';
import 'package:im_ui/im_ui.dart';
import 'package:im_web/features/chat/presentation/widgets/message_bubble.dart';
import 'package:im_web/features/chat/presentation/widgets/message_input.dart';
import 'package:im_web/features/chat/presentation/widgets/session_tile.dart';
import 'package:im_web/l10n/app_localizations.dart';

class WechatChatPreviewPage extends StatelessWidget {
  const WechatChatPreviewPage({super.key});

  static final _now = DateTime(2026, 6, 14, 14, 30);
  static const _meId = 'debug-me';
  static const _friendId = 'debug-friend';
  static const _groupId = 'debug-group';

  static final _sessions = <ChatSession>[
    ChatSession(
      id: 's-1',
      type: 'single',
      targetId: _friendId,
      targetName: 'Product Team',
      unreadCount: 3,
      lastMessageTime:
          _now.subtract(const Duration(minutes: 2)).toIso8601String(),
      isPinned: true,
      isMuted: true,
      lastMessage: _message(
        id: 'm-last-1',
        senderId: _friendId,
        senderName: 'Alice',
        content: 'Visual preview is ready for review.',
        minutesAgo: 2,
      ),
    ),
    ChatSession(
      id: 's-2',
      type: 'group',
      targetId: _groupId,
      targetName: 'Frontend Review',
      unreadCount: 12,
      lastMessageTime:
          _now.subtract(const Duration(minutes: 18)).toIso8601String(),
      lastMessage: _message(
        id: 'm-last-2',
        senderId: 'debug-bob',
        senderName: 'Bob',
        content: '[File]',
        minutesAgo: 18,
        isGroupChat: true,
      ),
    ),
    ChatSession(
      id: 's-3',
      type: 'single',
      targetId: 'debug-cara',
      targetName: 'Cara',
      unreadCount: 0,
      lastMessageTime:
          _now.subtract(const Duration(hours: 3)).toIso8601String(),
      lastMessage: _message(
        id: 'm-last-3',
        senderId: _meId,
        senderName: 'Me',
        content: 'The mobile viewport also needs a quick pass.',
        minutesAgo: 180,
      ),
    ),
    ChatSession(
      id: 's-4',
      type: 'single',
      targetId: 'debug-design',
      targetName: 'Design Sync',
      unreadCount: 0,
      lastMessageTime: _now.subtract(const Duration(days: 1)).toIso8601String(),
      lastMessage: _message(
        id: 'm-last-4',
        senderId: 'debug-design',
        senderName: 'Design',
        content: '[Voice]',
        minutesAgo: 1440,
      ),
    ),
  ];

  static final _messages = <Message>[
    _message(
      id: 'm-1',
      senderId: _friendId,
      senderName: 'Alice',
      content: 'This is a debug-only chat preview for visual regression.',
      minutesAgo: 9,
    ),
    _message(
      id: 'm-2',
      senderId: _meId,
      senderName: 'Me',
      content: 'No auth, upload, E2EE, or real message pipeline is connected.',
      minutesAgo: 8,
      status: 'READ',
    ),
    _message(
      id: 'm-3',
      senderId: _friendId,
      senderName: 'Alice',
      content: '',
      messageType: 'IMAGE',
      mediaName: 'preview-image.png',
      minutesAgo: 7,
    ),
    _message(
      id: 'm-4',
      senderId: _meId,
      senderName: 'Me',
      content: '',
      messageType: 'FILE',
      mediaName: 'wechat-style-checklist.pdf',
      mediaSize: 248000,
      minutesAgo: 6,
      status: 'DELIVERED',
    ),
    _message(
      id: 'm-5',
      senderId: _friendId,
      senderName: 'Alice',
      content: '',
      messageType: 'VOICE',
      duration: 4200,
      minutesAgo: 5,
    ),
    _message(
      id: 'm-6',
      senderId: _meId,
      senderName: 'Me',
      content: '@Alice The desktop and mobile shells can be checked here.',
      minutesAgo: 3,
      status: 'SENT',
      mentionedUserIds: ['debug-friend'],
    ),
  ];

  static final _members = <GroupMember>[
    const GroupMember(
      id: 'gm-1',
      userId: _friendId,
      groupId: _groupId,
      nickname: 'Alice',
    ),
    const GroupMember(
      id: 'gm-2',
      userId: 'debug-bob',
      groupId: _groupId,
      nickname: 'Bob',
    ),
  ];

  static Message _message({
    required String id,
    required String senderId,
    required String senderName,
    required String content,
    required int minutesAgo,
    String messageType = 'TEXT',
    String status = 'SENT',
    bool isGroupChat = false,
    String? mediaName,
    int? mediaSize,
    int? duration,
    List<String>? mentionedUserIds,
  }) {
    return Message(
      id: id,
      senderId: senderId,
      senderName: senderName,
      isGroupChat: isGroupChat,
      messageType: messageType,
      content: content,
      sendTime: _now.subtract(Duration(minutes: minutesAgo)).toIso8601String(),
      status: status,
      mediaName: mediaName,
      mediaSize: mediaSize,
      duration: duration,
      mentionedUserIds: mentionedUserIds,
      encrypted: messageType == 'TEXT',
    );
  }

  @override
  Widget build(BuildContext context) {
    final loc = AppLocalizations.of(context);
    return ResponsiveScaffold(
      destinations: [
        ResponsiveNavDestination(
          icon: Icons.chat_outlined,
          selectedIcon: Icons.chat,
          label: loc?.navChat ?? 'Chat',
        ),
        ResponsiveNavDestination(
          icon: Icons.people_outline,
          selectedIcon: Icons.people,
          label: loc?.navContacts ?? 'Contacts',
        ),
        ResponsiveNavDestination(
          icon: Icons.group_outlined,
          selectedIcon: Icons.group,
          label: loc?.navGroups ?? 'Groups',
        ),
        ResponsiveNavDestination(
          icon: Icons.camera_alt_outlined,
          selectedIcon: Icons.camera_alt,
          label: loc?.navMoments ?? 'Moments',
        ),
        ResponsiveNavDestination(
          icon: Icons.settings_outlined,
          selectedIcon: Icons.settings,
          label: loc?.navSettings ?? 'Settings',
        ),
      ],
      selectedIndex: 0,
      onDestinationSelected: (index) {
        final route = switch (index) {
          0 => '/debug/wechat-chat-preview',
          1 => '/contacts',
          2 => '/groups',
          3 => '/moments',
          4 => '/settings',
          _ => '/debug/wechat-chat-preview',
        };
        if (index == 0) {
          context.go(route);
        }
      },
      child: const AdaptivePane(
        compact: _PreviewMobileChat(),
        medium: _PreviewDesktopChat(),
        expanded: _PreviewDesktopChat(),
        large: _PreviewDesktopChat(),
      ),
    );
  }
}

class _PreviewDesktopChat extends StatelessWidget {
  const _PreviewDesktopChat();

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        const SizedBox(
          width: ImTokens.layoutChatSidebarWidth,
          child: _PreviewSessionList(),
        ),
        VerticalDivider(width: 1, color: ImTokens.wechatDivider),
        const Expanded(child: _PreviewConversation(showBackButton: false)),
      ],
    );
  }
}

class _PreviewMobileChat extends StatelessWidget {
  const _PreviewMobileChat();

  @override
  Widget build(BuildContext context) {
    return const _PreviewConversation(showBackButton: true);
  }
}

class _PreviewSessionList extends StatelessWidget {
  const _PreviewSessionList();

  @override
  Widget build(BuildContext context) {
    return ColoredBox(
      color: ImTokens.wechatPanelBg,
      child: Column(
        children: [
          Container(
            height: 56,
            padding: const EdgeInsets.symmetric(horizontal: 14),
            decoration: const BoxDecoration(
              border: Border(
                bottom: BorderSide(color: ImTokens.wechatDivider),
              ),
            ),
            child: Row(
              children: [
                const Expanded(
                  child: Text(
                    'Chat',
                    style: TextStyle(
                      color: ImTokens.wechatTextPrimary,
                      fontSize: 18,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
                IconButton(
                  tooltip: 'New chat',
                  onPressed: () {},
                  icon: const Icon(Icons.add, size: 22),
                  color: ImTokens.wechatIcon,
                ),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 10, 12, 8),
            child: SizedBox(
              height: 32,
              child: TextField(
                readOnly: true,
                decoration: InputDecoration(
                  hintText: 'Search',
                  hintStyle: const TextStyle(
                    color: ImTokens.wechatTextSecondary,
                    fontSize: 13,
                  ),
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
                  contentPadding: EdgeInsets.zero,
                ),
              ),
            ),
          ),
          Expanded(
            child: ListView.builder(
              padding: EdgeInsets.zero,
              itemCount: WechatChatPreviewPage._sessions.length,
              itemBuilder: (context, index) {
                return SessionTile(
                  session: WechatChatPreviewPage._sessions[index],
                  isSelected: index == 0,
                  onTap: () {},
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}

class _PreviewConversation extends StatelessWidget {
  const _PreviewConversation({required this.showBackButton});

  final bool showBackButton;

  @override
  Widget build(BuildContext context) {
    return ColoredBox(
      color: ImTokens.wechatPageBg,
      child: Column(
        children: [
          _PreviewChatHeader(showBackButton: showBackButton),
          Expanded(
            child: ListView.builder(
              padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 12),
              itemCount: WechatChatPreviewPage._messages.length,
              itemBuilder: (context, index) {
                final message = WechatChatPreviewPage._messages[index];
                return MessageBubble(
                  message: message,
                  isMe: message.senderId == WechatChatPreviewPage._meId,
                );
              },
            ),
          ),
          MessageInput(
            members: WechatChatPreviewPage._members,
            onSend: (_, __) {},
            onSendImage: (_) {},
            onSendFile: (_) {},
            onSendVoice: (_) {},
          ),
        ],
      ),
    );
  }
}

class _PreviewChatHeader extends StatelessWidget {
  const _PreviewChatHeader({required this.showBackButton});

  final bool showBackButton;

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 56,
      padding: EdgeInsets.only(
        left: showBackButton ? 4 : 20,
        right: 14,
      ),
      decoration: const BoxDecoration(
        color: ImTokens.wechatPanelBg,
        border: Border(bottom: BorderSide(color: ImTokens.wechatDivider)),
      ),
      child: Row(
        children: [
          if (showBackButton)
            IconButton(
              tooltip: 'Back',
              onPressed: () {},
              icon: const Icon(Icons.arrow_back_ios_new, size: 18),
              color: ImTokens.wechatIcon,
            ),
          const CircleAvatar(
            radius: 18,
            backgroundColor: ImTokens.wechatAvatarBg,
            child: Text(
              'P',
              style: TextStyle(
                color: Color(0xFF4A4A4A),
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
          const SizedBox(width: 10),
          const Expanded(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Product Team',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    color: ImTokens.wechatTextPrimary,
                    fontSize: 16,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                SizedBox(height: 2),
                Text(
                  'Debug visual preview',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    color: ImTokens.wechatTextSecondary,
                    fontSize: 12,
                  ),
                ),
              ],
            ),
          ),
          IconButton(
            tooltip: 'More',
            onPressed: () {},
            icon: const Icon(Icons.more_horiz, size: 22),
            color: ImTokens.wechatIcon,
          ),
        ],
      ),
    );
  }
}
