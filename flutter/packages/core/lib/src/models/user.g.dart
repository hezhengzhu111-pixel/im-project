// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'user.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_$UserImpl _$$UserImplFromJson(Map<String, dynamic> json) => _$UserImpl(
      id: json['id'] as String,
      username: json['username'] as String,
      nickname: json['nickname'] as String?,
      avatar: json['avatar'] as String?,
      email: json['email'] as String?,
      phone: json['phone'] as String?,
      gender: json['gender'] as String?,
      birthday: json['birthday'] as String?,
      signature: json['signature'] as String?,
      location: json['location'] as String?,
      lastSeen: json['lastSeen'] as String?,
      status: json['status'] as String?,
      lastLoginTime: json['lastLoginTime'] as String?,
      createTime: json['createTime'] as String?,
      permissions: (json['permissions'] as List<dynamic>?)
          ?.map((e) => e as String)
          .toList(),
    );

Map<String, dynamic> _$$UserImplToJson(_$UserImpl instance) =>
    <String, dynamic>{
      'id': instance.id,
      'username': instance.username,
      'nickname': instance.nickname,
      'avatar': instance.avatar,
      'email': instance.email,
      'phone': instance.phone,
      'gender': instance.gender,
      'birthday': instance.birthday,
      'signature': instance.signature,
      'location': instance.location,
      'lastSeen': instance.lastSeen,
      'status': instance.status,
      'lastLoginTime': instance.lastLoginTime,
      'createTime': instance.createTime,
      'permissions': instance.permissions,
    };

_$AuthSessionImpl _$$AuthSessionImplFromJson(Map<String, dynamic> json) =>
    _$AuthSessionImpl(
      currentUser: json['currentUser'] == null
          ? null
          : User.fromJson(json['currentUser'] as Map<String, dynamic>),
      isAuthenticated: json['isAuthenticated'] as bool,
      authReady: json['authReady'] as bool,
      permissions: (json['permissions'] as List<dynamic>?)
          ?.map((e) => e as String)
          .toList(),
    );

Map<String, dynamic> _$$AuthSessionImplToJson(_$AuthSessionImpl instance) =>
    <String, dynamic>{
      'currentUser': instance.currentUser,
      'isAuthenticated': instance.isAuthenticated,
      'authReady': instance.authReady,
      'permissions': instance.permissions,
    };

_$LoginRequestImpl _$$LoginRequestImplFromJson(Map<String, dynamic> json) =>
    _$LoginRequestImpl(
      username: json['username'] as String,
      password: json['password'] as String,
      rememberMe: json['rememberMe'] as bool? ?? false,
    );

Map<String, dynamic> _$$LoginRequestImplToJson(_$LoginRequestImpl instance) =>
    <String, dynamic>{
      'username': instance.username,
      'password': instance.password,
      'rememberMe': instance.rememberMe,
    };

_$RegisterRequestImpl _$$RegisterRequestImplFromJson(
        Map<String, dynamic> json) =>
    _$RegisterRequestImpl(
      username: json['username'] as String,
      password: json['password'] as String,
      nickname: json['nickname'] as String,
      email: json['email'] as String?,
      phone: json['phone'] as String?,
    );

Map<String, dynamic> _$$RegisterRequestImplToJson(
        _$RegisterRequestImpl instance) =>
    <String, dynamic>{
      'username': instance.username,
      'password': instance.password,
      'nickname': instance.nickname,
      'email': instance.email,
      'phone': instance.phone,
    };

_$UserAuthResponseImpl _$$UserAuthResponseImplFromJson(
        Map<String, dynamic> json) =>
    _$UserAuthResponseImpl(
      success: json['success'] as bool,
      message: json['message'] as String?,
      user: json['user'] == null
          ? null
          : User.fromJson(json['user'] as Map<String, dynamic>),
      token: json['token'] as String?,
      accessToken: json['accessToken'] as String?,
      refreshToken: json['refreshToken'] as String?,
      expiresInMs: (json['expiresInMs'] as num?)?.toInt(),
      refreshExpiresInMs: (json['refreshExpiresInMs'] as num?)?.toInt(),
      permissions: (json['permissions'] as List<dynamic>?)
          ?.map((e) => e as String)
          .toList(),
    );

