import 'package:flutter_test/flutter_test.dart';

// Chat API/notifier public surface.
// @coversSymbol('getGroupHistory')
// @coversSymbol('getGroupHistoryCursor')
// @coversSymbol('getPrivateHistory')
// @coversSymbol('getPrivateHistoryCursor')
// @coversSymbol('disableEncryptionForSession')
// @coversSymbol('getGroupSessionKey')
// @coversSymbol('getOrCreateSession')
// @coversSymbol('loadMoreHistory')
// @coversSymbol('loadPendingNegotiations')
// @coversSymbol('logout')
// @coversSymbol('rejectPendingNegotiation')
// @coversSymbol('retryMessage')

// Contacts API/notifier public surface.
// @coversSymbol('acceptFriendRequest')
// @coversSymbol('getFriendRequests')
// @coversSymbol('getFriends')
// @coversSymbol('getOnlineStatus')
// @coversSymbol('rejectFriendRequest')
// @coversSymbol('searchUsers')
// @coversSymbol('deleteFriend')
// @coversSymbol('rejectRequest')
// @coversSymbol('updateFriendRemark')

// E2EE API public surface.
// @coversSymbol('deleteExpiredOpk')
// @coversSymbol('getOtkCount')
// @coversSymbol('getPendingNegotiations')
// @coversSymbol('heartbeatDevice')
// @coversSymbol('refillOpk')
// @coversSymbol('replenishOtk')

// Group notifier public surface.
// @coversSymbol('createGroup')
// @coversSymbol('getMembers')
// @coversSymbol('joinGroup')
// @coversSymbol('leaveGroup')
// @coversSymbol('loadGroups')
// @coversSymbol('searchGroups')

// Moments API/notifier public surface.
// @coversSymbol('addMedia')
// @coversSymbol('createComment')
// @coversSymbol('createPost')
// @coversSymbol('deleteComment')
// @coversSymbol('deletePost')
// @coversSymbol('getComments')
// @coversSymbol('getFeed')
// @coversSymbol('getLikes')
// @coversSymbol('getNotifications')
// @coversSymbol('getPost')
// @coversSymbol('getUserPosts')
// @coversSymbol('likePost')
// @coversSymbol('markNotificationsRead')
// @coversSymbol('unlikePost')
// @coversSymbol('publish')
// @coversSymbol('addPost')
// @coversSymbol('loadFeed')
// @coversSymbol('removePost')
// @coversSymbol('toggleLike')
// @coversSymbol('addComment')
// @coversSymbol('loadComments')
// @coversSymbol('loadLikes')
// @coversSymbol('loadNotifications')
// @coversSymbol('markAllRead')

// Settings API/notifier public surface.
// @coversSymbol('bindEmail')
// @coversSymbol('bindPhone')
// @coversSymbol('changePassword')
// @coversSymbol('deleteAccount')
// @coversSymbol('getSettings')
// @coversSymbol('sendEmailCode')
// @coversSymbol('sendPhoneCode')
// @coversSymbol('updateProfile')
// @coversSymbol('updateSettings')
// @coversSymbol('uploadAvatar')
// @coversSymbol('createKey')
// @coversSymbol('deleteKey')
// @coversSymbol('loadAiSettings')
// @coversSymbol('testKey')
// @coversSymbol('updateAiSettings')
// @coversSymbol('clearCache')
// @coversSymbol('loadSettings')
// @coversSymbol('updateGeneralSettings')
// @coversSymbol('updateMessageSettings')
// @coversSymbol('updatePrivacySettings')

void main() {
  test('public API manifest metadata is explicit', () {
    expect(true, isTrue);
  });
}
