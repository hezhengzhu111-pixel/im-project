# Flutter Web 端实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用 Flutter Web 完全替代 Vue 3 Web 端，实现全功能 IM 应用（登录/注册、聊天、联系人、朋友圈、设置、E2EE）。

**Architecture:** Feature-First + Ports & Adapters。Rust 负责 E2EE + 归一化 + 消息处理（通过 flutter_rust_bridge），Dart 负责 HTTP/WS/UI。项目位于根目录 `flutter/`，支持未来 Flutter Desktop 复用代码。

**Tech Stack:** Flutter 3.x, Dart 3.x, Riverpod, GoRouter, Dio, Material 3, flutter_rust_bridge 2.x, e2ee-core (Rust)

---

## Phase 1: 项目脚手架

### Task 1: 初始化 Flutter 项目结构

**Files:**
- Create: `flutter/pubspec.yaml`
- Create: `flutter/packages/core/pubspec.yaml`
- Create: `flutter/packages/core/lib/core.dart`
- Create: `flutter/packages/ui/pubspec.yaml`
- Create: `flutter/packages/ui/lib/ui.dart`
- Create: `flutter/apps/web/pubspec.yaml`
- Create: `flutter/apps/web/lib/main.dart`
- Create: `flutter/melos.yaml`

- [ ] **Step 1: 创建根目录和 melos 配置**

```yaml
# flutter/melos.yaml
name: im_flutter
repository: https://github.com/example/im-flutter

packages:
  - packages/**
  - apps/**

scripts:
  build:web:
    run: melos exec --scope="im_web" -- flutter build web
  test:
    run: melos exec -- flutter test
  analyze:
    run: melos exec -- flutter analyze
```

- [ ] **Step 2: 创建 packages/core/pubspec.yaml**

```yaml
# flutter/packages/core/pubspec.yaml
name: im_core
description: Platform-agnostic core logic for IM app
version: 0.1.0
publish_to: none

environment:
  sdk: '>=3.2.0 <4.0.0'

dependencies:
  freezed_annotation: ^2.4.1
  json_annotation: ^4.8.1
  equatable: ^2.0.5
  intl: ^0.19.0

dev_dependencies:
  flutter_test:
    sdk: flutter
  build_runner: ^2.4.7
  freezed: ^2.4.5
  json_serializable: ^6.7.1
  mockito: ^5.4.3
  very_good_analysis: ^5.1.0
```

- [ ] **Step 3: 创建 packages/ui/pubspec.yaml**

```yaml
# flutter/packages/ui/pubspec.yaml
name: im_ui
description: Shared UI components for IM app
version: 0.1.0
publish_to: none

environment:
  sdk: '>=3.2.0 <4.0.0'

dependencies:
  flutter:
    sdk: flutter
  google_fonts: ^6.1.0

dev_dependencies:
  flutter_test:
    sdk: flutter
  very_good_analysis: ^5.1.0
```

- [ ] **Step 4: 创建 apps/web/pubspec.yaml**

```yaml
# flutter/apps/web/pubspec.yaml
name: im_web
description: IM Web Application
version: 0.1.0
publish_to: none

environment:
  sdk: '>=3.2.0 <4.0.0'

dependencies:
  flutter:
    sdk: flutter
  im_core:
    path: ../../packages/core
  im_ui:
    path: ../../packages/ui
  flutter_riverpod: ^2.4.9
  go_router: ^13.0.0
  dio: ^5.4.0
  web_socket_channel: ^2.4.0
  flutter_secure_storage: ^9.0.0
  freezed_annotation: ^2.4.1
  json_annotation: ^4.8.1
  json_serializable: ^6.7.1
  intl: ^0.19.0

dev_dependencies:
  flutter_test:
    sdk: flutter
  build_runner: ^2.4.7
  freezed: ^2.4.5
  mockito: ^5.4.3
  very_good_analysis: ^5.1.0
```

- [ ] **Step 5: 创建入口文件和 barrel exports**

```dart
// flutter/packages/core/lib/core.dart
library im_core;

export 'src/models/models.dart';
export 'src/contracts/contracts.dart';
export 'src/network/network.dart';
export 'src/storage/storage.dart';
export 'src/auth/auth.dart';
export 'src/im/im.dart';
export 'src/ws/ws.dart';
export 'src/utils/utils.dart';
```

```dart
// flutter/packages/ui/lib/ui.dart
library im_ui;

export 'src/theme/app_theme.dart';
export 'src/widgets/widgets.dart';
export 'src/layouts/layouts.dart';
```

```dart
// flutter/apps/web/lib/main.dart
import 'package:flutter/material.dart';
import 'package:im_web/app.dart';

void main() {
  runApp(const App());
}
```

- [ ] **Step 6: 验证项目结构**

Run: `cd flutter && dart pub get`（分别在 core、ui、web 目录执行）
Expected: 依赖解析成功，无错误

- [ ] **Step 7: Commit**

```bash
cd flutter
git add -A
git commit -m "feat: initialize Flutter monorepo project structure"
```

---

### Task 2: 创建 API 端点常量

**Files:**
- Create: `flutter/packages/core/lib/src/contracts/api_endpoints.dart`
- Create: `flutter/packages/core/lib/src/contracts/ws_message_type.dart`
- Create: `flutter/packages/core/lib/src/contracts/api_codes.dart`
- Create: `flutter/packages/core/lib/src/contracts/contracts.dart`
- Test: `flutter/packages/core/test/contracts/api_endpoints_test.dart`

- [ ] **Step 1: 编写 API 端点常量**

```dart
// flutter/packages/core/lib/src/contracts/api_endpoints.dart
class AuthEndpoints {
  static const parse = '/auth/parse';
  static const refresh = '/auth/refresh';
  static const wsTicket = '/auth/ws-ticket';
}

class UserEndpoints {
  static const login = '/user/login';
  static const register = '/user/register';
  static const profile = '/user/profile';
  static const search = '/user/search';
  static const logout = '/user/logout';
  static const heartbeat = '/user/heartbeat';
  static const onlineStatus = '/user/online-status';
  static const password = '/user/password';
  static const phoneCode = '/user/phone/code';
  static const phoneBind = '/user/phone/bind';
  static const emailCode = '/user/email/code';
  static const emailBind = '/user/email/bind';
  static const account = '/user/account';
  static const settings = '/user/settings';
  static String settingsType(String type) => '/user/settings/$type';
}

class MessageEndpoints {
  static const sendPrivate = '/message/send/private';
  static const sendGroup = '/message/send/group';
  static String privateHistory(String friendId) => '/message/private/$friendId';
  static String privateHistoryCursor(String friendId) => '/message/private/$friendId/cursor';
  static String groupHistory(String groupId) => '/message/group/$groupId';
  static String groupHistoryCursor(String groupId) => '/message/group/$groupId/cursor';
  static const conversations = '/message/conversations';
  static String markRead(String conversationId) => '/message/read/$conversationId';
  static String recall(String messageId) => '/message/recall/$messageId';
  static String delete(String messageId) => '/message/delete/$messageId';
  static const config = '/message/config';
}

class FriendEndpoints {
  static const list = '/friend/list';
  static const request = '/friend/request';
  static const requests = '/friend/requests';
  static const accept = '/friend/accept';
  static const reject = '/friend/reject';
  static const remove = '/friend/remove';
  static const remark = '/friend/remark';
}

class GroupEndpoints {
  static const create = '/group/create';
  static String userGroups(String userId) => '/group/user/$userId';
  static const membersList = '/group/members/list';
  static String join(String groupId) => '/group/$groupId/join';
  static String addMembers(String groupId) => '/group/$groupId/add-members';
  static const search = '/group/search';
  static String leave(String groupId) => '/group/$groupId/leave';
  static String dismiss(String groupId) => '/group/$groupId';
  static String update(String groupId) => '/group/$groupId';
}

class MomentsEndpoints {
  static const create = '/moments';
  static const feed = '/moments/feed';
  static String postById(String postId) => '/moments/$postId';
  static String deletePost(String postId) => '/moments/$postId';
  static String addMedia(String postId) => '/moments/$postId/media';
  static String userPosts(String userId) => '/moments/user/$userId';
  static String like(String postId) => '/moments/$postId/like';
  static String unlike(String postId) => '/moments/$postId/like';
  static String likes(String postId) => '/moments/$postId/likes';
  static String createComment(String postId) => '/moments/$postId/comments';
  static String deleteComment(String commentId) => '/moments/comments/$commentId';
  static String comments(String postId) => '/moments/$postId/comments';
  static const notifications = '/moments/notifications';
  static const markNotificationsRead = '/moments/notifications/read';
}

class FileEndpoints {
  static const uploadFile = '/file/upload/file';
  static const uploadImage = '/file/upload/image';
  static const uploadVideo = '/file/upload/video';
  static const uploadAudio = '/file/upload/audio';
  static const delete = '/file/delete';
}

class AiEndpoints {
  static const keys = '/ai/keys';
  static String keyById(String id) => '/ai/keys/$id';
  static String keyTest(String id) => '/ai/keys/$id/test';
  static const settings = '/ai/settings';
}

class PushEndpoints {
  static const registerDevice = '/push/devices/register';
  static const unregisterDevice = '/push/devices/unregister';
  static const updateDeviceToken = '/push/devices/token';
  static const settings = '/push/settings';
}

class AdminEndpoints {
  static const logs = '/admin/logs';
}

class WsEndpoints {
  static const path = '/websocket';
  static const ticketParam = 'ticket';
}
```

- [ ] **Step 2: 编写 WS 消息类型常量**

```dart
// flutter/packages/core/lib/src/contracts/ws_message_type.dart
class WsMessageType {
  static const message = 'MESSAGE';
  static const messageStatusChanged = 'MESSAGE_STATUS_CHANGED';
  static const heartbeat = 'HEARTBEAT';
  static const onlineStatus = 'ONLINE_STATUS';
  static const readReceipt = 'READ_RECEIPT';
  static const readSync = 'READ_SYNC';
  static const system = 'SYSTEM';
  static const friendRequest = 'FRIEND_REQUEST';
  static const friendAccepted = 'FRIEND_ACCEPTED';
  static const e2eeNegotiation = 'E2EE_NEGOTIATION';
}
```

- [ ] **Step 3: 编写 API 状态码常量**

```dart
// flutter/packages/core/lib/src/contracts/api_codes.dart
class ApiCodes {
  static const ok = 200;
  static const badRequest = 400;
  static const unauthorized = 401;
  static const forbidden = 403;
  static const notFound = 404;
  static const internalError = 500;
}
```

- [ ] **Step 4: 创建 barrel export**

```dart
// flutter/packages/core/lib/src/contracts/contracts.dart
export 'api_endpoints.dart';
export 'ws_message_type.dart';
export 'api_codes.dart';
```

- [ ] **Step 5: 编写测试**

```dart
// flutter/packages/core/test/contracts/api_endpoints_test.dart
import 'package:flutter_test/flutter_test.dart';
import 'package:im_core/core.dart';

void main() {
  group('ApiEndpoints', () {
    test('AuthEndpoints paths are correct', () {
      expect(AuthEndpoints.parse, '/auth/parse');
      expect(AuthEndpoints.refresh, '/auth/refresh');
      expect(AuthEndpoints.wsTicket, '/auth/ws-ticket');
    });

    test('MessageEndpoints parameterized paths work', () {
      expect(MessageEndpoints.privateHistory('123'), '/message/private/123');
      expect(MessageEndpoints.markRead('conv1'), '/message/read/conv1');
    });

    test('WsMessageType constants are correct', () {
      expect(WsMessageType.message, 'MESSAGE');
      expect(WsMessageType.e2eeNegotiation, 'E2EE_NEGOTIATION');
    });
  });
}
```

