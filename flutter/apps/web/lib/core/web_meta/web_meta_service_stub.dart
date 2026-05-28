import 'page_meta.dart';
import 'web_meta_service.dart';

class NoOpWebMetaService implements WebMetaService {
  @override
  void apply(PageMeta meta) {}
}
