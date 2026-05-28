import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:im_web/core/router/app_router.dart';
import 'web_meta_service.dart';
import 'web_meta_defaults.dart';

final webMetaServiceProvider = Provider<WebMetaService>((ref) {
  return createWebMetaService();
});

void setupWebMetaListener(WidgetRef ref) {
  final service = ref.read(webMetaServiceProvider);

  // Apply default meta on startup
  service.apply(appFallbackMeta);

  // Listen to route changes
  ref.listen<GoRouter>(routerProvider, (prev, next) {
    final path = next.routeInformationProvider.value.uri.path;
    final meta = metaForPath(path);
    service.apply(meta);
  });
}
