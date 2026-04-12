import { ref } from "vue";
import { useErrorHandler } from "@/hooks/useErrorHandler";

export function useVoiceRecorder() {
  const { capture } = useErrorHandler("voice-recorder");
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
        return null;
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
      mediaRecorder.start();
      recordingStartTime.value = Date.now();
      return null;
    } catch (error) {
      capture(error, "无法获取麦克风权限，请检查设备设置");
      isRecording.value = false;
      return null;
    }
  };

  const finishRecording = async (): Promise<{ file: File; duration: number } | null> => {
    isStopRequested.value = true;
    if (!mediaRecorder || mediaRecorder.state !== "recording") {
      isRecording.value = false;
      return null;
    }
    return new Promise((resolve) => {
      mediaRecorder!.onstop = () => {
        mediaRecorder?.stream.getTracks().forEach((track) => track.stop());
        isRecording.value = false;
        if (audioChunks.length === 0) {
          capture(new Error("没有采集到音频数据"), "录音失败，没有采集到音频数据");
          resolve(null);
          return;
        }
        const duration = Math.round((Date.now() - recordingStartTime.value) / 1000);
        if (duration < 1) {
          capture(new Error("录音时间太短"), "录音时间太短");
          resolve(null);
          return;
        }
        const blob = new Blob(audioChunks, { type: "audio/wav" });
        resolve({
          file: new File([blob], `voice_${Date.now()}.wav`, {
            type: blob.type || "audio/wav",
          }),
          duration,
        });
      };
      mediaRecorder!.stop();
    });
  };

  const cancelRecording = () => {
    isStopRequested.value = true;
    if (mediaRecorder && mediaRecorder.state === "recording") {
      mediaRecorder.onstop = null;
      mediaRecorder.stop();
      mediaRecorder.stream.getTracks().forEach((track) => track.stop());
    }
    isRecording.value = false;
  };

  return {
    isVoiceMode,
    isRecording,
    toggleVoiceMode,
    startRecording,
    finishRecording,
    cancelRecording,
  };
}