- [ ] **Step 6: 运行测试**

Run: `cd flutter/packages/core && flutter test test/contracts/api_endpoints_test.dart`
Expected: All tests pass

- [ ] **Step 7: Commit**

```bash
cd flutter
git add packages/core/lib/src/contracts/ packages/core/test/contracts/
git commit -m "feat(core): add API endpoint constants and WS message types"
```

---

## Phase 2: 数据模型

### Task 3: 创建核心数据模型

**Files:**
- Create: `flutter/packages/core/lib/src/models/api_response.dart`
- Create: `flutter/packages/core/lib/src/models/user.dart`
- Create: `flutter/packages/core/lib/src/models/message.dart`
- Create: `flutter/packages/core/lib/src/models/session.dart`
- Create: `flutter/packages/core/lib/src/models/e2ee.dart`
- Create: `flutter/packages/core/lib/src/models/moments.dart`
- Create: `flutter/packages/core/lib/src/models/group.dart`
- Create: `flutter/packages/core/lib/src/models/settings.dart`
- Create: `flutter/packages/core/lib/src/models/models.dart`
- Test: `flutter/packages/core/test/models/`

- [ ] **Step 1: 编写 ApiResponse 模型**

```dart
// flutter/packages/core/lib/src/models/api_response.dart
import 'package:freezed_annotation/freezed_annotation.dart';

part 'api_response.freezed.dart';
part 'api_response.g.dart';

@Freezed(genericArgumentFactories: true)
class ApiResponse<T> with _$ApiResponse<T> {
  const factory ApiResponse({
    required int code,
    required String message,
    required T data,
    int? timestamp,
    bool? success,
  }) = _ApiResponse<T>;

  factory ApiResponse.fromJson(
    Map<String, dynamic> json,
    T Function(Object?) fromJsonT,
  ) => _$ApiResponseFromJson(json, fromJsonT);
}

@freezed
class PageRequest with _$PageRequest {
  const factory PageRequest({
    required int page,
    required int size,
    String? sort,
    String? order,
  }) = _PageRequest;

  factory PageRequest.fromJson(Map<String, dynamic> json) =>
      _$PageRequestFromJson(json);
}

@Freezed(genericArgumentFactories: true)
class PageResponse<T> with _$PageResponse<T> {
  const factory PageResponse({
    required List<T> content,
    required int totalElements,
    required int totalPages,
    required int page,
    required int size,
    required bool first,
    required bool last,
  }) = _PageResponse<T>;

  factory PageResponse.fromJson(
    Map<String, dynamic> json,
    T Function(Object?) fromJsonT,
  ) => _$PageResponseFromJson(json, fromJsonT);
}

@freezed
class FileUploadResponse with _$FileUploadResponse {
  const factory FileUploadResponse({
    required String url,
    String? thumbnailUrl,
    int? size,
    String? originalFilename,
    String? filename,
    String? contentType,
    String? category,
    String? uploadDate,
    int? uploadTime,
    String? uploaderId,
    String? fileName,
    String? fileType,
  }) = _FileUploadResponse;

  factory FileUploadResponse.fromJson(Map<String, dynamic> json) =>
      _$FileUploadResponseFromJson(json);
}
```

- [ ] **Step 2: 编写 User 模型**

```dart
// flutter/packages/core/lib/src/models/user.dart
import 'package:freezed_annotation/freezed_annotation.dart';

part 'user.freezed.dart';
part 'user.g.dart';

@freezed
class User with _$User {
  const factory User({
    required String id,
    required String username,
    String? nickname,
    String? avatar,
    String? email,
    String? phone,
    String? gender,
    String? birthday,
    String? signature,
    String? location,
    String? lastSeen,
    String? status,
    String? lastLoginTime,
    String? createTime,
    List<String>? permissions,
  }) = _User;

  factory User.fromJson(Map<String, dynamic> json) => _$UserFromJson(json);
}

@freezed
class AuthSession with _$AuthSession {
  const factory AuthSession({
    required User? currentUser,
    required bool isAuthenticated,
    required bool authReady,
    List<String>? permissions,
  }) = _AuthSession;

  factory AuthSession.fromJson(Map<String, dynamic> json) =>
      _$AuthSessionFromJson(json);
}

@freezed
class LoginRequest with _$LoginRequest {
  const factory LoginRequest({
    required String username,
    required String password,
  }) = _LoginRequest;

  factory LoginRequest.fromJson(Map<String, dynamic> json) =>
      _$LoginRequestFromJson(json);
}

@freezed
class RegisterRequest with _$RegisterRequest {
  const factory RegisterRequest({
    required String username,
    required String password,
    required String nickname,
    String? email,
    String? phone,
  }) = _RegisterRequest;

  factory RegisterRequest.fromJson(Map<String, dynamic> json) =>
      _$RegisterRequestFromJson(json);
}

@freezed
class UserAuthResponse with _$UserAuthResponse {
  const factory UserAuthResponse({
    required bool success,
    String? message,
    User? user,
    String? token,
    String? accessToken,
    int? expiresInMs,
    int? refreshExpiresInMs,
    List<String>? permissions,
  }) = _UserAuthResponse;

  factory UserAuthResponse.fromJson(Map<String, dynamic> json) =>
      _$UserAuthResponseFromJson(json);
}

@freezed
class Friendship with _$Friendship {
  const factory Friendship({
    required String id,
    required String friendId,
    required String username,
    String? nickname,
    String? avatar,
    String? remark,
    bool? isOnline,
    String? lastActiveTime,
    String? createdAt,
    String? createTime,
    String? signature,
    String? lastSeen,
  }) = _Friendship;

  factory Friendship.fromJson(Map<String, dynamic> json) =>
      _$FriendshipFromJson(json);
}

@freezed
class FriendRequest with _$FriendRequest {
  const factory FriendRequest({
    required String id,
    required String applicantId,
    required String applicantUsername,
    String? applicantNickname,
    String? applicantAvatar,
    String? targetUserId,
    String? targetUsername,
    String? targetNickname,
    String? targetAvatar,
    String? reason,
    required String status,
    required String createTime,
    String? updateTime,
  }) = _FriendRequest;

  factory FriendRequest.fromJson(Map<String, dynamic> json) =>
      _$FriendRequestFromJson(json);
}

@freezed
class OnlineStatus with _$OnlineStatus {
  const factory OnlineStatus({
    required String userId,
    required String status,
    String? lastSeen,
  }) = _OnlineStatus;

  factory OnlineStatus.fromJson(Map<String, dynamic> json) =>
      _$OnlineStatusFromJson(json);
}
```

- [ ] **Step 3: 编写 Message 模型**

```dart
// flutter/packages/core/lib/src/models/message.dart
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
```

- [ ] **Step 4: 编写 Session 模型**

```dart
// flutter/packages/core/lib/src/models/session.dart
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
class WsMessage<T> with _$WsMessage<T> {
  const factory WsMessage({
    required String type,
    required T data,
    required int timestamp,
  }) = _WsMessage<T>;

  factory WsMessage.fromJson(
    Map<String, dynamic> json,
    T Function(Object?) fromJsonT,
  ) => _$WsMessageFromJson(json, fromJsonT);
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
```

- [ ] **Step 5: 编写 Settings 模型**

```dart
// flutter/packages/core/lib/src/models/settings.dart
import 'package:freezed_annotation/freezed_annotation.dart';

part 'settings.freezed.dart';
part 'settings.g.dart';

@freezed
class UserSettings with _$UserSettings {
  const factory UserSettings({
    required GeneralSettings general,
    required PrivacySettings privacy,
    required MessagePreferenceSettings message,
    required NotificationSettings notifications,
  }) = _UserSettings;

  factory UserSettings.fromJson(Map<String, dynamic> json) =>
      _$UserSettingsFromJson(json);
}

@freezed
class GeneralSettings with _$GeneralSettings {
  const factory GeneralSettings({
    required String language,
    required String theme,
    required String fontSize,
    required bool autoLogin,
    required bool minimizeOnStart,
  }) = _GeneralSettings;

  factory GeneralSettings.fromJson(Map<String, dynamic> json) =>
      _$GeneralSettingsFromJson(json);
}

@freezed
class PrivacySettings with _$PrivacySettings {
  const factory PrivacySettings({
    required bool allowStrangerAdd,
    required bool showOnlineStatus,
    required bool allowViewMoments,
    required bool messageReadReceipt,
  }) = _PrivacySettings;

  factory PrivacySettings.fromJson(Map<String, dynamic> json) =>
      _$PrivacySettingsFromJson(json);
}

@freezed
class MessagePreferenceSettings with _$MessagePreferenceSettings {
  const factory MessagePreferenceSettings({
    required bool enableNotification,
    required bool enableSound,
    required bool enableVibration,
    required bool muteGroupMessages,
    required bool autoDownloadImages,
  }) = _MessagePreferenceSettings;

  factory MessagePreferenceSettings.fromJson(Map<String, dynamic> json) =>
      _$MessagePreferenceSettingsFromJson(json);
}

@freezed
class NotificationSettings with _$NotificationSettings {
  const factory NotificationSettings({
    required bool sound,
    required bool desktop,
    required bool preview,
  }) = _NotificationSettings;

  factory NotificationSettings.fromJson(Map<String, dynamic> json) =>
      _$NotificationSettingsFromJson(json);
}
```

- [ ] **Step 6: 创建 barrel exports**

```dart
// flutter/packages/core/lib/src/models/models.dart
export 'api_response.dart';
export 'user.dart';
export 'message.dart';
export 'session.dart';
export 'e2ee.dart';
export 'moments.dart';
export 'group.dart';
export 'settings.dart';
```

- [ ] **Step 7: 运行代码生成**

Run: `cd flutter/packages/core && dart run build_runner build --delete-conflicting-outputs`
Expected: 生成 `.freezed.dart` 和 `.g.dart` 文件，无错误

- [ ] **Step 8: Commit**

```bash
cd flutter
git add packages/core/lib/src/models/ packages/core/test/models/
git commit -m "feat(core): add data models with freezed (User, Message, ChatSession, Settings)"
```

---

### Task 4: 创建 Moments 和 Group 模型

**Files:**
- Create: `flutter/packages/core/lib/src/models/moments.dart`
- Create: `flutter/packages/core/lib/src/models/group.dart`

- [ ] **Step 1: 编写 Moments 模型**

```dart
// flutter/packages/core/lib/src/models/moments.dart
import 'package:freezed_annotation/freezed_annotation.dart';

part 'moments.freezed.dart';
part 'moments.g.dart';

@freezed
class MomentPost with _$MomentPost {
  const factory MomentPost({
    required String id,
    required String userId,
    required String content,
    required String createTime,
    String? userName,
    String? userAvatar,
    List<MomentMedia>? media,
    int? likeCount,
    int? commentCount,
    bool? isLiked,
  }) = _MomentPost;

  factory MomentPost.fromJson(Map<String, dynamic> json) =>
      _$MomentPostFromJson(json);
}

@freezed
class MomentMedia with _$MomentMedia {
  const factory MomentMedia({
    required String url,
    required String type,
    String? thumbnailUrl,
    int? size,
    int? duration,
  }) = _MomentMedia;

  factory MomentMedia.fromJson(Map<String, dynamic> json) =>
      _$MomentMediaFromJson(json);
}

@freezed
class MomentLike with _$MomentLike {
  const factory MomentLike({
    required String id,
    required String userId,
    required String createTime,
    String? userName,
    String? userAvatar,
  }) = _MomentLike;

  factory MomentLike.fromJson(Map<String, dynamic> json) =>
      _$MomentLikeFromJson(json);
}

@freezed
class MomentComment with _$MomentComment {
  const factory MomentComment({
    required String id,
    required String userId,
    required String content,
    required String createTime,
    String? userName,
    String? userAvatar,
    String? replyToUserId,
    String? replyToUserName,
  }) = _MomentComment;

  factory MomentComment.fromJson(Map<String, dynamic> json) =>
      _$MomentCommentFromJson(json);
}

@freezed
class MomentNotification with _$MomentNotification {
  const factory MomentNotification({
    required String id,
    required String type,
    required String createTime,
    bool? isRead,
    String? userId,
    String? userName,
    String? userAvatar,
    String? postId,
    String? commentId,
  }) = _MomentNotification;

  factory MomentNotification.fromJson(Map<String, dynamic> json) =>
      _$MomentNotificationFromJson(json);
}
```

