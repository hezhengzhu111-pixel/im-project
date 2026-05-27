import 'package:freezed_annotation/freezed_annotation.dart';

part 'message.freezed.dart';
part 'message.g.dart';

@freezed
class Message with _$Message {
  const factory Message({
    required String id,
    required String senderId,
    required bool isGroupChat,
    required String messageType,
    required String content,
    required String sendTime,
    required String status,
    String? messageId,
    String? clientMessageId,
    String? senderName,
    String? senderAvatar,
    String? receiverId,
    String? receiverName,
    String? receiverAvatar,
    String? groupId,
    int? conversationSeq,
    String? groupName,
    String? groupAvatar,
    String? mediaUrl,
    int? mediaSize,
    String? mediaName,
    String? thumbnailUrl,
    int? duration,
    Map<String, dynamic>? extra,
    List<String>? mentionedUserIds,
    List<String>? readBy,
    int? readByCount,
    int? readStatus,
    String? readAt,
    bool? isAiGenerated,
    String? aiProvider,
    String? aiModel,
    bool? encrypted,
    String? e2eeDeviceId,
    E2eeEnvelope? e2eeEnvelope,
    String? decryptStatus,
  }) = _Message;

  factory Message.fromJson(Map<String, dynamic> json) =>
      _$MessageFromJson(json);
}

@freezed
class E2eeEnvelope with _$E2eeEnvelope {
  const factory E2eeEnvelope({
    required int version,
    required String algorithm,
    required String senderDeviceId,
    required String recipientDeviceId,
    required String sessionId,
    required String wire,
    String? handshake,
  }) = _E2eeEnvelope;

  factory E2eeEnvelope.fromJson(Map<String, dynamic> json) =>
      _$E2eeEnvelopeFromJson(json);
}

@freezed
class ReadReceipt with _$ReadReceipt {
  const factory ReadReceipt({
    required String readerId,
    String? toUserId,
    String? conversationId,
    String? lastReadMessageId,
    int? lastReadSeq,
    String? readAt,
  }) = _ReadReceipt;

  factory ReadReceipt.fromJson(Map<String, dynamic> json) =>
      _$ReadReceiptFromJson(json);
}

@freezed
class MessageConfig with _$MessageConfig {
  const factory MessageConfig({
    required bool textEnforce,
    required int textMaxLength,
  }) = _MessageConfig;

  factory MessageConfig.fromJson(Map<String, dynamic> json) =>
      _$MessageConfigFromJson(json);
}
