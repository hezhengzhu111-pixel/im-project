import type {
  SecureStoragePort,
  HttpClientPort,
  NotifierPort,
  LifecyclePort,
  NetworkStatusPort,
  ClockPort,
} from "@im/shared-platform-ports";

import { TauriSecureStorageAdapter } from "./storage.adapter";
import { NotImplementedHttpAdapter } from "./http.adapter";
import { NotImplementedNotifierAdapter } from "./notifier.adapter";
import { NotImplementedLifecycleAdapter } from "./lifecycle.adapter";
import { NotImplementedNetworkAdapter } from "./network.adapter";
import { DateClockAdapter } from "./clock.adapter";

export interface PlatformAdapters {
  secureStorage: SecureStoragePort;
  httpClient: HttpClientPort;
  notifier: NotifierPort;
  lifecycle: LifecyclePort;
  networkStatus: NetworkStatusPort;
  clock: ClockPort;
}

let adapters: PlatformAdapters | null = null;

export function registerAdapters(): PlatformAdapters {
  adapters = {
    secureStorage: new TauriSecureStorageAdapter(),
    httpClient: new NotImplementedHttpAdapter(),
    notifier: new NotImplementedNotifierAdapter(),
    lifecycle: new NotImplementedLifecycleAdapter(),
    networkStatus: new NotImplementedNetworkAdapter(),
    clock: new DateClockAdapter(),
  };
  return adapters;
}

export function getAdapters(): PlatformAdapters {
  if (!adapters) {
    throw new Error("Adapters not registered. Call registerAdapters() first.");
  }
  return adapters;
}