Map<String, dynamic> _$$UserAuthResponseImplToJson(
        _$UserAuthResponseImpl instance) =>
    <String, dynamic>{
      'success': instance.success,
      'message': instance.message,
      'user': instance.user,
      'token': instance.token,
      'accessToken': instance.accessToken,
      'refreshToken': instance.refreshToken,
      'expiresInMs': instance.expiresInMs,
      'refreshExpiresInMs': instance.refreshExpiresInMs,
      'permissions': instance.permissions,
    };

_$FriendshipImpl _$$FriendshipImplFromJson(Map<String, dynamic> json) =>
    _$FriendshipImpl(
      id: json['id'] as String,
      friendId: json['friendId'] as String,
      username: json['username'] as String,
      nickname: json['nickname'] as String?,
      avatar: json['avatar'] as String?,
      remark: json['remark'] as String?,
      isOnline: json['isOnline'] as bool?,
      lastActiveTime: json['lastActiveTime'] as String?,
      createdAt: json['createdAt'] as String?,
      createTime: json['createTime'] as String?,
      signature: json['signature'] as String?,
      lastSeen: json['lastSeen'] as String?,
    );

Map<String, dynamic> _$$FriendshipImplToJson(_$FriendshipImpl instance) =>
    <String, dynamic>{
      'id': instance.id,
      'friendId': instance.friendId,
      'username': instance.username,
      'nickname': instance.nickname,
      'avatar': instance.avatar,
      'remark': instance.remark,
      'isOnline': instance.isOnline,
      'lastActiveTime': instance.lastActiveTime,
      'createdAt': instance.createdAt,
      'createTime': instance.createTime,
      'signature': instance.signature,
      'lastSeen': instance.lastSeen,
    };

_$FriendRequestImpl _$$FriendRequestImplFromJson(Map<String, dynamic> json) =>
    _$FriendRequestImpl(
      id: json['id'] as String,
      applicantId: json['applicantId'] as String,
      applicantUsername: json['applicantUsername'] as String,
      applicantNickname: json['applicantNickname'] as String?,
      applicantAvatar: json['applicantAvatar'] as String?,
      targetUserId: json['targetUserId'] as String?,
      targetUsername: json['targetUsername'] as String?,
      targetNickname: json['targetNickname'] as String?,
      targetAvatar: json['targetAvatar'] as String?,
      reason: json['reason'] as String?,
      status: json['status'] as String,
      createTime: json['createTime'] as String,
      updateTime: json['updateTime'] as String?,
    );

Map<String, dynamic> _$$FriendRequestImplToJson(_$FriendRequestImpl instance) =>
    <String, dynamic>{
      'id': instance.id,
      'applicantId': instance.applicantId,
      'applicantUsername': instance.applicantUsername,
      'applicantNickname': instance.applicantNickname,
      'applicantAvatar': instance.applicantAvatar,
      'targetUserId': instance.targetUserId,
      'targetUsername': instance.targetUsername,
      'targetNickname': instance.targetNickname,
      'targetAvatar': instance.targetAvatar,
      'reason': instance.reason,
      'status': instance.status,
      'createTime': instance.createTime,
      'updateTime': instance.updateTime,
    };

_$OnlineStatusImpl _$$OnlineStatusImplFromJson(Map<String, dynamic> json) =>
    _$OnlineStatusImpl(
      userId: json['userId'] as String,
      status: json['status'] as String,
      lastSeen: json['lastSeen'] as String?,
    );

Map<String, dynamic> _$$OnlineStatusImplToJson(_$OnlineStatusImpl instance) =>
    <String, dynamic>{
      'userId': instance.userId,
      'status': instance.status,
      'lastSeen': instance.lastSeen,
    };
