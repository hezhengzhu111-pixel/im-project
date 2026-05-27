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
  ContactsNotifier(this._api, [this._wsClient])
      : super(const ContactsState());

  final ContactsApi _api;
  final WsClientPort? _wsClient;

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
}
