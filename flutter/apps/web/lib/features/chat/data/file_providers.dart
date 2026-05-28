import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/di/third_party_providers.dart';
import '../../../core/network/network_providers.dart';
import 'file_api.dart';

final fileApiProvider = Provider<FileApi>((ref) {
  return FileApi(ref.watch(httpClientProvider), ref.watch(analyticsProvider));
});
