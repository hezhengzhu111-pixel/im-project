import { Capacitor } from "@capacitor/core";

export interface StorageService {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
  clear(): Promise<void>;
}

class WebStorageService implements StorageService {
  async get(key: string): Promise<string | null> {
    return localStorage.getItem(key);
  }

  async set(key: string, value: string): Promise<void> {
    localStorage.setItem(key, value);
  }

  async remove(key: string): Promise<void> {
    localStorage.removeItem(key);
  }

  async clear(): Promise<void> {
    localStorage.clear();
  }
}

function createStorageService(): StorageService {
  if (Capacitor.isNativePlatform()) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { NativeStorageService } = require("./native-storage.service");
    return new NativeStorageService();
  }
  return new WebStorageService();
}

export const storageService: StorageService = createStorageService();
