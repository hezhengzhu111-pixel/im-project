import { listen } from "@tauri-apps/api/event";
import type { NetworkStatusPort } from "@im/shared-platform-ports";

let connected = true;

interface NetworkEvent {
  isConnected: boolean;
}

export class TauriNetworkStatusAdapter implements NetworkStatusPort {
  onOnline(callback: () => void): void {
    void listen<NetworkEvent>("network-status-changed", (event) => {
      if (event.payload.isConnected && !connected) {
        connected = true;
        callback();
      }
    });
  }

  onOffline(callback: () => void): void {
    void listen<NetworkEvent>("network-status-changed", (event) => {
      if (!event.payload.isConnected && connected) {
        connected = false;
        callback();
      }
    });
  }

  isConnected(): boolean {
    return connected;
  }
}
