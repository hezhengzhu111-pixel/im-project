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
