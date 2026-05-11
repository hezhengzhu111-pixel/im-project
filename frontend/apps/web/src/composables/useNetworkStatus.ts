import { onUnmounted, ref } from "vue";
import { networkStatusService } from "@/services/platform/network-status.service";

export function useNetworkStatus() {
  const isOnline = ref(networkStatusService.isOnline);
  const cleanups: Array<() => void> = [];

  cleanups.push(
    networkStatusService.onOnline(() => {
      isOnline.value = true;
    }),
    networkStatusService.onOffline(() => {
      isOnline.value = false;
    }),
  );

  const onOnline = (callback: () => void) => {
    cleanups.push(networkStatusService.onOnline(callback));
  };

  const onOffline = (callback: () => void) => {
    cleanups.push(networkStatusService.onOffline(callback));
  };

  onUnmounted(() => {
    cleanups.forEach((fn) => fn());
    cleanups.length = 0;
  });

  return { isOnline, onOnline, onOffline };
}
