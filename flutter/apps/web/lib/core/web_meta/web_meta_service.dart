import 'package:flutter/foundation.dart';
import 'page_meta.dart';

import 'web_meta_service_stub.dart'
    if (dart.library.js_interop) 'web_meta_service_web.dart';

abstract class WebMetaService {
  void apply(PageMeta meta);
}

WebMetaService createWebMetaService() {
  if (kIsWeb) {
    return WebMetaServiceImpl();
  }
  return NoOpWebMetaService();
}
