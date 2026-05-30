// ignore_for_file: deprecated_member_use

import 'dart:html' as html;

import 'platform_adapter.dart';

class WebPlatformAdapter implements PlatformAdapter {
  @override
  String? getLocalStorage(String key) {
    try {
      return html.window.localStorage[key];
    } catch (_) {
      return null;
    }
  }

  @override
  void setLocalStorage(String key, String value) {
    try {
      html.window.localStorage[key] = value;
    } catch (_) {}
  }

  @override
  void clearLocalStorage() {
    try {
      html.window.localStorage.clear();
    } catch (_) {}
  }

  @override
  String? getBrowserLanguage() {
    try {
      return html.window.navigator.language;
    } catch (_) {
      return null;
    }
  }
}

PlatformAdapter getAdapterInstance() => WebPlatformAdapter();
