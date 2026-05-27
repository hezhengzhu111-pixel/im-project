import 'dart:async';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:im_core/core.dart';
import '../data/contacts_api.dart';

class ContactsState {
  const ContactsState({
    this.friends = const [],
    this.friendRequests = const [],
    this.isLoading = false,
  });

  final List<Friendship> friends;
  final List<FriendRequest> friendRequests;
  final bool isLoading;

  ContactsState copyWith({
    List<Friendship>? friends,
    List<FriendRequest>? friendRequests,
    bool? isLoading,
  }) {
    return ContactsState(
      friends: friends ?? this.friends,
      friendRequests: friendRequests ?? this.friendRequests,
      isLoading: isLoading ?? this.isLoading,
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
    } catch (e) {
      print('Failed to handle online status: $e');
    }
  }

  Future<void> loadFriends() async {
    state = state.copyWith(isLoading: true);
    final friends = await _api.getFriends();
    final requests = await _api.getFriendRequests();
    state = ContactsState(friends: friends, friendRequests: requests);
  }

  Future<void> acceptRequest(String requestId) async {
    await _api.acceptFriendRequest(requestId);
    await loadFriends();
  }

  Future<void> rejectRequest(String requestId) async {
    await _api.rejectFriendRequest(requestId);
    await loadFriends();
  }

  @override
  void dispose() {
    _wsSubscription?.cancel();
    super.dispose();
  }
}
