import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:im_core_flutter/im_core_flutter.dart';
import 'push_api.dart';

final pushApiProvider = Provider<PushApi>((ref) {
  return PushApi(ref.watch(httpClientProvider));
});
