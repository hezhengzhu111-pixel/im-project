import 'package:im_web/core/web_meta/web_meta_service.dart';
import 'package:im_web/core/web_meta/page_meta.dart';

class MockWebMetaService implements WebMetaService {
  final List<PageMeta> appliedMetas = [];

  @override
  void apply(PageMeta meta) {
    appliedMetas.add(meta);
  }

  void clear() => appliedMetas.clear();

  PageMeta? get lastApplied =>
      appliedMetas.isNotEmpty ? appliedMetas.last : null;
}
