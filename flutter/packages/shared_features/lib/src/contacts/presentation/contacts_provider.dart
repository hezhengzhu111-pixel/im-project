import 'dart:async';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:im_core/core.dart';
import 'package:im_core_flutter/im_core_flutter.dart';
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
      } else if (event.type == WsMessageType.message ||
          event.type == WsMessageType.system) {
        _handleContactRefreshMessage(event.data);
      }
    });
  }

  void _handleOnlineStatus(Map<String, dynamic> data) {
    try {
      final userIds = (data['userIds'] as List<dynamic>?)
              ?.map((e) => e.toString())
              .toList() ??
          [
            if (data['userId'] != null) data['userId'].toString(),
          ];
      final online = data['online'] as bool? ??
          data['isOnline'] as bool? ??
          (data['status']?.toString().toUpperCase() == 'ONLINE');

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

  void _handleContactRefreshMessage(Map<String, dynamic> data) {
    final messageType = data['messageType']?.toString().toUpperCase() ??
        data['type']?.toString().toUpperCase() ??
        '';
    if (messageType != WsMessageType.system) return;

    final content = data['content']?.toString() ?? '';
    if (_isFriendRefreshContent(content)) {
      loadFriends();
    }
  }

  bool _isFriendRefreshContent(String content) {
    final lower = content.toLowerCase();
    return content.contains('好友申请') ||
        content.contains('同意') ||
        lower.contains('friend request') ||
        lower.contains('friend accepted') ||
        content.contains('REFRESH_FRIEND_REQUESTS') ||
        content.contains('REFRESH_FRIEND_LIST');
  }

  Future<void> loadFriends() async {
    state = state.copyWith(isLoading: true, error: null);
    try {
      final friends = await _api.getFriends();
      final onlineStatus = await _loadOnlineStatus(friends);
      final requests = await _api.getFriendRequests();
      state = state.copyWith(
        friends: _mergeOnlineStatus(friends, onlineStatus),
        friendRequests: requests,
        isLoading: false,
        error: null,
      );
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
    }
  }

  Future<Map<String, bool>> _loadOnlineStatus(List<Friendship> friends) async {
    final ids = friends
        .map((friend) => friend.friendId)
        .where((id) => id.trim().isNotEmpty)
        .toSet()
        .toList();
    if (ids.isEmpty) return const {};
    try {
      return await _api.getOnlineStatus(ids);
    } catch (e, st) {
      AppLogger.instance.error('Failed to load friend online status', e, st);
      return const {};
    }
  }

  List<Friendship> _mergeOnlineStatus(
    List<Friendship> friends,
    Map<String, bool> onlineStatus,
  ) {
    if (onlineStatus.isEmpty) return friends;
    return friends
        .map((friend) => friend.copyWith(
              isOnline: onlineStatus[friend.friendId] ?? friend.isOnline,
            ))
        .toList();
  }

  Future<bool> acceptRequest(String requestId) async {
    try {
      await _api.acceptFriendRequest(requestId);
      await loadFriends();
      return true;
    } catch (e) {
      state = state.copyWith(error: e.toString());
      return false;
    }
  }

  Future<bool> rejectRequest(String requestId) async {
    try {
      await _api.rejectFriendRequest(requestId);
      await loadFriends();
      return true;
    } catch (e) {
      state = state.copyWith(error: e.toString());
      return false;
    }
  }

  Future<List<User>> searchUsers(String keyword,
      {String type = 'username'}) async {
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
    markRequestSent(targetUserId);
    await _refreshFriendRequests();
  }

  void markRequestSent(String userId) {
    state = state.copyWith(
      sentRequestUserIds: {...state.sentRequestUserIds, userId},
    );
  }

  void clearSearchResults() {
    state = state.copyWith(userSearchResults: const [], error: null);
  }

  Future<void> _refreshFriendRequests() async {
    try {
      final requests = await _api.getFriendRequests();
      state = state.copyWith(friendRequests: requests, error: null);
    } catch (e, st) {
      AppLogger.instance.error('Failed to refresh friend requests', e, st);
    }
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
