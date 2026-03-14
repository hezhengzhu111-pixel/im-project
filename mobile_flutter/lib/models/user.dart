class UserProfile {
  UserProfile({
    required this.id,
    required this.username,
    this.nickname,
    this.avatar,
  });

  final String id;
  final String username;
  final String? nickname;
  final String? avatar;

  factory UserProfile.fromJson(Map<String, dynamic> json) {
    return UserProfile(
      id: '${json['id'] ?? ''}',
      username: '${json['username'] ?? ''}',
      nickname: json['nickname']?.toString(),
      avatar: json['avatar']?.toString(),
    );
  }
}