- [ ] **Step 2: 编写 Group 模型**

```dart
// flutter/packages/core/lib/src/models/group.dart
import 'package:freezed_annotation/freezed_annotation.dart';

part 'group.freezed.dart';
part 'group.g.dart';

@freezed
class Group with _$Group {
  const factory Group({
    required String id,
    required String name,
    String? avatar,
    String? description,
    String? ownerId,
    int? memberCount,
    String? createTime,
    String? updateTime,
  }) = _Group;

  factory Group.fromJson(Map<String, dynamic> json) => _$GroupFromJson(json);
}

@freezed
class GroupMember with _$GroupMember {
  const factory GroupMember({
    required String id,
    required String userId,
    required String groupId,
    String? nickname,
    String? role,
    String? joinTime,
  }) = _GroupMember;

  factory GroupMember.fromJson(Map<String, dynamic> json) =>
      _$GroupMemberFromJson(json);
}
```

- [ ] **Step 3: 运行代码生成**

Run: `cd flutter/packages/core && dart run build_runner build --delete-conflicting-outputs`
Expected: 生成文件无错误

- [ ] **Step 4: Commit**

```bash
cd flutter
git add packages/core/lib/src/models/moments.dart packages/core/lib/src/models/group.dart
git commit -m "feat(core): add Moments and Group data models"
```

---

## Phase 3: 网络层

### Task 5: 创建网络接口（Ports）

**Files:**
- Create: `flutter/packages/core/lib/src/network/http_client.dart`
- Create: `flutter/packages/core/lib/src/network/ws_client.dart`
- Create: `flutter/packages/core/lib/src/network/network.dart`

- [ ] **Step 1: 编写 HttpClientPort 接口**

```dart
// flutter/packages/core/lib/src/network/http_client.dart
import 'package:im_core/core.dart';

abstract class HttpClientPort {
  Future<ApiResponse<T>> get<T>(
    String path, {
    Map<String, dynamic>? queryParameters,
    required T Function(Map<String, dynamic>) fromJson,
  });

  Future<ApiResponse<T>> post<T>(
    String path, {
    dynamic body,
    required T Function(Map<String, dynamic>) fromJson,
  });

  Future<ApiResponse<T>> put<T>(
    String path, {
    dynamic body,
    required T Function(Map<String, dynamic>) fromJson,
  });

  Future<ApiResponse<T>> delete<T>(
    String path, {
    Map<String, dynamic>? queryParameters,
    required T Function(Map<String, dynamic>) fromJson,
  });
}
```

- [ ] **Step 2: 编写 WsClientPort 接口**

```dart
// flutter/packages/core/lib/src/network/ws_client.dart
import 'dart:async';

abstract class WsEvent {
  String get type;
  Map<String, dynamic> get data;
  int get timestamp;
}

abstract class WsClientPort {
  Stream<WsEvent> get events;
  bool get isConnected;
  Future<void> connect(String url);
  Future<void> disconnect();
  void send(Map<String, dynamic> message);
}
```

- [ ] **Step 3: 创建 barrel export**

```dart
// flutter/packages/core/lib/src/network/network.dart
export 'http_client.dart';
export 'ws_client.dart';
```

- [ ] **Step 4: Commit**

```bash
cd flutter
git add packages/core/lib/src/network/
git commit -m "feat(core): add network port interfaces (HttpClient, WsClient)"
```

---

### Task 6: 创建存储接口（Ports）

**Files:**
- Create: `flutter/packages/core/lib/src/storage/storage_port.dart`
- Create: `flutter/packages/core/lib/src/storage/secure_storage_port.dart`
- Create: `flutter/packages/core/lib/src/storage/storage.dart`

- [ ] **Step 1: 编写 StoragePort 接口**

```dart
// flutter/packages/core/lib/src/storage/storage_port.dart
abstract class StoragePort {
  Future<String?> getString(String key);
  Future<void> setString(String key, String value);
  Future<void> remove(String key);
  Future<void> clear();
  Future<bool> containsKey(String key);
}
```

- [ ] **Step 2: 编写 SecureStoragePort 接口**

```dart
// flutter/packages/core/lib/src/storage/secure_storage_port.dart
abstract class SecureStoragePort {
  Future<String?> read(String key);
  Future<void> write(String key, String value);
  Future<void> delete(String key);
  Future<void> deleteAll();
  Future<bool> containsKey(String key);
}
```

- [ ] **Step 3: 创建 barrel export**

```dart
// flutter/packages/core/lib/src/storage/storage.dart
export 'storage_port.dart';
export 'secure_storage_port.dart';
```

- [ ] **Step 4: Commit**

```bash
cd flutter
git add packages/core/lib/src/storage/
git commit -m "feat(core): add storage port interfaces"
```

---

### Task 7: 创建 Web 平台适配器

**Files:**
- Create: `flutter/apps/web/lib/adapters/web_http_adapter.dart`
- Create: `flutter/apps/web/lib/adapters/web_ws_adapter.dart`
- Create: `flutter/apps/web/lib/adapters/web_storage_adapter.dart`
- Create: `flutter/apps/web/lib/adapters/adapters.dart`

- [ ] **Step 1: 编写 WebHttpClient 适配器**

```dart
// flutter/apps/web/lib/adapters/web_http_adapter.dart
import 'package:dio/dio.dart';
import 'package:im_core/core.dart';

class WebHttpClient implements HttpClientPort {
  WebHttpClient({required String baseUrl, required SecureStoragePort secureStorage})
      : _dio = Dio(BaseOptions(baseUrl: baseUrl)),
        _secureStorage = secureStorage {
    _dio.interceptors.addAll([
      _AuthInterceptor(secureStorage),
      _ErrorInterceptor(),
      LogInterceptor(requestBody: true, responseBody: true),
    ]);
  }

  final Dio _dio;
  final SecureStoragePort _secureStorage;

  @override
  Future<ApiResponse<T>> get<T>(
    String path, {
    Map<String, dynamic>? queryParameters,
    required T Function(Map<String, dynamic>) fromJson,
  }) async {
    final response = await _dio.get<Map<String, dynamic>>(
      path,
      queryParameters: queryParameters,
    );
    return _parseResponse(response, fromJson);
  }

  @override
  Future<ApiResponse<T>> post<T>(
    String path, {
    dynamic body,
    required T Function(Map<String, dynamic>) fromJson,
  }) async {
    final response = await _dio.post<Map<String, dynamic>>(path, data: body);
    return _parseResponse(response, fromJson);
  }

  @override
  Future<ApiResponse<T>> put<T>(
    String path, {
    dynamic body,
    required T Function(Map<String, dynamic>) fromJson,
  }) async {
    final response = await _dio.put<Map<String, dynamic>>(path, data: body);
    return _parseResponse(response, fromJson);
  }

  @override
  Future<ApiResponse<T>> delete<T>(
    String path, {
    Map<String, dynamic>? queryParameters,
    required T Function(Map<String, dynamic>) fromJson,
  }) async {
    final response = await _dio.delete<Map<String, dynamic>>(
      path,
      queryParameters: queryParameters,
    );
    return _parseResponse(response, fromJson);
  }

  ApiResponse<T> _parseResponse<T>(
    Response<Map<String, dynamic>> response,
    T Function(Map<String, dynamic>) fromJson,
  ) {
    final data = response.data!;
    return ApiResponse<T>(
      code: data['code'] as int,
      message: data['message'] as String,
      data: fromJson(data['data'] as Map<String, dynamic>),
      timestamp: data['timestamp'] as int?,
    );
  }
}

class _AuthInterceptor extends Interceptor {
  _AuthInterceptor(this._secureStorage);
  final SecureStoragePort _secureStorage;

  @override
  void onRequest(RequestOptions options, RequestInterceptorHandler handler) async {
    final token = await _secureStorage.read('access_token');
    if (token != null) {
      options.headers['Authorization'] = 'Bearer $token';
    }
    handler.next(options);
  }

  @override
  void onError(DioException err, ErrorInterceptorHandler handler) async {
    if (err.response?.statusCode == 401) {
      // TODO: Implement token refresh logic
    }
    handler.next(err);
  }
}

class _ErrorInterceptor extends Interceptor {
  @override
  void onError(DioException err, ErrorInterceptorHandler handler) {
    // TODO: Show toast/snackbar for errors
    handler.next(err);
  }
}
```

- [ ] **Step 2: 编写 WebWsClient 适配器**

```dart
// flutter/apps/web/lib/adapters/web_ws_adapter.dart
import 'dart:async';
import 'dart:html' as html;
import 'package:im_core/core.dart';

class WebWsEvent implements WsEvent {
  WebWsEvent({
    required this.type,
    required this.data,
    required this.timestamp,
  });

  @override
  final String type;

  @override
  final Map<String, dynamic> data;

  @override
  final int timestamp;
}

class WebWsClient implements WsClientPort {
  html.WebSocket? _socket;
  final _eventsController = StreamController<WsEvent>.broadcast();
  bool _isConnected = false;

  @override
  Stream<WsEvent> get events => _eventsController.stream;

  @override
  bool get isConnected => _isConnected;

  @override
  Future<void> connect(String url) async {
    _socket = html.WebSocket(url);
    _socket!.onOpen.listen((_) {
      _isConnected = true;
    });
    _socket!.onMessage.listen((event) {
      // Parse JSON and emit WsEvent
      // TODO: Parse message data
    });
    _socket!.onClose.listen((_) {
      _isConnected = false;
    });
    _socket!.onError.listen((_) {
      _isConnected = false;
    });
  }

  @override
  Future<void> disconnect() async {
    _socket?.close();
    _isConnected = false;
  }

  @override
  void send(Map<String, dynamic> message) {
    if (_isConnected) {
      _socket?.send(message.toString());
    }
  }
}
```

- [ ] **Step 3: 编写 WebStorageAdapter**

```dart
// flutter/apps/web/lib/adapters/web_storage_adapter.dart
import 'dart:convert';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:im_core/core.dart';

class WebStorageAdapter implements StoragePort {
  final _storage = const FlutterSecureStorage();

  @override
  Future<String?> getString(String key) => _storage.read(key: key);

  @override
  Future<void> setString(String key, String value) =>
      _storage.write(key: key, value: value);

  @override
  Future<void> remove(String key) => _storage.delete(key: key);

  @override
  Future<void> clear() => _storage.deleteAll();

  @override
  Future<bool> containsKey(String key) => _storage.containsKey(key: key);
}

class WebSecureStorageAdapter implements SecureStoragePort {
  final _storage = const FlutterSecureStorage();

  @override
  Future<String?> read(String key) => _storage.read(key: key);

  @override
  Future<void> write(String key, String value) =>
      _storage.write(key: key, value: value);

  @override
  Future<void> delete(String key) => _storage.delete(key: key);

  @override
  Future<void> deleteAll() => _storage.deleteAll();

  @override
  Future<bool> containsKey(String key) => _storage.containsKey(key: key);
}
```

