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
    String? refreshToken,
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
