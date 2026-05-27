import 'package:freezed_annotation/freezed_annotation.dart';
import 'message.dart';

part 'session.freezed.dart';
part 'session.g.dart';

@freezed
class ChatSession with _$ChatSession {
  const factory ChatSession({
    required String id,
    required String type,
    required String targetId,
    required String targetName,
    required int unreadCount,
    String? conversationId,
    String? targetAvatar,
    String? name,
    String? avatar,
    String? conversationType,
    String? conversationName,
    String? conversationAvatar,
    Message? lastMessage,
    String? lastMessageTime,
    String? lastMessageSenderId,
    String? lastMessageSenderName,
    String? lastActiveTime,
    String? updateTime,
    int? memberCount,
    bool? encrypted,
    bool? isPinned,
    bool? pinned,
    bool? isMuted,
    bool? muted,
  }) = _ChatSession;

  factory ChatSession.fromJson(Map<String, dynamic> json) =>
      _$ChatSessionFromJson(json);
}

@freezed
class E2eeNegotiationPayload with _$E2eeNegotiationPayload {
  const factory E2eeNegotiationPayload({
    required String action,
    required String sessionId,
    String? requesterId,
    String? requesterName,
    String? targetUserId,
    String? requestPayloadJson,
  }) = _E2eeNegotiationPayload;

  factory E2eeNegotiationPayload.fromJson(Map<String, dynamic> json) =>
      _$E2eeNegotiationPayloadFromJson(json);
}

@freezed
class GroupReadUser with _$GroupReadUser {
  const factory GroupReadUser({
    required String userId,
    required String displayName,
  }) = _GroupReadUser;

  factory GroupReadUser.fromJson(Map<String, dynamic> json) =>
      _$GroupReadUserFromJson(json);
}
