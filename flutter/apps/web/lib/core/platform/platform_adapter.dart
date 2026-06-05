import 'platform_adapter_stub.dart'
    if (dart.library.html) 'platform_adapter_web.dart';

/// Platform-specific adapter for browser storage and navigation APIs.
/// Uses conditional imports to work in both VM tests and browser.
abstract class PlatformAdapter {
  String? getLocalStorage(String key);
  void setLocalStorage(String key, String value);
  Future<void> clearLocalStorage();
  String? getBrowserLanguage();
}

PlatformAdapter getPlatformAdapter() => getAdapterInstance();
