import type {
  SecureStoragePort,
  HttpClientPort,
  NotifierPort,
  LifecyclePort,
  NetworkStatusPort,
  ClockPort,
} from "@im/shared-platform-ports";

import { TauriSecureStorageAdapter } from "./storage.adapter";
import { TauriHttpClientAdapter } from "./http.adapter";
import { TauriNotifierAdapter } from "./notifier.adapter";
import { TauriLifecycleAdapter } from "./lifecycle.adapter";
import { TauriNetworkStatusAdapter } from "./network.adapter";
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
    httpClient: new TauriHttpClientAdapter(),
    notifier: new TauriNotifierAdapter(),
    lifecycle: new TauriLifecycleAdapter(),
    networkStatus: new TauriNetworkStatusAdapter(),
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
