import { Capacitor } from "@capacitor/core";
import { Network } from "@capacitor/network";

type NetworkCallback = () => void;

class NetworkStatusService {
  private onlineCallbacks: Set<NetworkCallback> = new Set();
  private offlineCallbacks: Set<NetworkCallback> = new Set();
  private isListening = false;

  get isOnline(): boolean {
    if (typeof navigator === "undefined") return true;
    return navigator.onLine;
  }

  onOnline(callback: NetworkCallback): () => void {
    this.onlineCallbacks.add(callback);
    this.ensureListening();
    return () => this.onlineCallbacks.delete(callback);
  }

  onOffline(callback: NetworkCallback): () => void {
    this.offlineCallbacks.add(callback);
    this.ensureListening();
    return () => this.offlineCallbacks.delete(callback);
  }

  private ensureListening(): void {
    if (this.isListening) return;
    this.isListening = true;

    if (Capacitor.isNativePlatform()) {
      Network.addListener("networkStatusChange", (status) => {
        if (status.connected) {
          this.onlineCallbacks.forEach((cb) => {
            try {
              cb();
            } catch {
              /* ignore */
            }
          });
        } else {
          this.offlineCallbacks.forEach((cb) => {
            try {
              cb();
            } catch {
              /* ignore */
            }
          });
        }
      }).catch(() => {
        this.setupBrowserListener();
      });
    } else {
      this.setupBrowserListener();
    }
  }

  private setupBrowserListener(): void {
    window.addEventListener("online", this.handleOnline);
    window.addEventListener("offline", this.handleOffline);
  }

  private handleOnline = (): void => {
    this.onlineCallbacks.forEach((cb) => {
      try {
        cb();
      } catch {
        /* ignore */
      }
    });
  };

  private handleOffline = (): void => {
    this.offlineCallbacks.forEach((cb) => {
      try {
        cb();
      } catch {
        /* ignore */
      }
    });
  };

  destroy(): void {
    window.removeEventListener("online", this.handleOnline);
    window.removeEventListener("offline", this.handleOffline);
    this.onlineCallbacks.clear();
    this.offlineCallbacks.clear();
    this.isListening = false;
  }
}

export const networkStatusService = new NetworkStatusService();