- [ ] **Step 4: 创建 barrel export**

```dart
// flutter/apps/web/lib/adapters/adapters.dart
export 'web_http_adapter.dart';
export 'web_ws_adapter.dart';
export 'web_storage_adapter.dart';
```

- [ ] **Step 5: Commit**

```bash
cd flutter
git add apps/web/lib/adapters/
git commit -m "feat(web): add platform adapters (HTTP, WS, Storage)"
```

---

## Phase 4: 认证功能

### Task 8: 创建认证 Repository 和 Provider

**Files:**
- Create: `flutter/packages/core/lib/src/auth/auth_repository.dart`
- Create: `flutter/packages/core/lib/src/auth/auth.dart`
- Create: `flutter/apps/web/lib/features/auth/data/auth_repository_impl.dart`
- Create: `flutter/apps/web/lib/features/auth/presentation/auth_provider.dart`

- [ ] **Step 1: 编写 AuthRepository 接口**

```dart
// flutter/packages/core/lib/src/auth/auth_repository.dart
import 'package:im_core/core.dart';

abstract class AuthRepository {
  Future<UserAuthResponse> login(LoginRequest request);
  Future<UserAuthResponse> register(RegisterRequest request);
  Future<User> getProfile();
  Future<void> logout();
  Future<bool> isAuthenticated();
  Future<String?> getToken();
}
```

- [ ] **Step 2: 创建 barrel export**

```dart
// flutter/packages/core/lib/src/auth/auth.dart
export 'auth_repository.dart';
```

- [ ] **Step 3: 编写 AuthRepository 实现**

```dart
// flutter/apps/web/lib/features/auth/data/auth_repository_impl.dart
import 'package:im_core/core.dart';

class AuthRepositoryImpl implements AuthRepository {
  AuthRepositoryImpl({
    required HttpClientPort httpClient,
    required SecureStoragePort secureStorage,
  })  : _httpClient = httpClient,
        _secureStorage = secureStorage;

  final HttpClientPort _httpClient;
  final SecureStoragePort _secureStorage;

  @override
  Future<UserAuthResponse> login(LoginRequest request) async {
    final response = await _httpClient.post<UserAuthResponse>(
      UserEndpoints.login,
      body: request.toJson(),
      fromJson: UserAuthResponse.fromJson,
    );
    if (response.data.token != null) {
      await _secureStorage.write('access_token', response.data.token!);
    }
    return response.data;
  }

  @override
  Future<UserAuthResponse> register(RegisterRequest request) async {
    final response = await _httpClient.post<UserAuthResponse>(
      UserEndpoints.register,
      body: request.toJson(),
      fromJson: UserAuthResponse.fromJson,
    );
    return response.data;
  }

  @override
  Future<User> getProfile() async {
    final response = await _httpClient.get<User>(
      UserEndpoints.profile,
      fromJson: User.fromJson,
    );
    return response.data;
  }

  @override
  Future<void> logout() async {
    try {
      await _httpClient.post<void>(
        UserEndpoints.logout,
        fromJson: (_) {},
      );
    } finally {
      await _secureStorage.delete('access_token');
    }
  }

  @override
  Future<bool> isAuthenticated() async {
    final token = await _secureStorage.read('access_token');
    return token != null;
  }

  @override
  Future<String?> getToken() => _secureStorage.read('access_token');
}
```

- [ ] **Step 4: 编写 AuthProvider (Riverpod)**

```dart
// flutter/apps/web/lib/features/auth/presentation/auth_provider.dart
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:im_core/core.dart';

class AuthState {
  const AuthState({
    this.user,
    this.isAuthenticated = false,
    this.isLoading = false,
    this.error,
  });

  final User? user;
  final bool isAuthenticated;
  final bool isLoading;
  final String? error;

  AuthState copyWith({
    User? user,
    bool? isAuthenticated,
    bool? isLoading,
    String? error,
  }) {
    return AuthState(
      user: user ?? this.user,
      isAuthenticated: isAuthenticated ?? this.isAuthenticated,
      isLoading: isLoading ?? this.isLoading,
      error: error,
    );
  }
}

class AuthNotifier extends StateNotifier<AuthState> {
  AuthNotifier(this._repository) : super(const AuthState());

  final AuthRepository _repository;

  Future<void> login(String username, String password) async {
    state = state.copyWith(isLoading: true, error: null);
    try {
      final response = await _repository.login(
        LoginRequest(username: username, password: password),
      );
      state = AuthState(
        user: response.user,
        isAuthenticated: true,
      );
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
    }
  }

  Future<void> register(String username, String password, String nickname) async {
    state = state.copyWith(isLoading: true, error: null);
    try {
      await _repository.register(
        RegisterRequest(username: username, password: password, nickname: nickname),
      );
      state = state.copyWith(isLoading: false);
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
    }
  }

  Future<void> logout() async {
    await _repository.logout();
    state = const AuthState();
  }

  Future<void> checkAuth() async {
    final isAuth = await _repository.isAuthenticated();
    if (isAuth) {
      try {
        final user = await _repository.getProfile();
        state = AuthState(user: user, isAuthenticated: true);
      } catch (e) {
        state = const AuthState();
      }
    }
  }
}

final authProvider = StateNotifierProvider<AuthNotifier, AuthState>((ref) {
  // TODO: Inject repository from DI
  throw UnimplementedError('Configure authRepository provider');
});
```

- [ ] **Step 5: Commit**

```bash
cd flutter
git add packages/core/lib/src/auth/ apps/web/lib/features/auth/
git commit -m "feat: add auth repository and Riverpod provider"
```

---

### Task 9: 创建登录/注册页面

**Files:**
- Create: `flutter/apps/web/lib/features/auth/presentation/login_page.dart`
- Create: `flutter/apps/web/lib/features/auth/presentation/register_page.dart`

- [ ] **Step 1: 编写 LoginPage**

```dart
// flutter/apps/web/lib/features/auth/presentation/login_page.dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'auth_provider.dart';

class LoginPage extends ConsumerStatefulWidget {
  const LoginPage({super.key});

  @override
  ConsumerState<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends ConsumerState<LoginPage> {
  final _formKey = GlobalKey<FormState>();
  final _usernameController = TextEditingController();
  final _passwordController = TextEditingController();

  @override
  Widget build(BuildContext context) {
    final authState = ref.watch(authProvider);

    return Scaffold(
      body: Center(
        child: Card(
          margin: const EdgeInsets.all(32),
          child: Padding(
            padding: const EdgeInsets.all(32),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 400),
              child: Form(
                key: _formKey,
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text('登录', style: Theme.of(context).textTheme.headlineMedium),
                    const SizedBox(height: 32),
                    TextFormField(
                      controller: _usernameController,
                      decoration: const InputDecoration(
                        labelText: '用户名',
                        prefixIcon: Icon(Icons.person),
                      ),
                      validator: (v) => v?.isEmpty ?? true ? '请输入用户名' : null,
                    ),
                    const SizedBox(height: 16),
                    TextFormField(
                      controller: _passwordController,
                      obscureText: true,
                      decoration: const InputDecoration(
                        labelText: '密码',
                        prefixIcon: Icon(Icons.lock),
                      ),
                      validator: (v) => v?.isEmpty ?? true ? '请输入密码' : null,
                    ),
                    const SizedBox(height: 24),
                    if (authState.error != null)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 16),
                        child: Text(
                          authState.error!,
                          style: TextStyle(color: Theme.of(context).colorScheme.error),
                        ),
                      ),
                    SizedBox(
                      width: double.infinity,
                      child: FilledButton(
                        onPressed: authState.isLoading ? null : _login,
                        child: authState.isLoading
                            ? const SizedBox(
                                height: 20,
                                width: 20,
                                child: CircularProgressIndicator(strokeWidth: 2),
                              )
                            : const Text('登录'),
                      ),
                    ),
                    const SizedBox(height: 16),
                    TextButton(
                      onPressed: () => context.go('/register'),
                      child: const Text('没有账号？注册'),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  void _login() {
    if (_formKey.currentState?.validate() ?? false) {
      ref.read(authProvider.notifier).login(
            _usernameController.text,
            _passwordController.text,
          );
    }
  }

  @override
  void dispose() {
    _usernameController.dispose();
    _passwordController.dispose();
    super.dispose();
  }
}
```

- [ ] **Step 2: 编写 RegisterPage**

```dart
// flutter/apps/web/lib/features/auth/presentation/register_page.dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'auth_provider.dart';

class RegisterPage extends ConsumerStatefulWidget {
  const RegisterPage({super.key});

  @override
  ConsumerState<RegisterPage> createState() => _RegisterPageState();
}

class _RegisterPageState extends ConsumerState<RegisterPage> {
  final _formKey = GlobalKey<FormState>();
  final _usernameController = TextEditingController();
  final _passwordController = TextEditingController();
  final _confirmPasswordController = TextEditingController();
  final _nicknameController = TextEditingController();

  @override
  Widget build(BuildContext context) {
    final authState = ref.watch(authProvider);

    return Scaffold(
      body: Center(
        child: Card(
          margin: const EdgeInsets.all(32),
          child: Padding(
            padding: const EdgeInsets.all(32),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 400),
              child: Form(
                key: _formKey,
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text('注册', style: Theme.of(context).textTheme.headlineMedium),
                    const SizedBox(height: 32),
                    TextFormField(
                      controller: _usernameController,
                      decoration: const InputDecoration(labelText: '用户名'),
                      validator: (v) => v?.isEmpty ?? true ? '请输入用户名' : null,
                    ),
                    const SizedBox(height: 16),
                    TextFormField(
                      controller: _nicknameController,
                      decoration: const InputDecoration(labelText: '昵称'),
                      validator: (v) => v?.isEmpty ?? true ? '请输入昵称' : null,
                    ),
                    const SizedBox(height: 16),
                    TextFormField(
                      controller: _passwordController,
                      obscureText: true,
                      decoration: const InputDecoration(labelText: '密码'),
                      validator: (v) => (v?.length ?? 0) < 6 ? '密码至少6位' : null,
                    ),
                    const SizedBox(height: 16),
                    TextFormField(
                      controller: _confirmPasswordController,
                      obscureText: true,
                      decoration: const InputDecoration(labelText: '确认密码'),
                      validator: (v) => v != _passwordController.text ? '密码不一致' : null,
                    ),
                    const SizedBox(height: 24),
                    SizedBox(
                      width: double.infinity,
                      child: FilledButton(
                        onPressed: authState.isLoading ? null : _register,
                        child: const Text('注册'),
                      ),
                    ),
                    const SizedBox(height: 16),
                    TextButton(
                      onPressed: () => context.go('/login'),
                      child: const Text('已有账号？登录'),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  void _register() {
    if (_formKey.currentState?.validate() ?? false) {
      ref.read(authProvider.notifier).register(
            _usernameController.text,
            _passwordController.text,
            _nicknameController.text,
          );
    }
  }

  @override
  void dispose() {
    _usernameController.dispose();
    _passwordController.dispose();
    _confirmPasswordController.dispose();
    _nicknameController.dispose();
    super.dispose();
  }
}
```

- [ ] **Step 3: Commit**

