import { onUnmounted, ref, shallowRef } from "vue";

type PlayableSource = string | null | undefined;

const clampProgress = (currentTime: number, totalDuration: number) => {
  if (!Number.isFinite(currentTime) || !Number.isFinite(totalDuration) || totalDuration <= 0) {
    return 0;
  }
  return Math.min(1, Math.max(0, currentTime / totalDuration));
};

export function useAudioPlayer() {
  const audio = shallowRef<HTMLAudioElement | null>(null);
  const source = ref("");
  const isPlaying = ref(false);
  const progress = ref(0);
  const duration = ref(0);

  const syncProgress = () => {
    if (!audio.value) {
      progress.value = 0;
      return;
    }
    progress.value = clampProgress(audio.value.currentTime, audio.value.duration);
  };

  const syncDuration = () => {
    if (!audio.value || !Number.isFinite(audio.value.duration)) {
      duration.value = 0;
      return;
    }
    duration.value = audio.value.duration;
    syncProgress();
  };

  const handleEnded = () => {
    isPlaying.value = false;
    progress.value = 1;
  };

  const handlePause = () => {
    isPlaying.value = false;
    syncProgress();
  };

  const handlePlay = () => {
    isPlaying.value = true;
  };

  const handleError = () => {
    isPlaying.value = false;
    progress.value = 0;
  };

  const bindAudioEvents = (element: HTMLAudioElement) => {
    element.addEventListener("timeupdate", syncProgress);
    element.addEventListener("loadedmetadata", syncDuration);
    element.addEventListener("durationchange", syncDuration);
    element.addEventListener("ended", handleEnded);
    element.addEventListener("pause", handlePause);
    element.addEventListener("play", handlePlay);
    element.addEventListener("error", handleError);
  };

  const unbindAudioEvents = (element: HTMLAudioElement) => {
    element.removeEventListener("timeupdate", syncProgress);
    element.removeEventListener("loadedmetadata", syncDuration);
    element.removeEventListener("durationchange", syncDuration);
    element.removeEventListener("ended", handleEnded);
    element.removeEventListener("pause", handlePause);
    element.removeEventListener("play", handlePlay);
    element.removeEventListener("error", handleError);
  };

  const ensureAudio = () => {
    if (audio.value) {
      return audio.value;
    }
    const element = new Audio();
    element.preload = "metadata";
    bindAudioEvents(element);
    audio.value = element;
    return element;
  };

  const load = (nextSource?: PlayableSource) => {
    const normalizedSource = String(nextSource || "").trim();
    const element = ensureAudio();
    if (!normalizedSource) {
      stop();
      return element;
    }
    if (source.value === normalizedSource && element.src) {
      return element;
    }
    source.value = normalizedSource;
    progress.value = 0;
    duration.value = 0;
    element.pause();
    element.currentTime = 0;
    element.src = normalizedSource;
    element.load();
    return element;
  };

  const play = async (nextSource?: PlayableSource) => {
    const element = nextSource ? load(nextSource) : ensureAudio();
    if (!element.src) {
      return;
    }
    await element.play();
  };

  const pause = () => {
    if (!audio.value) {
      return;
    }
    audio.value.pause();
  };

  const stop = () => {
    if (!audio.value) {
      source.value = "";
      progress.value = 0;
      duration.value = 0;
      isPlaying.value = false;
      return;
    }
    audio.value.pause();
    audio.value.currentTime = 0;
    isPlaying.value = false;
    progress.value = 0;
  };

  const toggle = async (nextSource?: PlayableSource) => {
    const normalizedSource = String(nextSource || "").trim();
    if (!normalizedSource) {
      stop();
      return;
    }
    if (isPlaying.value && source.value === normalizedSource) {
      pause();
      return;
    }
    await play(normalizedSource);
  };

  const release = () => {
    if (!audio.value) {
      source.value = "";
      progress.value = 0;
      duration.value = 0;
      isPlaying.value = false;
      return;
    }
    stop();
    unbindAudioEvents(audio.value);
    audio.value.removeAttribute("src");
    audio.value.load();
    audio.value = null;
    source.value = "";
    progress.value = 0;
    duration.value = 0;
  };

  onUnmounted(() => {
    release();
  });

  return {
    audio,
    source,
    isPlaying,
    progress,
    duration,
    load,
    play,
    pause,
    stop,
    toggle,
    release,
  };
}
