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

const normalizeAudioMimeType = (mimeType: string) =>
  (mimeType.split(";")[0]?.trim() || "audio/webm").toLowerCase();

export function useVoiceRecorder() {
  const {capture} = useErrorHandler("voice-recorder");
  const isRecording = ref(false);
  const recordingStartTime = ref(0);
  let mediaRecorder: MediaRecorder | null = null;
  let audioChunks: Blob[] = [];
  let recordedMimeType = "";

  const resetRecorder = () => {
    audioChunks = [];
    recordedMimeType = "";
    mediaRecorder = null;
    recordingStartTime.value = 0;
  };

  const stopStreamTracks = () => {
    mediaRecorder?.stream.getTracks().forEach((track) => track.stop());
  };

  const startRecording = async () => {
    if (isRecording.value) {
      return null;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({audio: true});
      const mimeType = getPreferredAudioMimeType();
      mediaRecorder = new MediaRecorder(
        stream,
        mimeType ? {mimeType} : undefined,
      );
      recordedMimeType = mediaRecorder.mimeType || mimeType || "audio/webm";
      audioChunks = [];
      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunks.push(event.data);
        }
      };
      mediaRecorder.start();
      recordingStartTime.value = Date.now();
      isRecording.value = true;
      return null;
    } catch (error) {
      isRecording.value = false;
      resetRecorder();
      capture(error, "无法获取麦克风权限，请检查浏览器和系统设置");
      return null;
    }
  };

  const finishRecording = async (): Promise<{
    file: File;
    duration: number;
  } | null> => {
    if (!mediaRecorder || mediaRecorder.state !== "recording") {
      isRecording.value = false;
      resetRecorder();
      return null;
    }

    return new Promise((resolve) => {
      const recorder = mediaRecorder!;
      recorder.onstop = () => {
        stopStreamTracks();
        isRecording.value = false;

        if (audioChunks.length === 0) {
          capture(new Error("No audio data"), "录音失败，未采集到音频数据");
          resolve(null);
          resetRecorder();
          return;
        }

        const duration = Math.round((Date.now() - recordingStartTime.value) / 1000);
        if (duration < 1) {
          capture(new Error("Recording too short"), "录音时间太短");
          resolve(null);
          resetRecorder();
          return;
        }

        const rawMimeType = recorder.mimeType || recordedMimeType || "audio/webm";
        const mimeType = normalizeAudioMimeType(rawMimeType);
        const blob = new Blob(audioChunks, {type: mimeType});
        resolve({
          file: new File(
            [blob],
            `voice_${Date.now()}.${getAudioFileExtension(rawMimeType)}`,
            {type: mimeType},
          ),
          duration,
        });
        resetRecorder();
      };
      recorder.stop();
    });
  };

  const cancelRecording = () => {
    if (mediaRecorder) {
      mediaRecorder.onstop = null;
      if (mediaRecorder.state === "recording") {
        mediaRecorder.stop();
      }
      stopStreamTracks();
    }
    isRecording.value = false;
    resetRecorder();
  };

  return {
    isRecording,
    startRecording,
    finishRecording,
    cancelRecording,
  };
}
