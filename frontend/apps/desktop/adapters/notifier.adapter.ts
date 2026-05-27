import { invoke } from "@tauri-apps/api/core";
import type { NotifierPort } from "@im/shared-platform-ports";

export class TauriNotifierAdapter implements NotifierPort {
  notify(options: { title: string; body?: string; tag?: string; onClick?: () => void }): void {
    void invoke("show_notification", {
      title: options.title,
      body: options.body ?? null,
      tag: options.tag ?? null,
    });
  }
}
