import 'platform_adapter.dart';

class StubPlatformAdapter implements PlatformAdapter {
  @override
  String? getLocalStorage(String key) => null;

  @override
  void setLocalStorage(String key, String value) {}

  @override
  Future<void> clearLocalStorage() async {}

  @override
  String? getBrowserLanguage() => null;
}

PlatformAdapter getAdapterInstance() => StubPlatformAdapter();
