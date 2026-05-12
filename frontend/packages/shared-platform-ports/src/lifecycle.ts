export interface LifecyclePort {
  onForeground(callback: () => void): void;
  onBackground(callback: () => void): void;
}
