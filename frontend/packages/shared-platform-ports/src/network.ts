export interface NetworkStatusPort {
  onOnline(callback: () => void): void;
  onOffline(callback: () => void): void;
  isConnected(): boolean;
}
