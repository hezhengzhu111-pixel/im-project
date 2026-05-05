import { Capacitor } from "@capacitor/core";

export function isNativeRuntime(): boolean {
  return Capacitor.isNativePlatform();
}

export function getPlatform(): string {
  return Capacitor.getPlatform();
}
