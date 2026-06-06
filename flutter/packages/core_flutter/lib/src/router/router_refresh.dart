import 'package:flutter/foundation.dart';

class RouterRefreshListenable extends ChangeNotifier {
  void refresh() => notifyListeners();
}
