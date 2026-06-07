import 'package:im_core/core.dart';

abstract interface class RustGateway extends E2eeBridge {
  Future<void> init();
}
