import { onUnmounted, ref } from "vue";
import { appLifecycleService } from "@/services/platform/app-lifecycle.service";

export function useAppLifecycle() {
  const isForeground = ref(appLifecycleService.isForeground);
  const cleanups: Array<() => void> = [];

  cleanups.push(
    appLifecycleService.onForeground(() => {
      isForeground.value = true;
    }),
    appLifecycleService.onBackground(() => {
      isForeground.value = false;
    }),
  );

  const onForeground = (callback: () => void) => {
    cleanups.push(appLifecycleService.onForeground(callback));
  };

  const onBackground = (callback: () => void) => {
    cleanups.push(appLifecycleService.onBackground(callback));
  };

  onUnmounted(() => {
    cleanups.forEach((fn) => fn());
    cleanups.length = 0;
  });

  return { isForeground, onForeground, onBackground };
}
