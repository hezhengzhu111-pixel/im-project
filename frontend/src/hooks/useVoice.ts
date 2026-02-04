import { ref } from "vue";
import { ElMessage } from "element-plus";
import { fileApi } from "@/services";
import { useChatStore } from "@/stores/chat";

export function useVoice() {
  const chatStore = useChatStore();
  const isVoiceMode = ref(false);
  const isRecording = ref(false);
  const isStopRequested = ref(false);
  const recordingStartTime = ref(0);
  let mediaRecorder: MediaRecorder | null = null;
  let audioChunks: Blob[] = [];

  const toggleVoiceMode = () => {
    isVoiceMode.value = !isVoiceMode.value;
  };

  const startRecording = async () => {
    isStopRequested.value = false;
    isRecording.value = true;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      if (isStopRequested.value) {
        stream.getTracks().forEach((track) => track.stop());
        isRecording.value = false;
        return;
      }

      const mimeType = MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : "";
      mediaRecorder = new MediaRecorder(
        stream,
        mimeType ? { mimeType } : undefined,
      );
      audioChunks = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunks.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        if (audioChunks.length === 0) {
          console.error("No audio data recorded");
          ElMessage.warning("录音失败，没有采集到音频数据");
          return;
        }

        const audioBlob = new Blob(audioChunks, { type: "audio/wav" });
        const duration = Math.round(
          (Date.now() - recordingStartTime.value) / 1000,
        );

        if (duration < 1) {
          ElMessage.warning("录音时间太短");
          return;
        }

        try {
          ElMessage.info("正在上传语音...");
          const voiceFileName = `voice_${Date.now()}.wav`;
          const voiceFile = new File([audioBlob], voiceFileName, {
            type: audioBlob.type || "audio/wav",
          });
          const response = await fileApi.uploadAudio(voiceFile);
          if (response.code !== 200 || !response.data?.url) {
            throw new Error(response.message || "语音上传失败");
          }
          await chatStore.sendMessage(response.data.url, "VOICE", { duration });
          // Note: scrollToBottom needs to be handled by the component watching messages
        } catch (error: any) {
          console.error("语音发送失败", error);
          ElMessage.error("语音发送失败");
        }

        mediaRecorder?.stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorder.start();
      recordingStartTime.value = Date.now();
    } catch (error) {
      console.error("无法获取麦克风权限", error);
      ElMessage.error("无法获取麦克风权限，请检查设备设置");
      isRecording.value = false;
    }
  };

  const stopRecording = () => {
    isStopRequested.value = true;

    if (mediaRecorder && mediaRecorder.state === "recording") {
      mediaRecorder.stop();
      isRecording.value = false;
    }
  };

  const cancelRecording = () => {
    isStopRequested.value = true;
    if (isRecording.value) {
      if (mediaRecorder && mediaRecorder.state === "recording") {
        mediaRecorder.stop();
        mediaRecorder.onstop = null; // Prevent upload
        mediaRecorder.stream.getTracks().forEach((track) => track.stop());
      }
      isRecording.value = false;
      ElMessage.info("已取消录音");
    }
  };

  return {
    isVoiceMode,
    isRecording,
    toggleVoiceMode,
    startRecording,
    stopRecording,
    cancelRecording,
  };
}
