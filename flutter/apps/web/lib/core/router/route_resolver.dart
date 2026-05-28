import 'route_meta.dart';
import 'route_registry.dart';

/// Derive routeMetaMap from registry for GoRouter redirect logic.
Map<String, RouteMeta> get routeMetaMap => routeRegistry.map(
      (path, entry) => MapEntry(
            path,
            RouteMeta(
              title: entry.titleKey,
              requiresAuth: entry.requiresAuth,
              hideForAuth: entry.hideForAuth,
              permission: entry.permission,
            ),
          ),
    );

/// Resolve [RouteMeta] for a given location by longest-prefix match.
/// Cache the derived map locally to avoid repeated getter invocations.
RouteMeta? resolveRouteMeta(String location) {
  final map = routeMetaMap;
  if (map.containsKey(location)) {
    return map[location];
  }
  String bestMatch = '';
  for (final key in map.keys) {
    if (location.startsWith(key) &&
        key.length > bestMatch.length &&
        (key.length == location.length || location[key.length] == '/')) {
      bestMatch = key;
    }
  }
  return bestMatch.isEmpty ? null : map[bestMatch];
}
