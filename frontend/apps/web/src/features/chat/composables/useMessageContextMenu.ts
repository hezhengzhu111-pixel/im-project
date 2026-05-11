import { ref } from "vue";
import type { Message } from "@/types";

export function useMessageContextMenu() {
  const visible = ref(false);
  const x = ref(0);
  const y = ref(0);
  const targetMessage = ref<Message | null>(null);

  const open = (message: Message, event: MouseEvent) => {
    targetMessage.value = message;
    x.value = event.clientX;
    y.value = event.clientY;
    visible.value = true;
  };

  const close = () => {
    visible.value = false;
  };

  return {
    visible,
    x,
    y,
    targetMessage,
    open,
    close,
  };
}
