import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:im_core/core.dart';
import '../data/group_api.dart';

class GroupState {
  const GroupState({
    this.groups = const [],
    this.isLoading = false,
    this.error,
  });

  final List<Group> groups;
  final bool isLoading;
  final String? error;

  GroupState copyWith({
    List<Group>? groups,
    bool? isLoading,
    String? error,
  }) {
    return GroupState(
      groups: groups ?? this.groups,
      isLoading: isLoading ?? this.isLoading,
      error: error,
    );
  }
}

class GroupNotifier extends StateNotifier<GroupState> {
  GroupNotifier(this._groupApi) : super(const GroupState());

  final GroupApi _groupApi;

  Future<void> loadGroups(String userId) async {
    state = state.copyWith(isLoading: true, error: null);
    try {
      final groups = await _groupApi.getUserGroups(userId);
      state = state.copyWith(groups: groups, isLoading: false);
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
    }
  }

  Future<Group?> createGroup({
    required String name,
    String? description,
    required List<String> memberIds,
  }) async {
    state = state.copyWith(isLoading: true, error: null);
    try {
      final group = await _groupApi.createGroup(
        name: name,
        description: description,
        memberIds: memberIds,
      );
      state = state.copyWith(
        groups: [...state.groups, group],
        isLoading: false,
      );
      return group;
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
      return null;
    }
  }

  Future<bool> leaveGroup(String groupId) async {
    try {
      await _groupApi.leaveGroup(groupId);
      state = state.copyWith(
        groups: state.groups.where((g) => g.id != groupId).toList(),
      );
      return true;
    } catch (e) {
      state = state.copyWith(error: e.toString());
      return false;
    }
  }

  Future<List<GroupMember>> getMembers(String groupId) async {
    return _groupApi.getMembers(groupId);
  }
}