```bash
cd flutter
git add apps/web/lib/features/auth/presentation/
git commit -m "feat(web): add Login and Register pages"
```

---

## Phase 5: 路由与布局

### Task 10: 创建路由和主布局

**Files:**
- Create: `flutter/apps/web/lib/core/router/app_router.dart`
- Create: `flutter/apps/web/lib/core/theme/app_theme.dart`
- Create: `flutter/apps/web/lib/app.dart`
- Modify: `flutter/apps/web/lib/main.dart`

- [ ] **Step 1: 编写 AppRouter**

```dart
// flutter/apps/web/lib/core/router/app_router.dart
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:im_web/features/auth/presentation/login_page.dart';
import 'package:im_web/features/auth/presentation/register_page.dart';
import 'package:im_web/features/chat/presentation/chat_page.dart';
import 'package:im_web/features/contacts/presentation/contacts_page.dart';
import 'package:im_web/features/moments/presentation/moments_page.dart';
import 'package:im_web/features/settings/presentation/settings_page.dart';

final appRouterProvider = Provider<GoRouter>((ref) {
  return GoRouter(
    initialLocation: '/chat',
    redirect: (context, state) {
      // TODO: Check auth state and redirect to /login if not authenticated
      return null;
    },
    routes: [
      GoRoute(
        path: '/login',
        builder: (_, __) => const LoginPage(),
      ),
      GoRoute(
        path: '/register',
        builder: (_, __) => const RegisterPage(),
      ),
      ShellRoute(
        builder: (_, __, child) => MainLayout(child: child),
        routes: [
          GoRoute(
            path: '/chat',
            builder: (_, __) => const ChatPage(),
          ),
          GoRoute(
            path: '/chat/:sessionId',
            builder: (_, state) => ChatPage(
              sessionId: state.pathParameters['sessionId'],
            ),
          ),
          GoRoute(
            path: '/contacts',
            builder: (_, __) => const ContactsPage(),
          ),
          GoRoute(
            path: '/moments',
            builder: (_, __) => const MomentsPage(),
          ),
          GoRoute(
            path: '/settings',
            builder: (_, __) => const SettingsPage(),
          ),
        ],
      ),
    ],
  );
});

class MainLayout extends StatelessWidget {
  const MainLayout({required this.child, super.key});
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Row(
        children: [
          NavigationRail(
            selectedIndex: _selectedIndex(context),
            onDestinationSelected: (index) => _onNavigate(context, index),
            labelType: NavigationRailLabelType.all,
            destinations: const [
              NavigationRailDestination(
                icon: Icon(Icons.chat_outlined),
                selectedIcon: Icon(Icons.chat),
                label: Text('聊天'),
              ),
              NavigationRailDestination(
                icon: Icon(Icons.people_outlined),
                selectedIcon: Icon(Icons.people),
                label: Text('联系人'),
              ),
              NavigationRailDestination(
                icon: Icon(Icons.camera_alt_outlined),
                selectedIcon: Icon(Icons.camera_alt),
                label: Text('朋友圈'),
              ),
              NavigationRailDestination(
                icon: Icon(Icons.settings_outlined),
                selectedIcon: Icon(Icons.settings),
                label: Text('设置'),
              ),
            ],
          ),
          const VerticalDivider(thickness: 1, width: 1),
          Expanded(child: child),
        ],
      ),
    );
  }

  int _selectedIndex(BuildContext context) {
    final location = GoRouterState.of(context).uri.path;
    if (location.startsWith('/chat')) return 0;
    if (location.startsWith('/contacts')) return 1;
    if (location.startsWith('/moments')) return 2;
    if (location.startsWith('/settings')) return 3;
    return 0;
  }

  void _onNavigate(BuildContext context, int index) {
    switch (index) {
      case 0:
        context.go('/chat');
      case 1:
        context.go('/contacts');
      case 2:
        context.go('/moments');
      case 3:
        context.go('/settings');
    }
  }
}
```

- [ ] **Step 2: 编写 AppTheme**

```dart
// flutter/apps/web/lib/core/theme/app_theme.dart
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

class AppTheme {
  static ThemeData get lightTheme {
    return ThemeData(
      useMaterial3: true,
      colorSchemeSeed: Colors.blue,
      textTheme: GoogleFonts.notoSansScTextTheme(),
    );
  }

  static ThemeData get darkTheme {
    return ThemeData(
      useMaterial3: true,
      colorSchemeSeed: Colors.blue,
      brightness: Brightness.dark,
      textTheme: GoogleFonts.notoSansScTextTheme(
        ThemeData.dark().textTheme,
      ),
    );
  }
}
```

- [ ] **Step 3: 编写 App widget**

```dart
// flutter/apps/web/lib/app.dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'core/router/app_router.dart';
import 'core/theme/app_theme.dart';

class App extends ConsumerWidget {
  const App({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final router = ref.watch(appRouterProvider);

    return MaterialApp.router(
      title: 'IM',
      theme: AppTheme.lightTheme,
      darkTheme: AppTheme.darkTheme,
      routerConfig: router,
    );
  }
}
```

- [ ] **Step 4: 创建占位页面**

```dart
// flutter/apps/web/lib/features/chat/presentation/chat_page.dart
import 'package:flutter/material.dart';

class ChatPage extends StatelessWidget {
  const ChatPage({this.sessionId, super.key});
  final String? sessionId;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Text(sessionId != null ? 'Chat: $sessionId' : 'Chat List'),
    );
  }
}
```

```dart
// flutter/apps/web/lib/features/contacts/presentation/contacts_page.dart
import 'package:flutter/material.dart';

class ContactsPage extends StatelessWidget {
  const ContactsPage({super.key});

  @override
  Widget build(BuildContext context) {
    return const Center(child: Text('Contacts'));
  }
}
```

```dart
// flutter/apps/web/lib/features/moments/presentation/moments_page.dart
import 'package:flutter/material.dart';

class MomentsPage extends StatelessWidget {
  const MomentsPage({super.key});

  @override
  Widget build(BuildContext context) {
    return const Center(child: Text('Moments'));
  }
}
```

```dart
// flutter/apps/web/lib/features/settings/presentation/settings_page.dart
import 'package:flutter/material.dart';

class SettingsPage extends StatelessWidget {
  const SettingsPage({super.key});

  @override
  Widget build(BuildContext context) {
    return const Center(child: Text('Settings'));
  }
}
```

- [ ] **Step 5: Commit**

```bash
cd flutter
git add apps/web/lib/
git commit -m "feat(web): add GoRouter, MainLayout, Material 3 theme, and placeholder pages"
```

---

## Phase 6: 聊天功能

### Task 11: 创建聊天 Provider 和消息 API

**Files:**
- Create: `flutter/apps/web/lib/features/chat/data/message_api.dart`
- Create: `flutter/apps/web/lib/features/chat/presentation/chat_provider.dart`

- [ ] **Step 1: 编写 MessageApi**

```dart
// flutter/apps/web/lib/features/chat/data/message_api.dart
import 'package:im_core/core.dart';

class MessageApi {
  MessageApi(this._httpClient);
  final HttpClientPort _httpClient;

  Future<List<ChatSession>> getConversations() async {
    final response = await _httpClient.get<List<ChatSession>>(
      MessageEndpoints.conversations,
      fromJson: (json) => (json['content'] as List)
          .map((e) => ChatSession.fromJson(e as Map<String, dynamic>))
          .toList(),
    );
    return response.data;
  }

  Future<List<Message>> getPrivateHistory(
    String friendId, {
    int? page,
    int? size,
  }) async {
    final response = await _httpClient.get<List<Message>>(
      MessageEndpoints.privateHistory(friendId),
      queryParameters: {
        if (page != null) 'page': page,
        if (size != null) 'size': size,
      },
      fromJson: (json) => (json['content'] as List)
          .map((e) => Message.fromJson(e as Map<String, dynamic>))
          .toList(),
    );
    return response.data;
  }

  Future<Message> sendPrivateMessage(SendPrivateMessageRequest request) async {
    final response = await _httpClient.post<Message>(
      MessageEndpoints.sendPrivate,
      body: request.toJson(),
      fromJson: Message.fromJson,
    );
    return response.data;
  }

  Future<void> markRead(String conversationId) async {
    await _httpClient.put<void>(
      MessageEndpoints.markRead(conversationId),
      fromJson: (_) {},
    );
  }
}
```

- [ ] **Step 2: 编写 ChatProvider**

```dart
// flutter/apps/web/lib/features/chat/presentation/chat_provider.dart
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:im_core/core.dart';
import '../data/message_api.dart';

class ChatState {
  const ChatState({
    this.sessions = const [],
    this.messages = const {},
    this.isLoading = false,
    this.error,
  });

  final List<ChatSession> sessions;
  final Map<String, List<Message>> messages;
  final bool isLoading;
  final String? error;

  ChatState copyWith({
    List<ChatSession>? sessions,
    Map<String, List<Message>>? messages,
    bool? isLoading,
    String? error,
  }) {
    return ChatState(
      sessions: sessions ?? this.sessions,
      messages: messages ?? this.messages,
      isLoading: isLoading ?? this.isLoading,
      error: error,
    );
  }
}

class ChatNotifier extends StateNotifier<ChatState> {
  ChatNotifier(this._messageApi) : super(const ChatState());

  final MessageApi _messageApi;

  Future<void> loadSessions() async {
    state = state.copyWith(isLoading: true);
    try {
      final sessions = await _messageApi.getConversations();
      state = ChatState(sessions: sessions);
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
    }
  }

  Future<void> loadMessages(String sessionId) async {
    try {
      final messages = await _messageApi.getPrivateHistory(sessionId);
      state = state.copyWith(
        messages: {...state.messages, sessionId: messages},
      );
    } catch (e) {
      state = state.copyWith(error: e.toString());
    }
  }

  void addMessage(String sessionId, Message message) {
    final current = state.messages[sessionId] ?? [];
    state = state.copyWith(
      messages: {
        ...state.messages,
        sessionId: [...current, message],
      },
    );
  }

  void updateMessageStatus(String sessionId, String messageId, String status) {
    final current = state.messages[sessionId];
    if (current == null) return;
    final updated = current.map((m) {
      if (m.id == messageId) {
        return m.copyWith(status: status);
      }
      return m;
    }).toList();
    state = state.copyWith(
      messages: {...state.messages, sessionId: updated},
    );
  }
}

final chatProvider = StateNotifierProvider<ChatNotifier, ChatState>((ref) {
  // TODO: Inject MessageApi from DI
  throw UnimplementedError('Configure messageApi provider');
});
```

- [ ] **Step 3: Commit**

```bash
cd flutter
git add apps/web/lib/features/chat/
git commit -m "feat(web): add chat provider and message API"
```

---

### Task 12: 创建聊天列表和消息显示页面

**Files:**
- Modify: `flutter/apps/web/lib/features/chat/presentation/chat_page.dart`
- Create: `flutter/apps/web/lib/features/chat/presentation/widgets/session_tile.dart`
- Create: `flutter/apps/web/lib/features/chat/presentation/widgets/message_bubble.dart`
- Create: `flutter/apps/web/lib/features/chat/presentation/widgets/message_input.dart`

- [ ] **Step 1: 实现 ChatPage（会话列表 + 消息详情）**

