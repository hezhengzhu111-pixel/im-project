import 'dart:async';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:im_core/core.dart';
import '../../../core/logging/app_logger.dart';
import '../data/contacts_api.dart';

class ContactsState {
  const ContactsState({
    this.friends = const [],
    this.friendRequests = const [],
    this.userSearchResults = const [],
    this.sentRequestUserIds = const {},
    this.isLoading = false,
    this.error,
  });

  final List<Friendship> friends;
  final List<FriendRequest> friendRequests;
  final List<User> userSearchResults;
  final Set<String> sentRequestUserIds;
  final bool isLoading;
  final String? error;

  ContactsState copyWith({
    List<Friendship>? friends,
    List<FriendRequest>? friendRequests,
    List<User>? userSearchResults,
    Set<String>? sentRequestUserIds,
    bool? isLoading,
    String? error,
  }) {
    return ContactsState(
      friends: friends ?? this.friends,
      friendRequests: friendRequests ?? this.friendRequests,
      userSearchResults: userSearchResults ?? this.userSearchResults,
      sentRequestUserIds: sentRequestUserIds ?? this.sentRequestUserIds,
      isLoading: isLoading ?? this.isLoading,
      error: error,
    );
  }
}

class ContactsNotifier extends StateNotifier<ContactsState> {
  ContactsNotifier(this._api, this._wsClient) : super(const ContactsState()) {
    _subscribeToWs();
  }

  final ContactsApi _api;
  final WsClientPort _wsClient;
  StreamSubscription? _wsSubscription;

  void _subscribeToWs() {
    _wsSubscription = _wsClient.events.listen((event) {
      if (event.type == WsMessageType.onlineStatus) {
        _handleOnlineStatus(event.data);
      } else if (event.type == WsMessageType.friendRequest ||
          event.type == WsMessageType.friendAccepted) {
        loadFriends();
      }
    });
  }

  void _handleOnlineStatus(Map<String, dynamic> data) {
    try {
      final userIds = (data['userIds'] as List<dynamic>?)
              ?.map((e) => e.toString())
              .toList() ??
          [];
      final online = data['online'] as bool? ?? false;

      if (userIds.isEmpty) return;

      final updatedFriends = state.friends.map((f) {
        if (userIds.contains(f.friendId)) {
          return f.copyWith(isOnline: online);
        }
        return f;
      }).toList();

      state = state.copyWith(friends: updatedFriends);
    } catch (e, st) {
      AppLogger.instance.error('Failed to handle online status', e, st);
    }
  }

  Future<void> loadFriends() async {
    state = state.copyWith(isLoading: true, error: null);
    try {
      final friends = await _api.getFriends();
      final requests = await _api.getFriendRequests();
      state = state.copyWith(
        friends: friends,
        friendRequests: requests,
        isLoading: false,
        error: null,
      );
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
    }
  }

  Future<void> acceptRequest(String requestId) async {
    await _api.acceptFriendRequest(requestId);
    await loadFriends();
  }

  Future<void> rejectRequest(String requestId) async {
    await _api.rejectFriendRequest(requestId);
    await loadFriends();
  }

  Future<List<User>> searchUsers(String keyword, {String type = 'username'}) async {
    final query = keyword.trim();
    if (query.isEmpty) {
      state = state.copyWith(userSearchResults: const [], error: null);
      return const [];
    }

    state = state.copyWith(isLoading: true, error: null);
    try {
      final results = await _api.searchUsers(query, type: type);
      state = state.copyWith(
        userSearchResults: results,
        isLoading: false,
        error: null,
      );
      return results;
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
      rethrow;
    }
  }

  Future<void> sendFriendRequest(String targetUserId, {String? reason}) async {
    await _api.sendFriendRequest(
      targetUserId,
      reason: reason?.trim().isEmpty == true ? null : reason?.trim(),
    );
  }

  void markRequestSent(String userId) {
    state = state.copyWith(
      sentRequestUserIds: {...state.sentRequestUserIds, userId},
    );
  }

  void clearSearchResults() {
    state = state.copyWith(userSearchResults: const [], error: null);
  }

  Future<bool> deleteFriend(String friendId) async {
    try {
      await _api.deleteFriend(friendId);
      state = state.copyWith(
        friends: state.friends.where((f) => f.friendId != friendId).toList(),
        error: null,
      );
      return true;
    } catch (e) {
      state = state.copyWith(error: e.toString());
      return false;
    }
  }

  Future<bool> updateFriendRemark(String friendId, String remark) async {
    try {
      await _api.updateFriendRemark(friendId, remark);
      state = state.copyWith(
        friends: state.friends.map((friend) {
          if (friend.friendId != friendId) return friend;
          return friend.copyWith(remark: remark);
        }).toList(),
        error: null,
      );
      return true;
    } catch (e) {
      state = state.copyWith(error: e.toString());
      return false;
    }
  }

  @override
  void dispose() {
    _wsSubscription?.cancel();
    super.dispose();
  }
}
