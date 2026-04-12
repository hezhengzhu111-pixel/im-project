import { onUnmounted, ref } from "vue";
import type { Message } from "@/types";
import { useErrorHandler } from "@/hooks/useErrorHandler";

export function useAudioPlayer() {
  const { capture } = useErrorHandler("audio-player");
  const playingMessageId = ref<string>("");
  let audioPlayer: HTMLAudioElement | null = null;

  const stop = () => {
    if (audioPlayer) {
      audioPlayer.pause();
      audioPlayer.currentTime = 0;
    }
    playingMessageId.value = "";
  };

  const toggle = async (message: Message) => {
    if (playingMessageId.value === message.id) {
      stop();
      return;
    }
    const url = message.mediaUrl || message.content;
    if (!url) {
      capture(new Error("语音文件无效"), "语音文件无效");
      return;
    }
    if (!audioPlayer) {
      audioPlayer = new Audio(url);
      audioPlayer.onended = () => {
        playingMessageId.value = "";
      };
      audioPlayer.onerror = () => {
        playingMessageId.value = "";
        capture(new Error("语音播放失败"), "语音播放失败");
      };
    } else if (audioPlayer.src !== url) {
      audioPlayer.src = url;
    }

    try {
      await audioPlayer.play();
      playingMessageId.value = message.id;
    } catch (error) {
      capture(error, "播放失败");
    }
  };

  onUnmounted(() => {
    stop();
  });

  return {
    playingMessageId,
    toggle,
    stop,
  };
}
