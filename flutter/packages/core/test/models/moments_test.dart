import 'package:flutter_test/flutter_test.dart';
import 'package:im_core/core.dart';

void main() {
  group('MomentPost', () {
    test('fromJson creates MomentPost with all fields', () {
      final json = {
        'id': 'post1',
        'userId': 'u1',
        'content': 'Hello World!',
        'createTime': '2024-01-01T00:00:00Z',
        'userName': 'Alice',
        'userAvatar': 'https://example.com/alice.png',
        'media': [
          {
            'url': 'https://example.com/photo1.jpg',
            'type': 'image',
            'thumbnailUrl': 'https://example.com/thumb1.jpg',
            'size': 1024000,
          },
          {
            'url': 'https://example.com/video1.mp4',
            'type': 'video',
            'duration': 30,
          },
        ],
        'likeCount': 10,
        'commentCount': 5,
        'isLiked': true,
      };
      final post = MomentPost.fromJson(json);

      expect(post.id, 'post1');
      expect(post.userId, 'u1');
      expect(post.content, 'Hello World!');
      expect(post.createTime, '2024-01-01T00:00:00Z');
      expect(post.userName, 'Alice');
      expect(post.userAvatar, 'https://example.com/alice.png');
      expect(post.media, isNotNull);
      expect(post.media!.length, 2);
      expect(post.media![0].url, 'https://example.com/photo1.jpg');
      expect(post.media![0].type, 'image');
      expect(post.media![0].thumbnailUrl, 'https://example.com/thumb1.jpg');
      expect(post.media![0].size, 1024000);
      expect(post.media![1].url, 'https://example.com/video1.mp4');
      expect(post.media![1].type, 'video');
      expect(post.media![1].duration, 30);
      expect(post.likeCount, 10);
      expect(post.commentCount, 5);
      expect(post.isLiked, isTrue);
    });

    test('fromJson creates MomentPost with only required fields', () {
      final json = {
        'id': 'post2',
        'userId': 'u1',
        'content': 'Simple post',
        'createTime': '2024-01-01T00:00:00Z',
      };
      final post = MomentPost.fromJson(json);

      expect(post.id, 'post2');
      expect(post.userName, isNull);
      expect(post.userAvatar, isNull);
      expect(post.media, isNull);
      expect(post.likeCount, isNull);
      expect(post.commentCount, isNull);
      expect(post.isLiked, isNull);
    });

    test('equality works correctly', () {
      const p1 = MomentPost(
        id: 'p1',
        userId: 'u1',
        content: 'Hello',
        createTime: '2024-01-01T00:00:00Z',
      );
      const p2 = MomentPost(
        id: 'p1',
        userId: 'u1',
        content: 'Hello',
        createTime: '2024-01-01T00:00:00Z',
      );
      const p3 = MomentPost(
        id: 'p2',
        userId: 'u1',
        content: 'Hello',
        createTime: '2024-01-01T00:00:00Z',
      );

      expect(p1, equals(p2));
      expect(p1, isNot(equals(p3)));
    });
  });

  group('MomentMedia', () {
    test('fromJson creates MomentMedia correctly', () {
      final json = {
        'url': 'https://example.com/photo.jpg',
        'type': 'image',
        'thumbnailUrl': 'https://example.com/thumb.jpg',
        'size': 512000,
        'duration': null,
      };
      final media = MomentMedia.fromJson(json);

      expect(media.url, 'https://example.com/photo.jpg');
      expect(media.type, 'image');
      expect(media.thumbnailUrl, 'https://example.com/thumb.jpg');
      expect(media.size, 512000);
      expect(media.duration, isNull);
    });

    test('fromJson creates video media', () {
      final json = {
        'url': 'https://example.com/video.mp4',
        'type': 'video',
        'duration': 60,
      };
      final media = MomentMedia.fromJson(json);

      expect(media.type, 'video');
      expect(media.duration, 60);
      expect(media.thumbnailUrl, isNull);
    });

    test('toJson roundtrip preserves data', () {
      const media = MomentMedia(
        url: 'https://example.com/img.png',
        type: 'image',
        size: 1000,
      );
      final json = media.toJson();
      final restored = MomentMedia.fromJson(json);

      expect(restored, equals(media));
    });
  });

  group('MomentLike', () {
    test('fromJson creates MomentLike correctly', () {
      final json = {
        'id': 'like1',
        'userId': 'u1',
        'createTime': '2024-01-01T00:00:00Z',
        'userName': 'Alice',
        'userAvatar': 'https://example.com/alice.png',
      };
      final like = MomentLike.fromJson(json);

      expect(like.id, 'like1');
      expect(like.userId, 'u1');
      expect(like.createTime, '2024-01-01T00:00:00Z');
      expect(like.userName, 'Alice');
      expect(like.userAvatar, 'https://example.com/alice.png');
    });

    test('fromJson handles optional fields', () {
      final json = {
        'id': 'like2',
        'userId': 'u2',
        'createTime': '2024-01-01T00:00:00Z',
      };
      final like = MomentLike.fromJson(json);

      expect(like.userName, isNull);
      expect(like.userAvatar, isNull);
    });
  });

  group('MomentComment', () {
    test('fromJson creates MomentComment correctly', () {
      final json = {
        'id': 'comment1',
        'userId': 'u1',
        'content': 'Nice post!',
        'createTime': '2024-01-01T00:00:00Z',
        'userName': 'Alice',
        'userAvatar': 'https://example.com/alice.png',
        'replyToUserId': 'u2',
        'replyToUserName': 'Bob',
      };
      final comment = MomentComment.fromJson(json);

      expect(comment.id, 'comment1');
      expect(comment.userId, 'u1');
      expect(comment.content, 'Nice post!');
      expect(comment.createTime, '2024-01-01T00:00:00Z');
      expect(comment.userName, 'Alice');
      expect(comment.replyToUserId, 'u2');
      expect(comment.replyToUserName, 'Bob');
    });

    test('fromJson handles non-reply comment', () {
      final json = {
        'id': 'comment2',
        'userId': 'u1',
        'content': 'Great!',
        'createTime': '2024-01-01T00:00:00Z',
      };
      final comment = MomentComment.fromJson(json);

      expect(comment.replyToUserId, isNull);
      expect(comment.replyToUserName, isNull);
    });
  });

  group('MomentNotification', () {
    test('fromJson creates MomentNotification correctly', () {
      final json = {
        'id': 'notif1',
        'type': 'like',
        'createTime': '2024-01-01T00:00:00Z',
        'isRead': false,
        'userId': 'u1',
        'userName': 'Alice',
        'userAvatar': 'https://example.com/alice.png',
        'postId': 'post1',
        'commentId': null,
      };
      final notification = MomentNotification.fromJson(json);

      expect(notification.id, 'notif1');
      expect(notification.type, 'like');
      expect(notification.createTime, '2024-01-01T00:00:00Z');
      expect(notification.isRead, isFalse);
      expect(notification.userId, 'u1');
      expect(notification.userName, 'Alice');
      expect(notification.postId, 'post1');
      expect(notification.commentId, isNull);
    });

    test('fromJson creates comment notification', () {
      final json = {
        'id': 'notif2',
        'type': 'comment',
        'createTime': '2024-01-01T00:00:00Z',
        'commentId': 'comment1',
        'postId': 'post1',
      };
      final notification = MomentNotification.fromJson(json);

      expect(notification.type, 'comment');
      expect(notification.commentId, 'comment1');
      expect(notification.isRead, isNull);
    });
  });
}
