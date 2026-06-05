// ignore_for_file: deprecated_member_use

import 'dart:html' as html;
import 'package:idb_shim/idb_browser.dart' as idb;

import 'platform_adapter.dart';
import '../../../features/e2ee/data/e2ee_indexed_db.dart';

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
  Future<void> clearLocalStorage() async {
    try {
      // 清除设置相关的 localStorage key，保留登录 token 等关键数据
      const keysToRemove = [
        'app_language',
        'app_theme_mode',
      ];
      for (final key in keysToRemove) {
        html.window.localStorage.remove(key);
      }
    } catch (_) {}

    // 清除 IndexedDB 中的 E2EE 会话缓存（保留 identity 和 meta）
    try {
      final db = await idb.idbFactoryBrowser.open(
        e2eeDbName,
        version: e2eeDbVersion,
      );
      final txn = db.transactionList(
        ['sessions', 'sender_keys'],
        idb.idbModeReadWrite,
      );
      await txn.objectStore('sessions').clear();
      await txn.objectStore('sender_keys').clear();
      await txn.completed;
      db.close();
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
