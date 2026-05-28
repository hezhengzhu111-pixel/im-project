import 'package:test/test.dart';
import 'package:im_core/core.dart';

void main() {
  group('User', () {
    test('fromJson creates User with all fields', () {
      final json = {
        'id': '1',
        'username': 'testuser',
        'nickname': 'Test User',
        'avatar': 'https://example.com/avatar.png',
        'email': 'test@example.com',
        'phone': '13800138000',
        'gender': 'male',
        'birthday': '1990-01-01',
        'signature': 'Hello World',
        'location': 'Beijing',
        'lastSeen': '2024-01-01T00:00:00Z',
        'status': 'online',
        'lastLoginTime': '2024-01-01T00:00:00Z',
        'createTime': '2023-01-01T00:00:00Z',
        'permissions': ['admin', 'user'],
      };
      final user = User.fromJson(json);

      expect(user.id, '1');
      expect(user.username, 'testuser');
      expect(user.nickname, 'Test User');
      expect(user.avatar, 'https://example.com/avatar.png');
      expect(user.email, 'test@example.com');
      expect(user.phone, '13800138000');
      expect(user.gender, 'male');
      expect(user.birthday, '1990-01-01');
      expect(user.signature, 'Hello World');
      expect(user.location, 'Beijing');
      expect(user.lastSeen, '2024-01-01T00:00:00Z');
      expect(user.status, 'online');
      expect(user.lastLoginTime, '2024-01-01T00:00:00Z');
      expect(user.createTime, '2023-01-01T00:00:00Z');
      expect(user.permissions, ['admin', 'user']);
    });

    test('fromJson creates User with only required fields', () {
      final json = {
        'id': '2',
        'username': 'minimaluser',
      };
      final user = User.fromJson(json);

      expect(user.id, '2');
      expect(user.username, 'minimaluser');
      expect(user.nickname, isNull);
      expect(user.avatar, isNull);
      expect(user.email, isNull);
      expect(user.phone, isNull);
      expect(user.gender, isNull);
      expect(user.birthday, isNull);
      expect(user.signature, isNull);
      expect(user.location, isNull);
      expect(user.lastSeen, isNull);
      expect(user.status, isNull);
      expect(user.lastLoginTime, isNull);
      expect(user.createTime, isNull);
      expect(user.permissions, isNull);
    });

    test('toJson serializes correctly', () {
      const user = User(
        id: '1',
        username: 'testuser',
        nickname: 'Test',
      );
      final json = user.toJson();

      expect(json['id'], '1');
      expect(json['username'], 'testuser');
      expect(json['nickname'], 'Test');
    });

    test('equality works correctly', () {
      const user1 = User(id: '1', username: 'test', nickname: 'A');
      const user2 = User(id: '1', username: 'test', nickname: 'A');
      const user3 = User(id: '2', username: 'test', nickname: 'A');

      expect(user1, equals(user2));
      expect(user1, isNot(equals(user3)));
    });
  });

  group('AuthSession', () {
    test('fromJson creates AuthSession correctly', () {
      final json = {
        'currentUser': {
          'id': '1',
          'username': 'testuser',
        },
        'isAuthenticated': true,
        'authReady': true,
        'permissions': ['admin'],
      };
      final session = AuthSession.fromJson(json);

      expect(session.currentUser, isNotNull);
      expect(session.currentUser!.id, '1');
      expect(session.currentUser!.username, 'testuser');
      expect(session.isAuthenticated, isTrue);
      expect(session.authReady, isTrue);
      expect(session.permissions, ['admin']);
    });

    test('fromJson handles null currentUser', () {
      final json = {
        'currentUser': null,
        'isAuthenticated': false,
        'authReady': false,
      };
      final session = AuthSession.fromJson(json);

      expect(session.currentUser, isNull);
      expect(session.isAuthenticated, isFalse);
      expect(session.authReady, isFalse);
    });
  });

  group('LoginRequest', () {
    test('fromJson creates LoginRequest correctly', () {
      final json = {
        'username': 'testuser',
        'password': 'password123',
      };
      final request = LoginRequest.fromJson(json);

      expect(request.username, 'testuser');
      expect(request.password, 'password123');
    });

    test('toJson serializes correctly', () {
      const request = LoginRequest(
        username: 'user',
        password: 'pass',
      );
      final json = request.toJson();

      expect(json['username'], 'user');
      expect(json['password'], 'pass');
    });
  });

  group('RegisterRequest', () {
    test('fromJson creates RegisterRequest correctly', () {
      final json = {
        'username': 'newuser',
        'password': 'password123',
        'nickname': 'New User',
        'email': 'new@example.com',
        'phone': '13800138000',
      };
      final request = RegisterRequest.fromJson(json);

      expect(request.username, 'newuser');
      expect(request.password, 'password123');
      expect(request.nickname, 'New User');
      expect(request.email, 'new@example.com');
      expect(request.phone, '13800138000');
    });

    test('fromJson handles optional fields as null', () {
      final json = {
        'username': 'newuser',
        'password': 'password123',
        'nickname': 'New User',
      };
      final request = RegisterRequest.fromJson(json);

      expect(request.email, isNull);
      expect(request.phone, isNull);
    });
  });

  group('UserAuthResponse', () {
    test('fromJson creates UserAuthResponse correctly', () {
      final json = {
        'success': true,
        'message': 'Login successful',
        'user': {
          'id': '1',
          'username': 'testuser',
        },
        'token': 'jwt-token-123',
        'accessToken': 'access-token-456',
        'expiresInMs': 3600000,
        'refreshExpiresInMs': 86400000,
        'permissions': ['admin'],
      };
      final response = UserAuthResponse.fromJson(json);

      expect(response.success, isTrue);
      expect(response.message, 'Login successful');
      expect(response.user, isNotNull);
      expect(response.user!.id, '1');
      expect(response.token, 'jwt-token-123');
      expect(response.accessToken, 'access-token-456');
      expect(response.expiresInMs, 3600000);
      expect(response.refreshExpiresInMs, 86400000);
      expect(response.permissions, ['admin']);
    });

    test('fromJson handles failure response', () {
      final json = {
        'success': false,
        'message': 'Invalid credentials',
      };
      final response = UserAuthResponse.fromJson(json);

      expect(response.success, isFalse);
      expect(response.message, 'Invalid credentials');
      expect(response.user, isNull);
      expect(response.token, isNull);
    });
  });

  group('Friendship', () {
    test('fromJson creates Friendship correctly', () {
      final json = {
        'id': 'f1',
        'friendId': 'u2',
        'username': 'friend1',
        'nickname': 'My Friend',
        'avatar': 'https://example.com/avatar2.png',
        'remark': 'Best Friend',
        'isOnline': true,
        'lastActiveTime': '2024-01-01T00:00:00Z',
        'createdAt': '2023-06-01T00:00:00Z',
        'createTime': '2023-06-01T00:00:00Z',
        'signature': 'Life is good',
        'lastSeen': '2024-01-01T00:00:00Z',
      };
      final friendship = Friendship.fromJson(json);

      expect(friendship.id, 'f1');
      expect(friendship.friendId, 'u2');
      expect(friendship.username, 'friend1');
      expect(friendship.nickname, 'My Friend');
      expect(friendship.avatar, 'https://example.com/avatar2.png');
      expect(friendship.remark, 'Best Friend');
      expect(friendship.isOnline, isTrue);
      expect(friendship.lastActiveTime, '2024-01-01T00:00:00Z');
      expect(friendship.createdAt, '2023-06-01T00:00:00Z');
      expect(friendship.signature, 'Life is good');
    });

    test('fromJson handles minimal fields', () {
      final json = {
        'id': 'f1',
        'friendId': 'u2',
        'username': 'friend1',
      };
      final friendship = Friendship.fromJson(json);

      expect(friendship.nickname, isNull);
      expect(friendship.avatar, isNull);
      expect(friendship.isOnline, isNull);
    });
  });

  group('FriendRequest', () {
    test('fromJson creates FriendRequest correctly', () {
      final json = {
        'id': 'fr1',
        'applicantId': 'u1',
        'applicantUsername': 'user1',
        'applicantNickname': 'User One',
        'applicantAvatar': 'https://example.com/a1.png',
        'targetUserId': 'u2',
        'targetUsername': 'user2',
        'targetNickname': 'User Two',
        'targetAvatar': 'https://example.com/a2.png',
        'reason': 'Let us be friends',
        'status': 'pending',
        'createTime': '2024-01-01T00:00:00Z',
        'updateTime': '2024-01-01T00:00:00Z',
      };
      final request = FriendRequest.fromJson(json);

      expect(request.id, 'fr1');
      expect(request.applicantId, 'u1');
      expect(request.applicantUsername, 'user1');
      expect(request.applicantNickname, 'User One');
      expect(request.status, 'pending');
      expect(request.createTime, '2024-01-01T00:00:00Z');
    });

    test('fromJson handles missing optional fields', () {
      final json = {
        'id': 'fr1',
        'applicantId': 'u1',
        'applicantUsername': 'user1',
        'status': 'pending',
        'createTime': '2024-01-01T00:00:00Z',
      };
      final request = FriendRequest.fromJson(json);

      expect(request.applicantNickname, isNull);
      expect(request.reason, isNull);
    });
  });

  group('OnlineStatus', () {
    test('fromJson creates OnlineStatus correctly', () {
      final json = {
        'userId': 'u1',
        'status': 'online',
        'lastSeen': '2024-01-01T00:00:00Z',
      };
      final status = OnlineStatus.fromJson(json);

      expect(status.userId, 'u1');
      expect(status.status, 'online');
      expect(status.lastSeen, '2024-01-01T00:00:00Z');
    });

    test('fromJson handles null lastSeen', () {
      final json = {
        'userId': 'u1',
        'status': 'offline',
      };
      final status = OnlineStatus.fromJson(json);

      expect(status.lastSeen, isNull);
    });

    test('toJson roundtrip preserves data', () {
      const status = OnlineStatus(userId: 'u1', status: 'online', lastSeen: '2024-01-01T00:00:00Z');
      final json = status.toJson();
      final restored = OnlineStatus.fromJson(json);

      expect(restored, equals(status));
    });
  });

  group('User toJson roundtrip', () {
    test('toJson roundtrip preserves all fields', () {
      const user = User(
        id: '1',
        username: 'testuser',
        nickname: 'Test',
        avatar: 'https://example.com/avatar.png',
        email: 'test@example.com',
        permissions: ['admin'],
      );
      final json = user.toJson();
      final restored = User.fromJson(json);

      expect(restored, equals(user));
    });
  });

  group('User copyWith', () {
    test('copyWith updates fields correctly', () {
      const user = User(id: '1', username: 'test', nickname: 'Old');
      final updated = user.copyWith(nickname: 'New', avatar: 'new.png');

      expect(updated.id, '1');
      expect(updated.username, 'test');
      expect(updated.nickname, 'New');
      expect(updated.avatar, 'new.png');
    });
  });

  group('AuthSession toJson', () {
    test('toJson serializes fields correctly', () {
      final session = AuthSession(
        currentUser: const User(id: '1', username: 'test'),
        isAuthenticated: true,
        authReady: true,
        permissions: ['admin'],
      );
      final json = session.toJson();

      expect(json['isAuthenticated'], true);
      expect(json['authReady'], true);
      expect(json['permissions'], ['admin']);
      expect(json['currentUser'], isA<User>());
      expect((json['currentUser'] as User).id, '1');
    });

    test('toJson with null currentUser', () {
      const session = AuthSession(
        currentUser: null,
        isAuthenticated: false,
        authReady: false,
      );
      final json = session.toJson();

      expect(json['currentUser'], isNull);
      expect(json['isAuthenticated'], false);
    });
  });

  group('UserAuthResponse toJson roundtrip', () {
    test('toJson roundtrip preserves data', () {
      const response = UserAuthResponse(
        success: true,
        message: 'OK',
        token: 'tok',
        accessToken: 'acc',
        expiresInMs: 3600,
      );
      final json = response.toJson();
      final restored = UserAuthResponse.fromJson(json);

      expect(restored, equals(response));
    });
  });

  group('Friendship toJson roundtrip', () {
    test('toJson roundtrip preserves data', () {
      const friendship = Friendship(id: 'f1', friendId: 'u2', username: 'friend1');
      final json = friendship.toJson();
      final restored = Friendship.fromJson(json);

      expect(restored, equals(friendship));
    });
  });

  group('FriendRequest toJson roundtrip', () {
    test('toJson roundtrip preserves data', () {
      const request = FriendRequest(
        id: 'fr1',
        applicantId: 'u1',
        applicantUsername: 'user1',
        status: 'pending',
        createTime: '2024-01-01T00:00:00Z',
      );
      final json = request.toJson();
      final restored = FriendRequest.fromJson(json);

      expect(restored, equals(request));
    });
  });
}
