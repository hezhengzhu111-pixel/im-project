// ignore_for_file: invalid_annotation_target

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

String? _roleFromJson(dynamic value) => value?.toString();

@freezed
class GroupMember with _$GroupMember {
  const factory GroupMember({
    required String id,
    required String userId,
    required String groupId,
    String? nickname,
    @JsonKey(fromJson: _roleFromJson) String? role,
    String? joinTime,
  }) = _GroupMember;

  factory GroupMember.fromJson(Map<String, dynamic> json) =>
      _$GroupMemberFromJson(json);
}