```dart
// flutter/apps/web/lib/features/chat/presentation/chat_page.dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'chat_provider.dart';
import 'widgets/session_tile.dart';
import 'widgets/message_bubble.dart';
import 'widgets/message_input.dart';

class ChatPage extends ConsumerWidget {
  const ChatPage({this.sessionId, super.key});
  final String? sessionId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final chatState = ref.watch(chatProvider);

    return Row(
      children: [
        // Session list
        SizedBox(
          width: 320,
          child: Column(
            children: [
              Padding(
                padding: const EdgeInsets.all(16),
                child: TextField(
                  decoration: InputDecoration(
                    hintText: '搜索',
                    prefixIcon: const Icon(Icons.search),
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(24),
                    ),
                  ),
                ),
              ),
              Expanded(
                child: ListView.builder(
                  itemCount: chatState.sessions.length,
                  itemBuilder: (context, index) {
                    final session = chatState.sessions[index];
                    return SessionTile(
                      session: session,
                      isSelected: session.id == sessionId,
                      onTap: () {
                        // Navigate to chat detail
                      },
                    );
                  },
                ),
              ),
            ],
          ),
        ),
        const VerticalDivider(thickness: 1, width: 1),
        // Message detail
        Expanded(
          child: sessionId != null
              ? _ChatDetail(
                  sessionId: sessionId!,
                  messages: chatState.messages[sessionId] ?? [],
                )
              : const Center(child: Text('选择一个会话')),
        ),
      ],
    );
  }
}

class _ChatDetail extends StatelessWidget {
  const _ChatDetail({required this.sessionId, required this.messages});
  final String sessionId;
  final List<dynamic> messages;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        // Header
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            border: Border(bottom: BorderSide(color: Theme.of(context).dividerColor)),
          ),
          child: Row(
            children: [
              Text('会话 $sessionId', style: Theme.of(context).textTheme.titleMedium),
            ],
          ),
        ),
        // Messages
        Expanded(
          child: ListView.builder(
            reverse: true,
            itemCount: messages.length,
            itemBuilder: (context, index) {
              final message = messages[messages.length - 1 - index];
              return MessageBubble(message: message);
            },
          ),
        ),
        // Input
        MessageInput(
          onSend: (text) {
            // TODO: Send message
          },
        ),
      ],
    );
  }
}
```

- [ ] **Step 2: 实现 SessionTile widget**

```dart
// flutter/apps/web/lib/features/chat/presentation/widgets/session_tile.dart
import 'package:flutter/material.dart';
import 'package:im_core/core.dart';

class SessionTile extends StatelessWidget {
  const SessionTile({
    required this.session,
    required this.isSelected,
    required this.onTap,
    super.key,
  });

  final ChatSession session;
  final bool isSelected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return ListTile(
      selected: isSelected,
      leading: CircleAvatar(
        child: Text(session.targetName.isNotEmpty ? session.targetName[0] : '?'),
      ),
      title: Text(session.targetName, maxLines: 1, overflow: TextOverflow.ellipsis),
      subtitle: Text(
        session.lastMessage?.content ?? '',
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
      ),
      trailing: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Text(
            session.lastMessageTime ?? '',
            style: Theme.of(context).textTheme.bodySmall,
          ),
          if (session.unreadCount > 0)
            Badge(
              label: Text('${session.unreadCount}'),
            ),
        ],
      ),
      onTap: onTap,
    );
  }
}
```

- [ ] **Step 3: 实现 MessageBubble widget**

```dart
// flutter/apps/web/lib/features/chat/presentation/widgets/message_bubble.dart
import 'package:flutter/material.dart';
import 'package:im_core/core.dart';

class MessageBubble extends StatelessWidget {
  const MessageBubble({required this.message, super.key});
  final Message message;

  @override
  Widget build(BuildContext context) {
    final isOwn = message.senderId == 'currentUserId'; // TODO: Get from auth state

    return Align(
      alignment: isOwn ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        margin: const EdgeInsets.symmetric(vertical: 4, horizontal: 16),
        padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 12),
        constraints: BoxConstraints(
          maxWidth: MediaQuery.of(context).size.width * 0.6,
        ),
        decoration: BoxDecoration(
          color: isOwn
              ? Theme.of(context).colorScheme.primaryContainer
              : Theme.of(context).colorScheme.surfaceContainerHighest,
          borderRadius: BorderRadius.circular(12),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (!isOwn)
              Text(
                message.senderName ?? '',
                style: Theme.of(context).textTheme.labelSmall,
              ),
            Text(message.content),
            Align(
              alignment: Alignment.bottomRight,
              child: Text(
                message.sendTime,
                style: Theme.of(context).textTheme.bodySmall,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
```

- [ ] **Step 4: 实现 MessageInput widget**

```dart
// flutter/apps/web/lib/features/chat/presentation/widgets/message_input.dart
import 'package:flutter/material.dart';

class MessageInput extends StatefulWidget {
  const MessageInput({required this.onSend, super.key});
  final void Function(String text) onSend;

  @override
  State<MessageInput> createState() => _MessageInputState();
}

class _MessageInputState extends State<MessageInput> {
  final _controller = TextEditingController();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        border: Border(top: BorderSide(color: Theme.of(context).dividerColor)),
      ),
      child: Row(
        children: [
          IconButton(
            icon: const Icon(Icons.attach_file),
            onPressed: () {
              // TODO: File upload
            },
          ),
          Expanded(
            child: TextField(
              controller: _controller,
              decoration: InputDecoration(
                hintText: '输入消息...',
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(24),
                ),
                contentPadding: const EdgeInsets.symmetric(horizontal: 16),
              ),
              onSubmitted: _send,
            ),
          ),
          const SizedBox(width: 8),
          FilledButton(
            onPressed: () => _send(_controller.text),
            child: const Text('发送'),
          ),
        ],
      ),
    );
  }

  void _send(String text) {
    if (text.trim().isNotEmpty) {
      widget.onSend(text.trim());
      _controller.clear();
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }
}
```

- [ ] **Step 5: Commit**

```bash
cd flutter
git add apps/web/lib/features/chat/
git commit -m "feat(web): add chat list, message bubbles, and message input"
```

---

## Phase 7: 联系人功能

### Task 13: 创建联系人页面

**Files:**
- Modify: `flutter/apps/web/lib/features/contacts/presentation/contacts_page.dart`
- Create: `flutter/apps/web/lib/features/contacts/data/contacts_api.dart`
- Create: `flutter/apps/web/lib/features/contacts/presentation/contacts_provider.dart`

- [ ] **Step 1: 编写 ContactsApi**

```dart
// flutter/apps/web/lib/features/contacts/data/contacts_api.dart
import 'package:im_core/core.dart';

class ContactsApi {
  ContactsApi(this._httpClient);
  final HttpClientPort _httpClient;

  Future<List<Friendship>> getFriends() async {
    final response = await _httpClient.get<List<Friendship>>(
      FriendEndpoints.list,
      fromJson: (json) => (json as List)
          .map((e) => Friendship.fromJson(e as Map<String, dynamic>))
          .toList(),
    );
    return response.data;
  }

  Future<List<FriendRequest>> getFriendRequests() async {
    final response = await _httpClient.get<List<FriendRequest>>(
      FriendEndpoints.requests,
      fromJson: (json) => (json as List)
          .map((e) => FriendRequest.fromJson(e as Map<String, dynamic>))
          .toList(),
    );
    return response.data;
  }

  Future<void> sendFriendRequest(String userId, String? message) async {
    await _httpClient.post<void>(
      FriendEndpoints.request,
      body: {'userId': userId, if (message != null) 'message': message},
      fromJson: (_) {},
    );
  }

  Future<void> acceptFriendRequest(String requestId) async {
    await _httpClient.post<void>(
      FriendEndpoints.accept,
      body: {'requestId': requestId},
      fromJson: (_) {},
    );
  }

  Future<void> rejectFriendRequest(String requestId) async {
    await _httpClient.post<void>(
      FriendEndpoints.reject,
      body: {'requestId': requestId},
      fromJson: (_) {},
    );
  }
}
```

- [ ] **Step 2: 编写 ContactsProvider**

```dart
// flutter/apps/web/lib/features/contacts/presentation/contacts_provider.dart
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:im_core/core.dart';
import '../data/contacts_api.dart';

class ContactsState {
  const ContactsState({
    this.friends = const [],
    this.friendRequests = const [],
    this.isLoading = false,
  });

  final List<Friendship> friends;
  final List<FriendRequest> friendRequests;
  final bool isLoading;

  ContactsState copyWith({
    List<Friendship>? friends,
    List<FriendRequest>? friendRequests,
    bool? isLoading,
  }) {
    return ContactsState(
      friends: friends ?? this.friends,
      friendRequests: friendRequests ?? this.friendRequests,
      isLoading: isLoading ?? this.isLoading,
    );
  }
}

class ContactsNotifier extends StateNotifier<ContactsState> {
  ContactsNotifier(this._api) : super(const ContactsState());

  final ContactsApi _api;

  Future<void> loadFriends() async {
    state = state.copyWith(isLoading: true);
    final friends = await _api.getFriends();
    final requests = await _api.getFriendRequests();
    state = ContactsState(friends: friends, friendRequests: requests);
  }

  Future<void> acceptRequest(String requestId) async {
    await _api.acceptFriendRequest(requestId);
    await loadFriends();
  }

  Future<void> rejectRequest(String requestId) async {
    await _api.rejectFriendRequest(requestId);
    await loadFriends();
  }
}

final contactsProvider = StateNotifierProvider<ContactsNotifier, ContactsState>((ref) {
  throw UnimplementedError('Configure contactsApi provider');
});
```

- [ ] **Step 3: 实现 ContactsPage**

```dart
// flutter/apps/web/lib/features/contacts/presentation/contacts_page.dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'contacts_provider.dart';

class ContactsPage extends ConsumerStatefulWidget {
  const ContactsPage({super.key});

  @override
  ConsumerState<ContactsPage> createState() => _ContactsPageState();
}

class _ContactsPageState extends ConsumerState<ContactsPage> {
  @override
  void initState() {
    super.initState();
    Future.microtask(() => ref.read(contactsProvider.notifier).loadFriends());
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(contactsProvider);

    return DefaultTabController(
      length: 2,
      child: Column(
        children: [
          const TabBar(tabs: [Tab(text: '好友'), Tab(text: '请求')]),
          Expanded(
            child: TabBarView(
              children: [
                // Friends list
                ListView.builder(
                  itemCount: state.friends.length,
                  itemBuilder: (context, index) {
                    final friend = state.friends[index];
                    return ListTile(
                      leading: CircleAvatar(
                        child: Text(friend.username.isNotEmpty ? friend.username[0] : '?'),
                      ),
                      title: Text(friend.nickname ?? friend.username),
                      subtitle: Text(friend.signature ?? ''),
                      trailing: friend.isOnline == true
                          ? const Icon(Icons.circle, color: Colors.green, size: 12)
                          : null,
                    );
                  },
                ),
                // Friend requests
                ListView.builder(
                  itemCount: state.friendRequests.length,
                  itemBuilder: (context, index) {
                    final request = state.friendRequests[index];
                    return ListTile(
                      leading: CircleAvatar(
                        child: Text(request.applicantUsername.isNotEmpty
                            ? request.applicantUsername[0]
                            : '?'),
                      ),
                      title: Text(request.applicantNickname ?? request.applicantUsername),
                      subtitle: Text(request.reason ?? ''),
                      trailing: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          FilledButton(
                            onPressed: () => ref
                                .read(contactsProvider.notifier)
                                .acceptRequest(request.id),
                            child: const Text('接受'),
                          ),
                          const SizedBox(width: 8),
                          OutlinedButton(
                            onPressed: () => ref
                                .read(contactsProvider.notifier)
                                .rejectRequest(request.id),
                            child: const Text('拒绝'),
                          ),
                        ],
                      ),
                    );
                  },
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
```

