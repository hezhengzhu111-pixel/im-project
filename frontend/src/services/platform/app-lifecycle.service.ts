import { Capacitor } from "@capacitor/core";
import { App as CapApp } from "@capacitor/app";

type LifecycleCallback = () => void;

class AppLifecycleService {
  private foregroundCallbacks: Set<LifecycleCallback> = new Set();
  private backgroundCallbacks: Set<LifecycleCallback> = new Set();
  private isListening = false;
  private _isForeground = true;

  get isForeground(): boolean {
    return this._isForeground;
  }

  onForeground(callback: LifecycleCallback): () => void {
    this.foregroundCallbacks.add(callback);
    this.ensureListening();
    return () => this.foregroundCallbacks.delete(callback);
  }

  onBackground(callback: LifecycleCallback): () => void {
    this.backgroundCallbacks.add(callback);
    this.ensureListening();
    return () => this.backgroundCallbacks.delete(callback);
  }

  private ensureListening(): void {
    if (this.isListening) return;
    this.isListening = true;

    if (Capacitor.isNativePlatform()) {
      CapApp.addListener("appStateChange", ({ isActive }) => {
        if (isActive === this._isForeground) return;
        this._isForeground = isActive;
        const callbacks = isActive
          ? this.foregroundCallbacks
          : this.backgroundCallbacks;
        callbacks.forEach((cb) => {
          try {
            cb();
          } catch {
            /* ignore */
          }
        });
      }).catch(() => {
        this.setupBrowserListener();
      });
    } else {
      this.setupBrowserListener();
    }
  }

  private setupBrowserListener(): void {
    document.addEventListener("visibilitychange", this.handleVisibility);
  }

  private handleVisibility = (): void => {
    const isVisible = !document.hidden;
    if (isVisible === this._isForeground) return;
    this._isForeground = isVisible;

    const callbacks = isVisible
      ? this.foregroundCallbacks
      : this.backgroundCallbacks;
    callbacks.forEach((cb) => {
      try {
        cb();
      } catch {
        /* ignore */
      }
    });
  };

  destroy(): void {
    document.removeEventListener("visibilitychange", this.handleVisibility);
    this.foregroundCallbacks.clear();
    this.backgroundCallbacks.clear();
    this.isListening = false;
  }
}

export const appLifecycleService = new AppLifecycleService();
