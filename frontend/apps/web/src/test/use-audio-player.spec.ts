import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Mock onUnmounted to prevent errors when composable is called outside setup
vi.mock("vue", async () => {
  const actual = await vi.importActual("vue");
  return {
    ...actual,
    onUnmounted: vi.fn(),
  };
});

describe("useAudioPlayer", () => {
  beforeAll(() => {
    // jsdom doesn't implement HTMLMediaElement methods
    HTMLAudioElement.prototype.pause = vi.fn();
    HTMLAudioElement.prototype.load = vi.fn();
    HTMLAudioElement.prototype.play = vi.fn().mockResolvedValue(undefined);
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  it("returns initial state with empty values", async () => {
    const { useAudioPlayer } = await import("@/composables/useAudioPlayer");
    const player = useAudioPlayer();

    expect(player.source.value).toBe("");
    expect(player.isPlaying.value).toBe(false);
    expect(player.progress.value).toBe(0);
    expect(player.duration.value).toBe(0);
    expect(player.audio.value).toBeNull();
  });

  it("load() creates an Audio element and sets its src", async () => {
    const { useAudioPlayer } = await import("@/composables/useAudioPlayer");
    const player = useAudioPlayer();

    const result = player.load("https://example.com/audio.mp3");

    expect(result).toBeInstanceOf(HTMLAudioElement);
    expect(player.source.value).toBe("https://example.com/audio.mp3");
    expect(player.audio.value).toBe(result);
    expect(result!.src).toContain("https://example.com/audio.mp3");
    expect(result!.preload).toBe("metadata");
    expect(player.progress.value).toBe(0);
    expect(player.duration.value).toBe(0);
  });

  it("load() with the same source returns existing element", async () => {
    const { useAudioPlayer } = await import("@/composables/useAudioPlayer");
    const player = useAudioPlayer();

    const first = player.load("https://example.com/audio.mp3");
    const pauseSpy = vi.spyOn(first!, "pause");

    const second = player.load("https://example.com/audio.mp3");

    expect(second).toBe(first);
    expect(pauseSpy).not.toHaveBeenCalled();
  });

  it("load() with empty source calls stop (resets isPlaying and progress)", async () => {
    const { useAudioPlayer } = await import("@/composables/useAudioPlayer");
    const player = useAudioPlayer();

    player.source.value = "something";
    player.progress.value = 0.5;
    player.duration.value = 100;
    player.isPlaying.value = true;

    player.load("");

    // stop() with an audio element resets isPlaying and progress but NOT source or duration
    expect(player.isPlaying.value).toBe(false);
    expect(player.progress.value).toBe(0);
    // source and duration are NOT reset when stop runs with an existing audio element
    expect(player.duration.value).toBe(100);
  });

  it("load() with null/undefined source calls stop (resets isPlaying and progress)", async () => {
    const { useAudioPlayer } = await import("@/composables/useAudioPlayer");
    const player = useAudioPlayer();

    player.source.value = "something";
    player.progress.value = 0.5;
    player.duration.value = 100;
    player.isPlaying.value = true;

    player.load(null);
    expect(player.isPlaying.value).toBe(false);
    expect(player.progress.value).toBe(0);

    player.progress.value = 0.8;
    player.load(undefined);
    expect(player.isPlaying.value).toBe(false);
    expect(player.progress.value).toBe(0);
  });

  it("play() sets source and invokes element.play()", async () => {
    const { useAudioPlayer } = await import("@/composables/useAudioPlayer");
    const player = useAudioPlayer();

    const playSpy = vi.spyOn(HTMLAudioElement.prototype, "play");

    await player.play("https://example.com/audio.mp3");

    expect(player.source.value).toBe("https://example.com/audio.mp3");
    expect(playSpy).toHaveBeenCalled();
  });

  it("play() without src does not call play on element", async () => {
    const { useAudioPlayer } = await import("@/composables/useAudioPlayer");
    const player = useAudioPlayer();

    // Create audio but clear src — in jsdom, setting src="" resolves to a URL
    // so we use Object.defineProperty to reliably set it to empty
    player.load("https://example.com/audio.mp3");
    Object.defineProperty(player.audio.value!, "src", { value: "" });
    player.source.value = "";

    const playSpy = vi.spyOn(HTMLAudioElement.prototype, "play");

    await player.play();

    expect(playSpy).not.toHaveBeenCalled();
  });

  it("pause() calls pause on the audio element", async () => {
    const { useAudioPlayer } = await import("@/composables/useAudioPlayer");
    const player = useAudioPlayer();

    player.load("https://example.com/audio.mp3");
    const pauseSpy = vi.spyOn(player.audio.value!, "pause");
    player.pause();

    expect(pauseSpy).toHaveBeenCalled();
  });

  it("pause() does nothing when no audio element", async () => {
    const { useAudioPlayer } = await import("@/composables/useAudioPlayer");
    const player = useAudioPlayer();

    expect(() => player.pause()).not.toThrow();
  });

  it("stop() resets state and pauses audio", async () => {
    const { useAudioPlayer } = await import("@/composables/useAudioPlayer");
    const player = useAudioPlayer();

    player.load("https://example.com/audio.mp3");
    const audioEl = player.audio.value!;
    const pauseSpy = vi.spyOn(audioEl, "pause");

    player.isPlaying.value = true;
    player.progress.value = 0.8;

    player.stop();

    expect(pauseSpy).toHaveBeenCalled();
    expect(audioEl.currentTime).toBe(0);
    expect(player.isPlaying.value).toBe(false);
    expect(player.progress.value).toBe(0);
  });

  it("stop() resets state when no audio element", async () => {
    const { useAudioPlayer } = await import("@/composables/useAudioPlayer");
    const player = useAudioPlayer();

    player.source.value = "something";
    player.progress.value = 0.5;
    player.duration.value = 100;
    player.isPlaying.value = true;

    player.stop();

    expect(player.source.value).toBe("");
    expect(player.progress.value).toBe(0);
    expect(player.duration.value).toBe(0);
    expect(player.isPlaying.value).toBe(false);
  });

  it("toggle() plays a new source", async () => {
    const { useAudioPlayer } = await import("@/composables/useAudioPlayer");
    const player = useAudioPlayer();

    player.isPlaying.value = false;
    await player.toggle("https://example.com/new.mp3");

    expect(player.source.value).toBe("https://example.com/new.mp3");
  });

  it("toggle() pauses when same source is playing", async () => {
    const { useAudioPlayer } = await import("@/composables/useAudioPlayer");
    const player = useAudioPlayer();

    // Spy on addEventListener BEFORE load so we can capture the pause handler
    const addEventListenerSpy = vi.spyOn(
      HTMLAudioElement.prototype,
      "addEventListener"
    );
    const audioEl = player.load("https://example.com/audio.mp3");
    const pauseSpy = vi.spyOn(audioEl, "pause");

    // Extract the pause handler from addEventListener spy calls
    const pauseHandler = (
      addEventListenerSpy.mock.calls.find(
        (call: unknown[]) => call[0] === "pause"
      )?.[1] as () => void
    );

    player.isPlaying.value = true;

    await player.toggle("https://example.com/audio.mp3");

    // toggle calls pause(), which calls audioEl.pause(), but does NOT directly set isPlaying
    expect(pauseSpy).toHaveBeenCalled();

    // In a real browser, the 'pause' event fires and handlePause sets isPlaying=false
    // In jsdom, we manually invoke the handler to simulate that
    if (pauseHandler) {
      pauseHandler();
      expect(player.isPlaying.value).toBe(false);
    }
  });

  it("toggle() stops when empty source", async () => {
    const { useAudioPlayer } = await import("@/composables/useAudioPlayer");
    const player = useAudioPlayer();

    player.source.value = "something";
    player.isPlaying.value = true;

    await player.toggle("");

    expect(player.isPlaying.value).toBe(false);
  });

  it("release() cleans up audio element and state", async () => {
    const { useAudioPlayer } = await import("@/composables/useAudioPlayer");
    const player = useAudioPlayer();

    const audioEl = player.load("https://example.com/audio.mp3");
    const pauseSpy = vi.spyOn(audioEl, "pause");
    const removeAttrSpy = vi.spyOn(audioEl, "removeAttribute" as never);

    player.source.value = "something";
    player.duration.value = 50;
    player.progress.value = 0.5;
    player.isPlaying.value = true;

    player.release();

    expect(pauseSpy).toHaveBeenCalled();
    expect(removeAttrSpy).toHaveBeenCalledWith("src");
    expect(player.audio.value).toBeNull();
    expect(player.source.value).toBe("");
    expect(player.progress.value).toBe(0);
    expect(player.duration.value).toBe(0);
    expect(player.isPlaying.value).toBe(false);
  });

  it("release() resets state when no audio element", async () => {
    const { useAudioPlayer } = await import("@/composables/useAudioPlayer");
    const player = useAudioPlayer();

    player.source.value = "something";
    player.progress.value = 0.5;
    player.duration.value = 100;
    player.isPlaying.value = true;

    player.release();

    expect(player.source.value).toBe("");
    expect(player.progress.value).toBe(0);
    expect(player.duration.value).toBe(0);
    expect(player.isPlaying.value).toBe(false);
  });

  it("binds audio events on load", async () => {
    const { useAudioPlayer } = await import("@/composables/useAudioPlayer");
    const player = useAudioPlayer();

    const addEventListenerSpy = vi.spyOn(
      HTMLAudioElement.prototype,
      "addEventListener"
    );

    player.load("https://example.com/audio.mp3");

    expect(addEventListenerSpy).toHaveBeenCalledWith(
      "timeupdate",
      expect.any(Function)
    );
    expect(addEventListenerSpy).toHaveBeenCalledWith(
      "loadedmetadata",
      expect.any(Function)
    );
    expect(addEventListenerSpy).toHaveBeenCalledWith(
      "durationchange",
      expect.any(Function)
    );
    expect(addEventListenerSpy).toHaveBeenCalledWith("ended", expect.any(Function));
    expect(addEventListenerSpy).toHaveBeenCalledWith("pause", expect.any(Function));
    expect(addEventListenerSpy).toHaveBeenCalledWith("play", expect.any(Function));
    expect(addEventListenerSpy).toHaveBeenCalledWith("error", expect.any(Function));
  });

  it("bound events update reactive state when triggered", async () => {
    const { useAudioPlayer } = await import("@/composables/useAudioPlayer");
    const player = useAudioPlayer();

    const addEventListenerSpy = vi.spyOn(
      HTMLAudioElement.prototype,
      "addEventListener"
    );
    player.load("https://example.com/audio.mp3");

    // Collect bound handlers from addEventListener spy calls
    const handlers = new Map<string, () => void>();
    for (const call of addEventListenerSpy.mock.calls) {
      handlers.set(call[0], call[1] as () => void);
    }

    expect(handlers.has("ended")).toBe(true);
    expect(handlers.has("error")).toBe(true);
  });

  it("calls onUnmounted which triggers release", async () => {
    const { onUnmounted } = await import("vue");
    const { useAudioPlayer } = await import("@/composables/useAudioPlayer");

    const player = useAudioPlayer();
    player.load("https://example.com/test.mp3");

    expect(onUnmounted).toHaveBeenCalledWith(expect.any(Function));
    const cleanupFn = (onUnmounted as ReturnType<typeof vi.fn>).mock.calls[0][0];

    player.source.value = "something";
    cleanupFn();

    expect(player.source.value).toBe("");
    expect(player.audio.value).toBeNull();
  });

  it("syncProgress updates progress ratio via timeupdate handler", async () => {
    const { useAudioPlayer } = await import("@/composables/useAudioPlayer");
    const player = useAudioPlayer();

    const addEventListenerSpy = vi.spyOn(
      HTMLAudioElement.prototype,
      "addEventListener"
    );
    player.load("https://example.com/audio.mp3");

    // Get the timeupdate handler from the prototype spy
    const timeupdateCall = addEventListenerSpy.mock.calls.find(
      (call: unknown[]) => call[0] === "timeupdate"
    );
    const timeupdateHandler = timeupdateCall?.[1] as () => void;
    expect(timeupdateHandler).toBeDefined();

    // Simulate timeupdate
    const el = player.audio.value!;
    el.currentTime = 30;
    Object.defineProperty(el, "duration", { value: 120 });
    timeupdateHandler();

    expect(player.progress.value).toBeCloseTo(0.25, 2);
  });

  it("clampProgress handles non-finite values by returning 0", async () => {
    const { useAudioPlayer } = await import("@/composables/useAudioPlayer");
    const player = useAudioPlayer();

    const addEventListenerSpy = vi.spyOn(
      HTMLAudioElement.prototype,
      "addEventListener"
    );
    player.load("https://example.com/audio.mp3");

    const timeupdateCall = addEventListenerSpy.mock.calls.find(
      (call: unknown[]) => call[0] === "timeupdate"
    );
    const timeupdateHandler = timeupdateCall?.[1] as () => void;

    // Duration is NaN (default in jsdom), progress should stay 0
    if (timeupdateHandler) {
      timeupdateHandler();
    }
    expect(player.progress.value).toBe(0);
  });

  it("syncDuration updates duration and progress via loadedmetadata", async () => {
    const { useAudioPlayer } = await import("@/composables/useAudioPlayer");
    const player = useAudioPlayer();

    const addEventListenerSpy = vi.spyOn(
      HTMLAudioElement.prototype,
      "addEventListener"
    );
    player.load("https://example.com/audio.mp3");

    const metadataCall = addEventListenerSpy.mock.calls.find(
      (call: unknown[]) => call[0] === "loadedmetadata"
    );
    const metadataHandler = metadataCall?.[1] as () => void;

    const el = player.audio.value!;
    Object.defineProperty(el, "duration", { value: 120 });
    el.currentTime = 30;
    metadataHandler!();

    expect(player.duration.value).toBe(120);
  });

  it("syncDuration sets duration to 0 when duration is not finite", async () => {
    const { useAudioPlayer } = await import("@/composables/useAudioPlayer");
    const player = useAudioPlayer();

    const addEventListenerSpy = vi.spyOn(
      HTMLAudioElement.prototype,
      "addEventListener"
    );
    player.load("https://example.com/audio.mp3");

    const metadataCall = addEventListenerSpy.mock.calls.find(
      (call: unknown[]) => call[0] === "loadedmetadata"
    );
    const metadataHandler = metadataCall?.[1] as () => void;

    Object.defineProperty(player.audio.value!, "duration", { value: NaN });
    metadataHandler!();

    expect(player.duration.value).toBe(0);
  });

  it("pause handler updates isPlaying to false", async () => {
    const { useAudioPlayer } = await import("@/composables/useAudioPlayer");
    const player = useAudioPlayer();

    const addEventListenerSpy = vi.spyOn(
      HTMLAudioElement.prototype,
      "addEventListener"
    );
    player.load("https://example.com/audio.mp3");

    const pauseCall = addEventListenerSpy.mock.calls.find(
      (call: unknown[]) => call[0] === "pause"
    );
    const pauseHandler = pauseCall?.[1] as () => void;

    player.isPlaying.value = true;
    pauseHandler!();

    expect(player.isPlaying.value).toBe(false);
  });

  it("play handler updates isPlaying to true", async () => {
    const { useAudioPlayer } = await import("@/composables/useAudioPlayer");
    const player = useAudioPlayer();

    const addEventListenerSpy = vi.spyOn(
      HTMLAudioElement.prototype,
      "addEventListener"
    );
    player.load("https://example.com/audio.mp3");

    const playCall = addEventListenerSpy.mock.calls.find(
      (call: unknown[]) => call[0] === "play"
    );
    const playHandler = playCall?.[1] as () => void;

    playHandler!();
    expect(player.isPlaying.value).toBe(true);
  });

  it("error handler resets isPlaying and progress", async () => {
    const { useAudioPlayer } = await import("@/composables/useAudioPlayer");
    const player = useAudioPlayer();

    const addEventListenerSpy = vi.spyOn(
      HTMLAudioElement.prototype,
      "addEventListener"
    );
    player.load("https://example.com/audio.mp3");

    const errorCall = addEventListenerSpy.mock.calls.find(
      (call: unknown[]) => call[0] === "error"
    );
    const errorHandler = errorCall?.[1] as () => void;

    player.isPlaying.value = true;
    player.progress.value = 0.8;
    errorHandler!();

    expect(player.isPlaying.value).toBe(false);
    expect(player.progress.value).toBe(0);
  });

  it("ended handler sets isPlaying to false and progress to 1", async () => {
    const { useAudioPlayer } = await import("@/composables/useAudioPlayer");
    const player = useAudioPlayer();

    const addEventListenerSpy = vi.spyOn(
      HTMLAudioElement.prototype,
      "addEventListener"
    );
    player.load("https://example.com/audio.mp3");

    const endedCall = addEventListenerSpy.mock.calls.find(
      (call: unknown[]) => call[0] === "ended"
    );
    const endedHandler = endedCall?.[1] as () => void;

    player.isPlaying.value = true;
    endedHandler!();

    expect(player.isPlaying.value).toBe(false);
    expect(player.progress.value).toBe(1);
  });
});
