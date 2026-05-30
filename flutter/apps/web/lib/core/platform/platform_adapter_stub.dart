import 'platform_adapter.dart';

class StubPlatformAdapter implements PlatformAdapter {
  @override
  String? getLocalStorage(String key) => null;

  @override
  void setLocalStorage(String key, String value) {}

  @override
  void clearLocalStorage() {}

  @override
  String? getBrowserLanguage() => null;
}

PlatformAdapter getAdapterInstance() => StubPlatformAdapter();
