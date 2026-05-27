import type { NetworkStatusPort } from "@im/shared-platform-ports";

export class NotImplementedNetworkAdapter implements NetworkStatusPort {
  onOnline(_callback: () => void): void {
    throw new Error("NetworkStatusPort.onOnline not implemented for desktop");
  }

  onOffline(_callback: () => void): void {
    throw new Error("NetworkStatusPort.onOffline not implemented for desktop");
  }

  isConnected(): boolean {
    throw new Error("NetworkStatusPort.isConnected not implemented for desktop");
  }
}
