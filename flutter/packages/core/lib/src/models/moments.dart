// ignore_for_file: invalid_annotation_target

import 'package:freezed_annotation/freezed_annotation.dart';

part 'moments.freezed.dart';
part 'moments.g.dart';

@freezed
class MomentPost with _$MomentPost {
  const factory MomentPost({
    required String id,
    required String userId,
    String? content,
    @JsonKey(name: 'createdAt') required String createTime,
    String? userName,
    String? userAvatar,
    String? userNickname,
    String? location,
    int? visibility,
    String? linkUrl,
    String? linkTitle,
    String? linkCover,
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
    String? id,
    required String url,
    required int type,
    int? sortOrder,
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
    @JsonKey(name: 'createdAt') required String createTime,
    String? userName,
    String? userNickname,
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
    @JsonKey(name: 'createdAt') required String createTime,
    String? userName,
    String? userNickname,
    String? userAvatar,
    String? parentId,
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
    @JsonKey(name: 'createdAt') required String createTime,
    bool? isRead,
    String? userId,
    String? userName,
    String? userNickname,
    String? userAvatar,
    String? postId,
    String? commentId,
  }) = _MomentNotification;

  factory MomentNotification.fromJson(Map<String, dynamic> json) =>
      _$MomentNotificationFromJson(json);
}

@freezed
class PostWithDetails with _$PostWithDetails {
  const factory PostWithDetails({
    required MomentPost post,
    List<MomentMedia>? media,
    bool? isLiked,
    int? likeCount,
    int? commentCount,
    String? userNickname,
    String? userAvatar,
  }) = _PostWithDetails;

  factory PostWithDetails.fromJson(Map<String, dynamic> json) =>
      _$PostWithDetailsFromJson(json);
}

@freezed
class CreatePostRequest with _$CreatePostRequest {
  const factory CreatePostRequest({
    String? content,
    int? visibility,
    String? location,
  }) = _CreatePostRequest;

  factory CreatePostRequest.fromJson(Map<String, dynamic> json) =>
      _$CreatePostRequestFromJson(json);
}

@freezed
class CreateCommentRequest with _$CreateCommentRequest {
  const factory CreateCommentRequest({
    required String content,
    String? parentId,
  }) = _CreateCommentRequest;

  factory CreateCommentRequest.fromJson(Map<String, dynamic> json) =>
      _$CreateCommentRequestFromJson(json);
}

@freezed
class MediaItem with _$MediaItem {
  const factory MediaItem({
    required String url,
    required int type,
    int? sortOrder,
  }) = _MediaItem;

  factory MediaItem.fromJson(Map<String, dynamic> json) =>
      _$MediaItemFromJson(json);
}
