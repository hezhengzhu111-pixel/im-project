import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:im_core/core.dart';
import '../data/group_api.dart';

class GroupState {
  static const _sentinel = Object();

  const GroupState({
    this.groups = const [],
    this.searchResults = const [],
    this.membersByGroupId = const {},
    this.selectedGroupId,
    this.isLoading = false,
    this.error,
  });

  final List<Group> groups;
  final List<Group> searchResults;
  final Map<String, List<GroupMember>> membersByGroupId;
  final String? selectedGroupId;
  final bool isLoading;
  final String? error;

  Group? get selectedGroup {
    final id = selectedGroupId;
    if (id == null) return null;
    return groups.where((g) => g.id == id).firstOrNull;
  }

  GroupState copyWith({
    List<Group>? groups,
    List<Group>? searchResults,
    Map<String, List<GroupMember>>? membersByGroupId,
    Object? selectedGroupId = _sentinel,
    bool? isLoading,
    Object? error = _sentinel,
  }) {
    return GroupState(
      groups: groups ?? this.groups,
      searchResults: searchResults ?? this.searchResults,
      membersByGroupId: membersByGroupId ?? this.membersByGroupId,
      selectedGroupId: identical(selectedGroupId, _sentinel)
          ? this.selectedGroupId
          : selectedGroupId as String?,
      isLoading: isLoading ?? this.isLoading,
      error: identical(error, _sentinel) ? this.error : error as String?,
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
        membersByGroupId: {...state.membersByGroupId}..remove(groupId),
      );
      return true;
    } catch (e) {
      state = state.copyWith(error: e.toString());
      return false;
    }
  }

  Future<bool> dismissGroup(String groupId) async {
    try {
      await _groupApi.dismissGroup(groupId);
      state = state.copyWith(
        groups: state.groups.where((g) => g.id != groupId).toList(),
        membersByGroupId: {...state.membersByGroupId}..remove(groupId),
      );
      return true;
    } catch (e) {
      state = state.copyWith(error: e.toString());
      return false;
    }
  }

  Future<bool> inviteMembers(String groupId, List<String> memberIds) async {
    try {
      await _groupApi.addMembers(groupId, memberIds);
      await getMembers(groupId);
      state = state.copyWith(error: null);
      return true;
    } catch (e) {
      state = state.copyWith(error: e.toString());
      return false;
    }
  }

  Future<bool> removeMembers(String groupId, List<String> memberIds) async {
    try {
      await _groupApi.removeMembers(groupId, memberIds);
      final currentMembers = state.membersByGroupId[groupId] ?? [];
      state = state.copyWith(
        membersByGroupId: {
          ...state.membersByGroupId,
          groupId: currentMembers
              .where((m) => !memberIds.contains(m.userId))
              .toList(),
        },
        error: null,
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

  void selectGroup(String groupId) {
    state = state.copyWith(selectedGroupId: groupId);
  }

  void clearSelectedGroup() {
    state = state.copyWith(selectedGroupId: null);
  }

  void clearError() {
    state = state.copyWith(error: null);
  }

  Future<bool> joinGroup(String groupId, {String? userId}) async {
    try {
      await _groupApi.joinGroup(groupId);
      if (userId != null && userId.isNotEmpty) {
        await loadGroups(userId);
      }
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
