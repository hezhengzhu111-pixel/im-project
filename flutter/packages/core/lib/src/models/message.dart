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
      _$MessageFromJson(_normalizeMessageJson(json));
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
      _$E2eeEnvelopeFromJson(_normalizeE2eeEnvelopeJson(json));
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

Map<String, dynamic> _normalizeMessageJson(Map<String, dynamic> json) {
  final normalized = Map<String, dynamic>.from(json);

  normalized['id'] = _firstValue(
        normalized['id'],
        normalized['messageId'],
        normalized['message_id'],
        normalized['clientMessageId'],
        normalized['client_message_id'],
      )?.toString() ??
      '';
  normalized['messageId'] = _nullableString(
      _firstValue(normalized['messageId'], normalized['message_id']));
  normalized['clientMessageId'] = _nullableString(
    _firstValue(normalized['clientMessageId'], normalized['client_message_id']),
  );
  normalized['senderId'] =
      _firstValue(normalized['senderId'], normalized['sender_id'])
              ?.toString() ??
          '';
  normalized['receiverId'] = _nullableString(
    _firstValue(normalized['receiverId'], normalized['receiver_id']),
  );
  normalized['groupId'] = _nullableString(
      _firstValue(normalized['groupId'], normalized['group_id']));
  normalized['isGroupChat'] = _boolValue(
    _firstValue(normalized['isGroupChat'], normalized['isGroup'],
        normalized['is_group_chat']),
  );
  normalized['messageType'] = _firstValue(
        normalized['messageType'],
        normalized['message_type'],
        'TEXT',
      )?.toString() ??
      'TEXT';
  normalized['content'] = _nullableString(normalized['content']) ?? '';
  normalized['sendTime'] = _firstValue(
        normalized['sendTime'],
        normalized['send_time'],
        normalized['createdTime'],
        normalized['created_time'],
        normalized['createdAt'],
        normalized['created_at'],
        DateTime.fromMillisecondsSinceEpoch(0, isUtc: true).toIso8601String(),
      )?.toString() ??
      DateTime.fromMillisecondsSinceEpoch(0, isUtc: true).toIso8601String();
  normalized['status'] =
      _firstValue(normalized['status'], 'SENT')?.toString() ?? 'SENT';

  _copyFirstString(normalized, 'senderName', ['sender_name']);
  _copyFirstString(normalized, 'senderAvatar', ['sender_avatar']);
  _copyFirstString(normalized, 'receiverName', ['receiver_name']);
  _copyFirstString(normalized, 'receiverAvatar', ['receiver_avatar']);
  _copyFirstString(normalized, 'groupName', ['group_name']);
  _copyFirstString(normalized, 'groupAvatar', ['group_avatar']);
  _copyFirstString(normalized, 'mediaUrl', ['media_url']);
  _copyFirstString(normalized, 'mediaName', ['media_name']);
  _copyFirstString(normalized, 'thumbnailUrl', ['thumbnail_url']);
  _copyFirstString(normalized, 'e2eeDeviceId', ['e2ee_device_id']);
  _copyFirstString(normalized, 'decryptStatus', ['decrypt_status']);
  _copyFirstString(normalized, 'aiProvider', ['ai_provider']);
  _copyFirstString(normalized, 'aiModel', ['ai_model']);

  normalized['mediaSize'] =
      _intValue(_firstValue(normalized['mediaSize'], normalized['media_size']));
  normalized['duration'] = _intValue(normalized['duration']);
  normalized['conversationSeq'] = _intValue(
    _firstValue(normalized['conversationSeq'], normalized['conversation_seq']),
  );
  normalized['readByCount'] = _intValue(
      _firstValue(normalized['readByCount'], normalized['read_by_count']));
  normalized['readStatus'] = _intValue(
      _firstValue(normalized['readStatus'], normalized['read_status']));
  normalized['encrypted'] = _nullableBool(normalized['encrypted']);
  normalized['isAiGenerated'] = _nullableBool(
    _firstValue(normalized['isAiGenerated'], normalized['is_ai_generated']),
  );

  final envelope =
      _firstValue(normalized['e2eeEnvelope'], normalized['e2ee_envelope']);
  if (envelope is Map<String, dynamic>) {
    normalized['e2eeEnvelope'] = _normalizeE2eeEnvelopeJson(envelope);
  } else if (envelope is Map) {
    normalized['e2eeEnvelope'] = _normalizeE2eeEnvelopeJson(
      envelope.map((key, value) => MapEntry(key.toString(), value)),
    );
  }

  return normalized;
}

Map<String, dynamic> _normalizeE2eeEnvelopeJson(Map<String, dynamic> json) {
  final normalized = Map<String, dynamic>.from(json);
  normalized['algorithm'] =
      _firstValue(normalized['algorithm'], normalized['alg'])?.toString() ?? '';
  normalized['senderDeviceId'] = _firstValue(
        normalized['senderDeviceId'],
        normalized['sender_device_id'],
      )?.toString() ??
      '';
  normalized['recipientDeviceId'] = _firstValue(
        normalized['recipientDeviceId'],
        normalized['recipient_device_id'],
        _firstListValue(normalized['recipientDeviceIds']),
        _firstListValue(normalized['recipient_device_ids']),
      )?.toString() ??
      '';
  normalized['sessionId'] =
      _firstValue(normalized['sessionId'], normalized['session_id'])
              ?.toString() ??
          '';
  normalized['wire'] =
      _firstValue(normalized['wire'], normalized['ciphertext'])?.toString() ??
          '';
  return normalized;
}

Object? _firstValue(
  Object? first, [
  Object? second,
  Object? third,
  Object? fourth,
  Object? fifth,
  Object? sixth,
  Object? seventh,
]) {
  for (final value in [first, second, third, fourth, fifth, sixth, seventh]) {
    if (value == null) continue;
    if (value is String && (value.trim().isEmpty || value == 'null')) continue;
    return value;
  }
  return null;
}

Object? _firstListValue(Object? value) {
  if (value is List && value.isNotEmpty) return value.first;
  return null;
}

String? _nullableString(Object? value) {
  final text = value?.toString().trim() ?? '';
  return text.isEmpty || text == 'null' ? null : text;
}

int? _intValue(Object? value) {
  if (value is int) return value;
  if (value is num) return value.toInt();
  return int.tryParse(value?.toString() ?? '');
}

bool _boolValue(Object? value) => _nullableBool(value) ?? false;

bool? _nullableBool(Object? value) {
  if (value is bool) return value;
  if (value is num) return value != 0;
  final text = value?.toString().toLowerCase();
  if (text == 'true' || text == 'online') return true;
  if (text == 'false' || text == 'offline') return false;
  return null;
}

void _copyFirstString(
  Map<String, dynamic> target,
  String key,
  List<String> aliases,
) {
  Object? rawValue = target[key];
  if (rawValue == null || rawValue is String && rawValue.trim().isEmpty) {
    for (final alias in aliases) {
      final candidate = target[alias];
      if (candidate == null) continue;
      if (candidate is String &&
          (candidate.trim().isEmpty || candidate == 'null')) {
        continue;
      }
      rawValue = candidate;
      break;
    }
  }
  final value = _nullableString(rawValue);
  if (value != null) target[key] = value;
}