- [ ] **Step 4: Commit**

```bash
cd flutter
git add apps/web/lib/features/contacts/
git commit -m "feat(web): add contacts page with friends list and requests"
```

---

## Phase 8: 朋友圈和设置

### Task 14: 创建朋友圈页面

**Files:**
- Modify: `flutter/apps/web/lib/features/moments/presentation/moments_page.dart`
- Create: `flutter/apps/web/lib/features/moments/data/moments_api.dart`
- Create: `flutter/apps/web/lib/features/moments/presentation/moments_provider.dart`

- [ ] **Step 1: 编写 MomentsApi**

```dart
// flutter/apps/web/lib/features/moments/data/moments_api.dart
import 'package:im_core/core.dart';

class MomentsApi {
  MomentsApi(this._httpClient);
  final HttpClientPort _httpClient;

  Future<List<MomentPost>> getFeed({int? page, int? size}) async {
    final response = await _httpClient.get<List<MomentPost>>(
      MomentsEndpoints.feed,
      queryParameters: {
        if (page != null) 'page': page,
        if (size != null) 'size': size,
      },
      fromJson: (json) => (json as List)
          .map((e) => MomentPost.fromJson(e as Map<String, dynamic>))
          .toList(),
    );
    return response.data;
  }

  Future<MomentPost> createPost({
    required String content,
    List<String>? mediaUrls,
  }) async {
    final response = await _httpClient.post<MomentPost>(
      MomentsEndpoints.create,
      body: {'content': content, if (mediaUrls != null) 'mediaUrls': mediaUrls},
      fromJson: MomentPost.fromJson,
    );
    return response.data;
  }

  Future<void> likePost(String postId) async {
    await _httpClient.post<void>(
      MomentsEndpoints.like(postId),
      fromJson: (_) {},
    );
  }

  Future<void> unlikePost(String postId) async {
    await _httpClient.delete<void>(
      MomentsEndpoints.unlike(postId),
      fromJson: (_) {},
    );
  }

  Future<MomentComment> addComment(String postId, String content) async {
    final response = await _httpClient.post<MomentComment>(
      MomentsEndpoints.createComment(postId),
      body: {'content': content},
      fromJson: MomentComment.fromJson,
    );
    return response.data;
  }
}
```

- [ ] **Step 2: 编写 MomentsProvider**

```dart
// flutter/apps/web/lib/features/moments/presentation/moments_provider.dart
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:im_core/core.dart';
import '../data/moments_api.dart';

class MomentsState {
  const MomentsState({this.posts = const [], this.isLoading = false});

  final List<MomentPost> posts;
  final bool isLoading;

  MomentsState copyWith({List<MomentPost>? posts, bool? isLoading}) {
    return MomentsState(
      posts: posts ?? this.posts,
      isLoading: isLoading ?? this.isLoading,
    );
  }
}

class MomentsNotifier extends StateNotifier<MomentsState> {
  MomentsNotifier(this._api) : super(const MomentsState());

  final MomentsApi _api;

  Future<void> loadFeed() async {
    state = state.copyWith(isLoading: true);
    final posts = await _api.getFeed();
    state = MomentsState(posts: posts);
  }

  Future<void> toggleLike(String postId, bool isLiked) async {
    if (isLiked) {
      await _api.unlikePost(postId);
    } else {
      await _api.likePost(postId);
    }
    await loadFeed();
  }
}

final momentsProvider = StateNotifierProvider<MomentsNotifier, MomentsState>((ref) {
  throw UnimplementedError('Configure momentsApi provider');
});
```

- [ ] **Step 3: 实现 MomentsPage**

```dart
// flutter/apps/web/lib/features/moments/presentation/moments_page.dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'moments_provider.dart';

class MomentsPage extends ConsumerStatefulWidget {
  const MomentsPage({super.key});

  @override
  ConsumerState<MomentsPage> createState() => _MomentsPageState();
}

class _MomentsPageState extends ConsumerState<MomentsPage> {
  @override
  void initState() {
    super.initState();
    Future.microtask(() => ref.read(momentsProvider.notifier).loadFeed());
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(momentsProvider);

    return Column(
      children: [
        // Post composer
        Padding(
          padding: const EdgeInsets.all(16),
          child: Row(
            children: [
              const CircleAvatar(child: Icon(Icons.person)),
              const SizedBox(width: 12),
              Expanded(
                child: TextField(
                  decoration: InputDecoration(
                    hintText: '分享新鲜事...',
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(24),
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
        const Divider(),
        // Feed
        Expanded(
          child: ListView.builder(
            itemCount: state.posts.length,
            itemBuilder: (context, index) {
              final post = state.posts[index];
              return Card(
                margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          CircleAvatar(
                            child: Text(
                              post.userName?.isNotEmpty == true
                                  ? post.userName![0]
                                  : '?',
                            ),
                          ),
                          const SizedBox(width: 12),
                          Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(post.userName ?? ''),
                              Text(
                                post.createTime,
                                style: Theme.of(context).textTheme.bodySmall,
                              ),
                            ],
                          ),
                        ],
                      ),
                      const SizedBox(height: 12),
                      Text(post.content),
                      if (post.media?.isNotEmpty == true) ...[
                        const SizedBox(height: 12),
                        // TODO: Media grid
                      ],
                      const SizedBox(height: 12),
                      Row(
                        children: [
                          IconButton(
                            icon: Icon(
                              post.isLiked == true
                                  ? Icons.thumb_up
                                  : Icons.thumb_up_outlined,
                            ),
                            onPressed: () => ref
                                .read(momentsProvider.notifier)
                                .toggleLike(post.id, post.isLiked ?? false),
                          ),
                          Text('${post.likeCount ?? 0}'),
                          const SizedBox(width: 16),
                          IconButton(
                            icon: const Icon(Icons.comment_outlined),
                            onPressed: () {
                              // TODO: Show comments
                            },
                          ),
                          Text('${post.commentCount ?? 0}'),
                        ],
                      ),
                    ],
                  ),
                ),
              );
            },
          ),
        ),
      ],
    );
  }
}
```

- [ ] **Step 4: Commit**

```bash
cd flutter
git add apps/web/lib/features/moments/
git commit -m "feat(web): add moments page with feed, likes, and comments"
```

---

### Task 15: 创建设置页面

**Files:**
- Modify: `flutter/apps/web/lib/features/settings/presentation/settings_page.dart`
- Create: `flutter/apps/web/lib/features/settings/data/settings_api.dart`
- Create: `flutter/apps/web/lib/features/settings/presentation/settings_provider.dart`

- [ ] **Step 1: 编写 SettingsApi 和 Provider**

```dart
// flutter/apps/web/lib/features/settings/data/settings_api.dart
import 'package:im_core/core.dart';

class SettingsApi {
  SettingsApi(this._httpClient);
  final HttpClientPort _httpClient;

  Future<UserSettings> getSettings() async {
    final response = await _httpClient.get<UserSettings>(
      UserEndpoints.settings,
      fromJson: UserSettings.fromJson,
    );
    return response.data;
  }

  Future<void> updateSettings(UserSettings settings) async {
    await _httpClient.put<void>(
      UserEndpoints.settings,
      body: settings.toJson(),
      fromJson: (_) {},
    );
  }
}
```

```dart
// flutter/apps/web/lib/features/settings/presentation/settings_provider.dart
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:im_core/core.dart';
import '../data/settings_api.dart';

class SettingsNotifier extends StateNotifier<UserSettings?> {
  SettingsNotifier(this._api) : super(null);

  final SettingsApi _api;

  Future<void> loadSettings() async {
    state = await _api.getSettings();
  }

  Future<void> updateSettings(UserSettings settings) async {
    await _api.updateSettings(settings);
    state = settings;
  }
}

final settingsProvider = StateNotifierProvider<SettingsNotifier, UserSettings?>((ref) {
  throw UnimplementedError('Configure settingsApi provider');
});
```

- [ ] **Step 2: 实现 SettingsPage**

```dart
// flutter/apps/web/lib/features/settings/presentation/settings_page.dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'settings_provider.dart';

class SettingsPage extends ConsumerStatefulWidget {
  const SettingsPage({super.key});

  @override
  ConsumerState<SettingsPage> createState() => _SettingsPageState();
}

class _SettingsPageState extends ConsumerState<SettingsPage> {
  @override
  void initState() {
    super.initState();
    Future.microtask(() => ref.read(settingsProvider.notifier).loadSettings());
  }

  @override
  Widget build(BuildContext context) {
    final settings = ref.watch(settingsProvider);

    if (settings == null) {
      return const Center(child: CircularProgressIndicator());
    }

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        // General
        Text('通用设置', style: Theme.of(context).textTheme.titleMedium),
        const SizedBox(height: 8),
        Card(
          child: Column(
            children: [
              ListTile(
                title: const Text('语言'),
                trailing: DropdownButton<String>(
                  value: settings.general.language,
                  items: const [
                    DropdownMenuItem(value: 'zh-CN', child: Text('简体中文')),
                    DropdownMenuItem(value: 'en-US', child: Text('English')),
                  ],
                  onChanged: (v) {
                    if (v != null) {
                      ref.read(settingsProvider.notifier).updateSettings(
                            settings.copyWith(
                              general: settings.general.copyWith(language: v),
                            ),
                          );
                    }
                  },
                ),
              ),
              ListTile(
                title: const Text('主题'),
                trailing: DropdownButton<String>(
                  value: settings.general.theme,
                  items: const [
                    DropdownMenuItem(value: 'light', child: Text('浅色')),
                    DropdownMenuItem(value: 'dark', child: Text('深色')),
                    DropdownMenuItem(value: 'system', child: Text('跟随系统')),
                  ],
                  onChanged: (v) {
                    if (v != null) {
                      ref.read(settingsProvider.notifier).updateSettings(
                            settings.copyWith(
                              general: settings.general.copyWith(theme: v),
                            ),
                          );
                    }
                  },
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 24),
        // Privacy
        Text('隐私设置', style: Theme.of(context).textTheme.titleMedium),
        const SizedBox(height: 8),
        Card(
          child: Column(
            children: [
              SwitchListTile(
                title: const Text('允许陌生人添加'),
                value: settings.privacy.allowStrangerAdd,
                onChanged: (v) {
                  ref.read(settingsProvider.notifier).updateSettings(
                        settings.copyWith(
                          privacy: settings.privacy.copyWith(allowStrangerAdd: v),
                        ),
                      );
                },
              ),
              SwitchListTile(
                title: const Text('显示在线状态'),
                value: settings.privacy.showOnlineStatus,
                onChanged: (v) {
                  ref.read(settingsProvider.notifier).updateSettings(
                        settings.copyWith(
                          privacy: settings.privacy.copyWith(showOnlineStatus: v),
                        ),
                      );
                },
              ),
            ],
          ),
        ),
      ],
    );
  }
}
```

- [ ] **Step 3: Commit**

```bash
cd flutter
git add apps/web/lib/features/settings/
git commit -m "feat(web): add settings page with general and privacy options"
```

---

## Phase 9: Rust E2EE 集成

### Task 16: 设置 flutter_rust_bridge

**Files:**
- Create: `flutter/native/rust/Cargo.toml`
- Create: `flutter/native/rust/src/lib.rs`
- Create: `flutter/native/rust/src/api/mod.rs`
- Create: `flutter/native/rust/src/api/e2ee.rs`

- [ ] **Step 1: 创建 Rust 项目**

