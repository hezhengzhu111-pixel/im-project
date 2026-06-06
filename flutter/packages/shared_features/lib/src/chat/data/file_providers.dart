import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:im_core_flutter/im_core_flutter.dart';
import 'file_api.dart';

final fileApiProvider = Provider<FileApi>((ref) {
  return FileApi(ref.watch(httpClientProvider), ref.watch(analyticsProvider));
});
