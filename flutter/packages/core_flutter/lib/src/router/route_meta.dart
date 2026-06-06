class RouteMeta {
  const RouteMeta({
    required this.title,
    this.requiresAuth = true,
    this.hideForAuth = false,
    this.permission,
  });

  final String title;
  final bool requiresAuth;
  final bool hideForAuth;
  final String? permission;
}

final defaultRouteMetaMap = <String, RouteMeta>{
  '/login': const RouteMeta(
    title: 'Login',
    requiresAuth: false,
    hideForAuth: true,
  ),
  '/register': const RouteMeta(
    title: 'Register',
    requiresAuth: false,
    hideForAuth: true,
  ),
  '/chat': const RouteMeta(title: 'Chat'),
  '/contacts': const RouteMeta(title: 'Contacts'),
  '/contacts/add': const RouteMeta(title: 'Add Friend'),
  '/groups': const RouteMeta(title: 'Groups'),
  '/groups/create': const RouteMeta(title: 'Create Group'),
  '/moments': const RouteMeta(title: 'Moments'),
  '/moments/notifications': const RouteMeta(title: 'Notifications'),
  '/settings': const RouteMeta(title: 'Settings'),
  '/settings/profile': const RouteMeta(title: 'Profile'),
  '/settings/ai': const RouteMeta(title: 'AI Settings'),
};

RouteMeta? resolveRouteMeta(
  String location, [
  Map<String, RouteMeta>? metaMap,
]) {
  final map = metaMap ?? defaultRouteMetaMap;
  if (map.containsKey(location)) return map[location];
  var bestMatch = '';
  for (final key in map.keys) {
    if (location.startsWith(key) &&
        key.length > bestMatch.length &&
        (key.length == location.length ||
            location[key.length] == '/')) {
      bestMatch = key;
    }
  }
  return bestMatch.isEmpty ? null : map[bestMatch];
}