```toml
# flutter/native/rust/Cargo.toml
[package]
name = "im-rust-bridge"
version = "0.1.0"
edition = "2021"

[lib]
crate-type = ["cdylib", "staticlib"]

[dependencies]
flutter_rust_bridge = "=2.1.0"
e2ee-core = { path = "../../../backend/e2ee-core" }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
bincode = "1"
anyhow = "1"
```

- [ ] **Step 2: 编写 E2EE 桥接 API**

```rust
// flutter/native/rust/src/api/e2ee.rs
use anyhow::Result;
use e2ee_core::{self, primitives, ratchet, state, x3dh};

pub struct PreKeyBundle {
    pub identity_key: Vec<u8>,
    pub signed_pre_key: Vec<u8>,
    pub signed_pre_key_signature: Vec<u8>,
    pub one_time_pre_keys: Vec<Vec<u8>>,
}

pub fn generate_key_bundle(otk_count: u32) -> Result<PreKeyBundle> {
    let bundle = x3dh::generate_key_bundle_with_count(otk_count as usize)?;
    Ok(PreKeyBundle {
        identity_key: bundle.identity_key.to_bytes().to_vec(),
        signed_pre_key: bundle.signed_pre_key.to_bytes().to_vec(),
        signed_pre_key_signature: bundle.signed_pre_key_signature.to_bytes().to_vec(),
        one_time_pre_keys: bundle
            .one_time_pre_keys
            .iter()
            .map(|k| k.public_key.to_bytes().to_vec())
            .collect(),
    })
}

pub fn x3dh_initiate(
    identity_key: Vec<u8>,
    signed_pre_key: Vec<u8>,
    one_time_pre_key: Option<Vec<u8>>,
) -> Result<Vec<u8>> {
    // TODO: Implement X3DH initiation
    Ok(vec![])
}

pub fn x3dh_respond(
    identity_key: Vec<u8>,
    ephemeral_key: Vec<u8>,
    signed_pre_key: Vec<u8>,
    one_time_pre_key: Option<Vec<u8>>,
) -> Result<Vec<u8>> {
    // TODO: Implement X3DH response
    Ok(vec![])
}

pub fn ratchet_encrypt(state_bytes: Vec<u8>, plaintext: Vec<u8>) -> Result<(Vec<u8>, Vec<u8>)> {
    // TODO: Implement ratchet encryption
    Ok((vec![], vec![]))
}

pub fn ratchet_decrypt(state_bytes: Vec<u8>, ciphertext: Vec<u8>) -> Result<(Vec<u8>, Vec<u8>)> {
    // TODO: Implement ratchet decryption
    Ok((vec![], vec![]))
}

pub fn export_state(state_bytes: Vec<u8>) -> Result<Vec<u8>> {
    // TODO: Export ratchet state
    Ok(vec![])
}

pub fn restore_state(state_bytes: Vec<u8>) -> Result<Vec<u8>> {
    // TODO: Restore ratchet state
    Ok(vec![])
}
```

- [ ] **Step 3: 创建 lib.rs**

```rust
// flutter/native/rust/src/lib.rs
mod api;
```

```rust
// flutter/native/rust/src/api/mod.rs
pub mod e2ee;
```

- [ ] **Step 4: 运行 flutter_rust_bridge_codegen**

Run: `cd flutter && flutter_rust_bridge_codegen generate`
Expected: 生成 Dart 绑定文件

- [ ] **Step 5: Commit**

```bash
cd flutter
git add native/rust/
git commit -m "feat: add Rust E2EE bridge with flutter_rust_bridge"
```

---

### Task 17: 集成 E2EE 到聊天流程

**Files:**
- Create: `flutter/packages/core/lib/src/crypto/e2ee_service.dart`
- Create: `flutter/packages/core/lib/src/crypto/crypto.dart`
- Modify: `flutter/apps/web/lib/features/chat/presentation/chat_provider.dart`

- [ ] **Step 1: 编写 E2eeService**

```dart
// flutter/packages/core/lib/src/crypto/e2ee_service.dart
import 'dart:typed_data';

abstract class E2eeService {
  Future<Uint8List> generateKeyBundle(int otkCount);
  Future<Uint8List> x3dhInitiate(Uint8List identityKey, Uint8List signedPreKey, Uint8List? oneTimePreKey);
  Future<Uint8List> x3dhRespond(Uint8List identityKey, Uint8List ephemeralKey, Uint8List signedPreKey, Uint8List? oneTimePreKey);
  Future<(Uint8List, Uint8List)> ratchetEncrypt(Uint8List state, Uint8List plaintext);
  Future<(Uint8List, Uint8List)> ratchetDecrypt(Uint8List state, Uint8List ciphertext);
  Future<Uint8List> exportState(Uint8List state);
  Future<Uint8List> restoreState(Uint8List state);
}
```

- [ ] **Step 2: 创建 barrel export**

```dart
// flutter/packages/core/lib/src/crypto/crypto.dart
export 'e2ee_service.dart';
```

- [ ] **Step 3: 在 ChatProvider 中集成 E2EE**

在 `chat_provider.dart` 的 `sendMessage` 方法中添加加密逻辑：

```dart
Future<void> sendMessage(String sessionId, String text, {bool encrypted = false}) async {
  String content = text;
  E2eeEnvelope? e2eeEnvelope;

  if (encrypted) {
    // TODO: Get session state, encrypt message, create envelope
    // final (newState, ciphertext) = await _e2eeService.ratchetEncrypt(stateBytes, utf8.encode(text));
    // e2eeEnvelope = E2eeEnvelope(...);
    // content = base64Encode(ciphertext);
  }

  final request = SendPrivateMessageRequest(
    receiverId: sessionId,
    messageType: 'TEXT',
    content: content,
    e2eeEnvelope: e2eeEnvelope,
  );

  final message = await _messageApi.sendPrivateMessage(request);
  addMessage(sessionId, message);
}
```

- [ ] **Step 4: Commit**

```bash
cd flutter
git add packages/core/lib/src/crypto/ apps/web/lib/features/chat/
git commit -m "feat: add E2EE service interface and integrate into chat flow"
```

---

## Phase 10: 清理和验证

### Task 18: 配置依赖注入和全局初始化

**Files:**
- Create: `flutter/apps/web/lib/core/di/providers.dart`
- Modify: `flutter/apps/web/lib/main.dart`

- [ ] **Step 1: 编写全局 DI providers**

```dart
// flutter/apps/web/lib/core/di/providers.dart
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:im_core/core.dart';
import '../../adapters/adapters.dart';
import '../../features/auth/data/auth_repository_impl.dart';
import '../../features/auth/presentation/auth_provider.dart';
import '../../features/chat/data/message_api.dart';
import '../../features/chat/presentation/chat_provider.dart';
import '../../features/contacts/data/contacts_api.dart';
import '../../features/contacts/presentation/contacts_provider.dart';
import '../../features/moments/data/moments_api.dart';
import '../../features/moments/presentation/moments_provider.dart';
import '../../features/settings/data/settings_api.dart';
import '../../features/settings/presentation/settings_provider.dart';

// Storage
final secureStorageProvider = Provider<SecureStoragePort>((ref) {
  return WebSecureStorageAdapter();
});

final storageProvider = Provider<StoragePort>((ref) {
  return WebStorageAdapter();
});

// HTTP
final httpClientProvider = Provider<HttpClientPort>((ref) {
  return WebHttpClient(
    baseUrl: 'http://localhost:8082', // TODO: Configure
    secureStorage: ref.watch(secureStorageProvider),
  );
});

// Auth
final authRepositoryProvider = Provider<AuthRepository>((ref) {
  return AuthRepositoryImpl(
    httpClient: ref.watch(httpClientProvider),
    secureStorage: ref.watch(secureStorageProvider),
  );
});

final authStateProvider = StateNotifierProvider<AuthNotifier, AuthState>((ref) {
  return AuthNotifier(ref.watch(authRepositoryProvider));
});

// Message
final messageApiProvider = Provider<MessageApi>((ref) {
  return MessageApi(ref.watch(httpClientProvider));
});

final chatStateProvider = StateNotifierProvider<ChatNotifier, ChatState>((ref) {
  return ChatNotifier(ref.watch(messageApiProvider));
});

// Contacts
final contactsApiProvider = Provider<ContactsApi>((ref) {
  return ContactsApi(ref.watch(httpClientProvider));
});

final contactsStateProvider = StateNotifierProvider<ContactsNotifier, ContactsState>((ref) {
  return ContactsNotifier(ref.watch(contactsApiProvider));
});

// Moments
final momentsApiProvider = Provider<MomentsApi>((ref) {
  return MomentsApi(ref.watch(httpClientProvider));
});

final momentsStateProvider = StateNotifierProvider<MomentsNotifier, MomentsState>((ref) {
  return MomentsNotifier(ref.watch(momentsApiProvider));
});

// Settings
final settingsApiProvider = Provider<SettingsApi>((ref) {
  return SettingsApi(ref.watch(httpClientProvider));
});

final settingsStateProvider = StateNotifierProvider<SettingsNotifier, UserSettings?>((ref) {
  return SettingsNotifier(ref.watch(settingsApiProvider));
});
```

- [ ] **Step 2: 更新 main.dart**

```dart
// flutter/apps/web/lib/main.dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'app.dart';

void main() {
  runApp(const ProviderScope(child: App()));
}
```

- [ ] **Step 3: 更新各 Provider 使用全局 DI**

将各 feature 中的 `throw UnimplementedError` 替换为使用 `core/di/providers.dart` 中的 provider。

- [ ] **Step 4: Commit**

```bash
cd flutter
git add apps/web/lib/
git commit -m "feat(web): configure dependency injection with Riverpod"
```

---

### Task 19: 运行构建验证

- [ ] **Step 1: 安装依赖**

Run: `cd flutter/packages/core && dart pub get`
Run: `cd flutter/packages/ui && flutter pub get`
Run: `cd flutter/apps/web && flutter pub get`

- [ ] **Step 2: 运行代码生成**

Run: `cd flutter/packages/core && dart run build_runner build --delete-conflicting-outputs`
Run: `cd flutter/apps/web && dart run build_runner build --delete-conflicting-outputs`

- [ ] **Step 3: 运行分析**

Run: `cd flutter/packages/core && flutter analyze`
Run: `cd flutter/apps/web && flutter analyze`

- [ ] **Step 4: 运行测试**

Run: `cd flutter/packages/core && flutter test`
Run: `cd flutter/apps/web && flutter test`

- [ ] **Step 5: 构建 Web**

Run: `cd flutter/apps/web && flutter build web`
Expected: 构建成功，输出到 `build/web/`

- [ ] **Step 6: Commit**

```bash
cd flutter
git add -A
git commit -m "chore: verify build passes for Flutter Web"
```

---

## 完成检查清单

- [ ] Flutter 项目结构正确（packages/core, packages/ui, apps/web）
- [ ] 所有 API 端点常量已定义（63 个 HTTP + 10 个 WS）
- [ ] 核心数据模型已定义（User, Message, ChatSession, Settings 等）
- [ ] 网络层接口（HttpClientPort, WsClientPort）已定义
- [ ] 存储接口（StoragePort, SecureStoragePort）已定义
- [ ] Web 平台适配器已实现
- [ ] 认证功能（登录/注册）可用
- [ ] 路由和主布局正常工作
- [ ] 聊天列表和消息显示可用
- [ ] 联系人页面可用
- [ ] 朋友圈页面可用
- [ ] 设置页面可用
- [ ] Rust E2EE 桥接已设置
- [ ] 依赖注入配置完成
- [ ] `flutter build web` 成功
