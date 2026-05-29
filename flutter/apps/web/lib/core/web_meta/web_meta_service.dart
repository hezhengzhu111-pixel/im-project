import 'package:flutter/foundation.dart';
import 'package:im_web/core/web_meta/web_meta_service_web.dart';
import 'page_meta.dart';

abstract class WebMetaService {
  void apply(PageMeta meta, {String? locale});
}

/// Non-web fallback (no-op).
class NoOpWebMetaService implements WebMetaService {
  @override
  void apply(PageMeta meta, {String? locale}) {}
}

WebMetaService createWebMetaService() {
  if (kIsWeb) {
    return WebMetaServiceImpl();
  }
  return NoOpWebMetaService();
}
