import {ref} from "vue";
import {useErrorHandler} from "@/hooks/useErrorHandler";

const AUDIO_MIME_CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/ogg;codecs=opus",
  "audio/mp4",
];

const getPreferredAudioMimeType = () => {
  if (typeof MediaRecorder === "undefined") {
    return "";
  }

  return (
    AUDIO_MIME_CANDIDATES.find((mimeType) =>
      MediaRecorder.isTypeSupported(mimeType),
    ) || ""
  );
};

const getAudioFileExtension = (mimeType: string) => {
  const normalized = mimeType.toLowerCase();
  if (normalized.includes("mp4")) return "m4a";
  if (normalized.includes("ogg")) return "ogg";
  if (normalized.includes("wav")) return "wav";
  if (normalized.includes("mpeg") || normalized.includes("mp3")) return "mp3";
  return "webm";
};

export function useVoiceRecorder() {
  const { capture } = useErrorHandler("voice-recorder");
  const isVoiceMode = ref(false);
  const isRecording = ref(false);
  const isStopRequested = ref(false);
  const recordingStartTime = ref(0);
  let mediaRecorder: MediaRecorder | null = null;
  let audioChunks: Blob[] = [];
  let recordedMimeType = "";

  const resetRecorder = () => {
    audioChunks = [];
    recordedMimeType = "";
    mediaRecorder = null;
  };

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
        resetRecorder();
        return null;
      }

      const mimeType = getPreferredAudioMimeType();
      mediaRecorder = new MediaRecorder(
        stream,
        mimeType ? { mimeType } : undefined,
      );
      recordedMimeType = mediaRecorder.mimeType || mimeType;
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
      resetRecorder();
      return null;
    }
  };

  const finishRecording = async (): Promise<{
    file: File;
    duration: number;
  } | null> => {
    isStopRequested.value = true;
    if (!mediaRecorder || mediaRecorder.state !== "recording") {
      isRecording.value = false;
      resetRecorder();
      return null;
    }

    return new Promise((resolve) => {
      const recorder = mediaRecorder!;

      recorder.onstop = () => {
        recorder.stream.getTracks().forEach((track) => track.stop());
        isRecording.value = false;

        if (audioChunks.length === 0) {
          capture(new Error("没有采集到音频数据"), "录音失败，没有采集到音频数据");
          resolve(null);
          resetRecorder();
          return;
        }

        const duration = Math.round(
          (Date.now() - recordingStartTime.value) / 1000,
        );
        if (duration < 1) {
          capture(new Error("录音时间太短"), "录音时间太短");
          resolve(null);
          resetRecorder();
          return;
        }

        const actualMimeType =
          recorder.mimeType || recordedMimeType || "audio/webm";
        const blob = new Blob(audioChunks, { type: actualMimeType });
        resolve({
          file: new File(
            [blob],
            `voice_${Date.now()}.${getAudioFileExtension(actualMimeType)}`,
            {
              type: actualMimeType,
            },
          ),
          duration,
        });
        resetRecorder();
      };

      recorder.stop();
    });
  };

  const cancelRecording = () => {
    isStopRequested.value = true;

    if (mediaRecorder) {
      mediaRecorder.onstop = null;
      if (mediaRecorder.state === "recording") {
        mediaRecorder.stop();
      }
      mediaRecorder.stream.getTracks().forEach((track) => track.stop());
    }

    isRecording.value = false;
    resetRecorder();
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
