import 'dart:async';
import 'dart:html' as html;
import 'network_status_provider.dart';

/// Initialize the NetworkStatusDataSource with real browser APIs.
/// Call this once from the web entrypoint (main.dart).
void initWebNetworkStatus() {
  WebNetworkStatusDataSource.initialize(
    isOnlineCheck: () => html.window.navigator.onLine ?? true,
    onOnlineStream: () => html.window.onOnline,
    onOfflineStream: () => html.window.onOffline,
    serverCheck: (url) async {
      try {
        final request = html.HttpRequest();
        request.open('GET', url, async: true);
        request.timeout = 5000;

        final completer = Completer<bool>();

        request.onLoad.listen((_) {
          completer.complete(
            request.status != null && request.status! >= 200 && request.status! < 400,
          );
        });
        request.onError.listen((_) => completer.complete(false));
        request.onTimeout.listen((_) => completer.complete(false));

        request.send();
        return completer.future;
      } catch (_) {
        return false;
      }
    },
  );
}
