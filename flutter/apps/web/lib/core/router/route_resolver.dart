import 'route_meta.dart';

/// Route metadata lookup table.
///
/// go_router 13.x does not support [GoRoute.extra] as a constructor
/// parameter, so metadata is stored in a flat map keyed by path.
const Map<String, RouteMeta> routeMetaMap = {
  '/login': RouteMeta(title: '登录', requiresAuth: false, hideForAuth: true),
  '/register': RouteMeta(title: '注册', requiresAuth: false, hideForAuth: true),
  '/chat': RouteMeta(title: '聊天'),
  '/contacts': RouteMeta(title: '联系人'),
  '/contacts/add': RouteMeta(title: '添加好友'),
  '/groups': RouteMeta(title: '群组'),
  '/groups/create': RouteMeta(title: '创建群组'),
  '/moments': RouteMeta(title: '朋友圈'),
  '/moments/notifications': RouteMeta(title: '朋友圈通知'),
  '/settings': RouteMeta(title: '设置'),
  '/settings/profile': RouteMeta(title: '个人资料'),
  '/settings/ai': RouteMeta(title: 'AI 助手'),
};

/// Resolve [RouteMeta] for a given location by longest-prefix match.
RouteMeta? resolveRouteMeta(String location) {
  if (routeMetaMap.containsKey(location)) {
    return routeMetaMap[location];
  }
  String bestMatch = '';
  for (final key in routeMetaMap.keys) {
    if (location.startsWith(key) &&
        key.length > bestMatch.length &&
        (key.length == location.length || location[key.length] == '/')) {
      bestMatch = key;
    }
  }
  return bestMatch.isEmpty ? null : routeMetaMap[bestMatch];
}
