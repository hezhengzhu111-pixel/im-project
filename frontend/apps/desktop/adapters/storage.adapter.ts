import type { SecureStoragePort } from "@im/shared-platform-ports";
import { invoke } from "@tauri-apps/api/core";

export class TauriSecureStorageAdapter implements SecureStoragePort {
  async getItem(key: string): Promise<string | null> {
    return invoke<string | null>("secure_store_get", { key });
  }

  async setItem(key: string, value: string): Promise<void> {
    await invoke("secure_store_set", { key, value });
  }

  async removeItem(key: string): Promise<void> {
    await invoke("secure_store_remove", { key });
  }
}
