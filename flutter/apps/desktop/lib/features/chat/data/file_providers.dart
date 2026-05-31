import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/di/platform_providers.dart';
import 'file_api.dart';

final fileApiProvider = Provider<FileApi>((ref) {
  return FileApi(ref.watch(httpClientProvider), ref.watch(analyticsProvider));
});
