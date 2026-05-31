import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:im_core/core.dart';
import '../data/group_api.dart';

class GroupState {
  const GroupState({
    this.groups = const [],
    this.searchResults = const [],
    this.membersByGroupId = const {},
    this.isLoading = false,
    this.error,
  });

  final List<Group> groups;
  final List<Group> searchResults;
  final Map<String, List<GroupMember>> membersByGroupId;
  final bool isLoading;
  final String? error;

  GroupState copyWith({
    List<Group>? groups,
    List<Group>? searchResults,
    Map<String, List<GroupMember>>? membersByGroupId,
    bool? isLoading,
    String? error,
  }) {
    return GroupState(
      groups: groups ?? this.groups,
      searchResults: searchResults ?? this.searchResults,
      membersByGroupId: membersByGroupId ?? this.membersByGroupId,
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
    String? avatar,
    String? description,
    required List<String> memberIds,
  }) async {
    state = state.copyWith(isLoading: true, error: null);
    try {
      final group = await _groupApi.createGroup(
        name: name,
        avatar: avatar,
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

  Future<List<Group>> searchGroups(String keyword) async {
    final query = keyword.trim();
    if (query.isEmpty) {
      state = state.copyWith(searchResults: const [], error: null);
      return const [];
    }

    state = state.copyWith(isLoading: true, error: null);
    try {
      final groups = await _groupApi.searchGroups(query);
      state = state.copyWith(
        searchResults: groups,
        isLoading: false,
        error: null,
      );
      return groups;
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
      rethrow;
    }
  }

  Future<bool> joinGroup(String groupId) async {
    try {
      await _groupApi.joinGroup(groupId);
      state = state.copyWith(error: null);
      return true;
    } catch (e) {
      state = state.copyWith(error: e.toString());
      return false;
    }
  }

  Future<List<GroupMember>> getMembers(String groupId) async {
    try {
      final members = await _groupApi.getMembers(groupId);
      state = state.copyWith(
        membersByGroupId: {
          ...state.membersByGroupId,
          groupId: members,
        },
        error: null,
      );
      return members;
    } catch (e) {
      state = state.copyWith(error: e.toString());
      rethrow;
    }
  }
}
