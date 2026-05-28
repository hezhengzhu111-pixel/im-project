import 'package:test/test.dart';
import 'package:im_core/core.dart';

void main() {
  group('Group', () {
    test('fromJson creates Group with all fields', () {
      final json = {
        'id': 'g1',
        'name': 'Developers',
        'avatar': 'https://example.com/group.png',
        'description': 'A group for developers',
        'ownerId': 'u1',
        'memberCount': 25,
        'createTime': '2024-01-01T00:00:00Z',
        'updateTime': '2024-01-02T00:00:00Z',
      };
      final group = Group.fromJson(json);

      expect(group.id, 'g1');
      expect(group.name, 'Developers');
      expect(group.avatar, 'https://example.com/group.png');
      expect(group.description, 'A group for developers');
      expect(group.ownerId, 'u1');
      expect(group.memberCount, 25);
      expect(group.createTime, '2024-01-01T00:00:00Z');
      expect(group.updateTime, '2024-01-02T00:00:00Z');
    });

    test('fromJson creates Group with only required fields', () {
      final json = {
        'id': 'g2',
        'name': 'Friends',
      };
      final group = Group.fromJson(json);

      expect(group.id, 'g2');
      expect(group.name, 'Friends');
      expect(group.avatar, isNull);
      expect(group.description, isNull);
      expect(group.ownerId, isNull);
      expect(group.memberCount, isNull);
    });

    test('toJson roundtrip preserves data', () {
      const group = Group(
        id: 'g1',
        name: 'Test',
        description: 'A test group',
      );
      final json = group.toJson();
      final restored = Group.fromJson(json);

      expect(restored, equals(group));
    });

    test('equality works correctly', () {
      const g1 = Group(id: 'g1', name: 'A');
      const g2 = Group(id: 'g1', name: 'A');
      const g3 = Group(id: 'g2', name: 'A');

      expect(g1, equals(g2));
      expect(g1, isNot(equals(g3)));
    });
  });

  group('GroupMember', () {
    test('fromJson creates GroupMember correctly', () {
      final json = {
        'id': 'gm1',
        'userId': 'u1',
        'groupId': 'g1',
        'nickname': 'Admin',
        'role': 'owner',
        'joinTime': '2024-01-01T00:00:00Z',
      };
      final member = GroupMember.fromJson(json);

      expect(member.id, 'gm1');
      expect(member.userId, 'u1');
      expect(member.groupId, 'g1');
      expect(member.nickname, 'Admin');
      expect(member.role, 'owner');
      expect(member.joinTime, '2024-01-01T00:00:00Z');
    });

    test('fromJson handles optional fields', () {
      final json = {
        'id': 'gm2',
        'userId': 'u2',
        'groupId': 'g1',
      };
      final member = GroupMember.fromJson(json);

      expect(member.nickname, isNull);
      expect(member.role, isNull);
      expect(member.joinTime, isNull);
    });

    test('toJson roundtrip preserves data', () {
      const member = GroupMember(
        id: 'gm1',
        userId: 'u1',
        groupId: 'g1',
        role: 'admin',
      );
      final json = member.toJson();
      final restored = GroupMember.fromJson(json);

      expect(restored, equals(member));
    });
  });
}
