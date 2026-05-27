import { listen } from "@tauri-apps/api/event";
import type { LifecyclePort } from "@im/shared-platform-ports";

export class TauriLifecycleAdapter implements LifecyclePort {
  onForeground(callback: () => void): void {
    void listen("tauri://resume", () => callback());
  }

  onBackground(callback: () => void): void {
    void listen("tauri://close-requested", () => callback());
  }
}
