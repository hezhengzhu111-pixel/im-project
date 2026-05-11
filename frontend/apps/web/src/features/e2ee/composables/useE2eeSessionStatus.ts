import { ref, watch, onUnmounted, type Ref } from "vue";
import { getLocalSessionStatus } from "../manager/negotiation";
import { onE2eeStatusChange } from "../status-events";
import type { E2eeSessionStatus } from "../types";

/**
 * 响应式获取 E2EE 会话状态。
 *
 * 通过事件驱动更新，不轮询。当 setLocalSessionStatus 被调用时自动同步。
 */
export function useE2eeSessionStatus(
  sessionId: Ref<string | undefined> | string | Ref<string>,
): Ref<E2eeSessionStatus> {
  const resolved =
    typeof sessionId === "string" ? sessionId : (sessionId.value ?? "");
  const status = ref<E2eeSessionStatus>(
    resolved ? getLocalSessionStatus(resolved) : "plaintext",
  ) as Ref<E2eeSessionStatus>;

  const off = onE2eeStatusChange((changedId, newStatus) => {
    const currentId =
      typeof sessionId === "string" ? sessionId : sessionId.value;
    if (changedId === currentId) {
      status.value = newStatus;
    }
  });

  if (typeof sessionId !== "string") {
    const stop = watch(sessionId, (newId) => {
      if (newId) status.value = getLocalSessionStatus(newId);
    });
    onUnmounted(() => {
      stop();
      off();
    });
  } else {
    onUnmounted(off);
  }

  return status;
}
