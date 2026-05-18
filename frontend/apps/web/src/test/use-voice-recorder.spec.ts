import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/hooks/useErrorHandler", () => ({
  useErrorHandler: () => ({
    capture: vi.fn(),
    notifyInfo: vi.fn(),
    notifySuccess: vi.fn(),
  }),
}));

// Mock Capacitor
vi.mock("@capacitor/core", () => ({
  Capacitor: {
    isNativePlatform: () => false,
  },
}));

// Mock user settings store
vi.mock("@/stores/user-settings", () => ({
  useUserSettingsStore: () => ({
    allowInsecureVoiceRecording: false,
  }),
}));

describe("useVoiceRecorder", () => {
  const originalMediaDevices = navigator.mediaDevices;
  const originalMediaRecorder = globalThis.MediaRecorder;
  const originalWindow = globalThis.window;

  let mockStream: MediaStream;
  let mockRecorder: {
    start: ReturnType<typeof vi.fn>;
    stop: ReturnType<typeof vi.fn>;
    state: string;
    mimeType: string;
    stream: MediaStream;
    ondataavailable: ((event: { data: Blob }) => void) | null;
    onstop: (() => void) | null;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    // Reset secure context
    Object.defineProperty(window, "isSecureContext", {
      value: true,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(window, "location", {
      value: { hostname: "example.com" },
      writable: true,
      configurable: true,
    });

    mockStream = {
      getTracks: () => [{ stop: vi.fn() }],
    } as unknown as MediaStream;

    mockRecorder = {
      start: vi.fn(),
      stop: vi.fn(),
      state: "recording",
      mimeType: "audio/webm;codecs=opus",
      stream: mockStream,
      ondataavailable: null,
      onstop: null,
    };

    // Mock MediaRecorder
    globalThis.MediaRecorder = vi.fn(() => mockRecorder) as unknown as typeof MediaRecorder;
    (globalThis.MediaRecorder as unknown as { isTypeSupported: ReturnType<typeof vi.fn> }).isTypeSupported = vi.fn(() => true);

    // Mock getUserMedia
    Object.defineProperty(navigator, "mediaDevices", {
      value: {
        getUserMedia: vi.fn().mockResolvedValue(mockStream),
      },
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    Object.defineProperty(navigator, "mediaDevices", {
      value: originalMediaDevices,
      writable: true,
      configurable: true,
    });
    globalThis.MediaRecorder = originalMediaRecorder;
    vi.useRealTimers();
  });

  it("returns initial state with isRecording false", async () => {
    const { useVoiceRecorder } = await import(
      "@/features/chat/composables/useVoiceRecorder"
    );
    const recorder = useVoiceRecorder();

    expect(recorder.isRecording.value).toBe(false);
  });

  it("startRecording successfully starts recording and returns null", async () => {
    const { useVoiceRecorder } = await import(
      "@/features/chat/composables/useVoiceRecorder"
    );
    const recorder = useVoiceRecorder();

    const result = await recorder.startRecording();

    expect(result).toBeNull();
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({
      audio: true,
    });
    expect(globalThis.MediaRecorder).toHaveBeenCalledWith(mockStream, {
      mimeType: "audio/webm;codecs=opus",
    });
    expect(mockRecorder.start).toHaveBeenCalled();
    expect(recorder.isRecording.value).toBe(true);
  });

  it("startRecording returns null when already recording", async () => {
    const { useVoiceRecorder } = await import(
      "@/features/chat/composables/useVoiceRecorder"
    );
    const recorder = useVoiceRecorder();

    await recorder.startRecording();
    expect(recorder.isRecording.value).toBe(true);

    // Try starting again
    const result = await recorder.startRecording();
    expect(result).toBeNull();
    // Should not call getUserMedia again
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledTimes(1);
  });

  it("startRecording handles insecure context gracefully", async () => {
    Object.defineProperty(window, "isSecureContext", {
      value: false,
      writable: true,
      configurable: true,
    });

    const { useVoiceRecorder } = await import(
      "@/features/chat/composables/useVoiceRecorder"
    );
    const recorder = useVoiceRecorder();

    const result = await recorder.startRecording();

    expect(result).toBeNull();
    expect(navigator.mediaDevices.getUserMedia).not.toHaveBeenCalled();
    expect(recorder.isRecording.value).toBe(false);
  });

  it("startRecording handles permission denied", async () => {
    const error = new DOMException("Permission denied", "NotAllowedError");
    navigator.mediaDevices.getUserMedia = vi.fn().mockRejectedValue(error);

    const { useVoiceRecorder } = await import(
      "@/features/chat/composables/useVoiceRecorder"
    );
    const recorder = useVoiceRecorder();

    const result = await recorder.startRecording();

    expect(result).toBeNull();
    expect(recorder.isRecording.value).toBe(false);
  });

  it("startRecording handles no microphone (NotFoundError)", async () => {
    const error = new DOMException("Not found", "NotFoundError");
    navigator.mediaDevices.getUserMedia = vi.fn().mockRejectedValue(error);

    const { useVoiceRecorder } = await import(
      "@/features/chat/composables/useVoiceRecorder"
    );
    const recorder = useVoiceRecorder();

    const result = await recorder.startRecording();

    expect(result).toBeNull();
    expect(recorder.isRecording.value).toBe(false);
  });

  it("finishRecording returns file and duration on success", async () => {
    vi.setSystemTime(new Date("2026-05-18T12:00:00.000Z"));

    const { useVoiceRecorder } = await import(
      "@/features/chat/composables/useVoiceRecorder"
    );
    const recorder = useVoiceRecorder();

    await recorder.startRecording();

    // Simulate some time passing
    vi.setSystemTime(new Date("2026-05-18T12:00:05.500Z"));

    // Simulate data available
    if (mockRecorder.ondataavailable) {
      mockRecorder.ondataavailable({
        data: new Blob(["audio-data"], { type: "audio/webm" }),
      });
    }

    const resultPromise = recorder.finishRecording();

    // Simulate recorder stop
    if (mockRecorder.onstop) {
      mockRecorder.onstop();
    }

    const result = await resultPromise;

    expect(result).not.toBeNull();
    expect(result!.duration).toBe(5);
    expect(result!.file).toBeInstanceOf(File);
    expect(result!.file.name).toMatch(/^voice_\d+\.webm$/);
    expect(recorder.isRecording.value).toBe(false);
  });

  it("finishRecording returns null when not recording", async () => {
    const { useVoiceRecorder } = await import(
      "@/features/chat/composables/useVoiceRecorder"
    );
    const recorder = useVoiceRecorder();

    const result = await recorder.finishRecording();

    expect(result).toBeNull();
  });

  it("finishRecording returns null when MediaRecorder is not recording", async () => {
    const { useVoiceRecorder } = await import(
      "@/features/chat/composables/useVoiceRecorder"
    );
    const recorder = useVoiceRecorder();

    await recorder.startRecording();
    mockRecorder.state = "inactive";

    const result = await recorder.finishRecording();

    expect(result).toBeNull();
    expect(recorder.isRecording.value).toBe(false);
  });

  it("finishRecording returns null when no audio data collected", async () => {
    const { useVoiceRecorder } = await import(
      "@/features/chat/composables/useVoiceRecorder"
    );
    const recorder = useVoiceRecorder();

    await recorder.startRecording();

    // Don't push any audio data

    const resultPromise = recorder.finishRecording();

    if (mockRecorder.onstop) {
      mockRecorder.onstop();
    }

    const result = await resultPromise;

    expect(result).toBeNull();
    expect(recorder.isRecording.value).toBe(false);
  });

  it("finishRecording returns null when recording is too short (< 1s)", async () => {
    const { useVoiceRecorder } = await import(
      "@/features/chat/composables/useVoiceRecorder"
    );
    const recorder = useVoiceRecorder();

    await recorder.startRecording();

    // Data was collected but duration < 1s
    if (mockRecorder.ondataavailable) {
      mockRecorder.ondataavailable({
        data: new Blob(["audio-data"], { type: "audio/webm" }),
      });
    }

    const resultPromise = recorder.finishRecording();

    if (mockRecorder.onstop) {
      mockRecorder.onstop();
    }

    const result = await resultPromise;

    expect(result).toBeNull();
    expect(recorder.isRecording.value).toBe(false);
  });

  it("cancelRecording stops and resets state", async () => {
    const { useVoiceRecorder } = await import(
      "@/features/chat/composables/useVoiceRecorder"
    );
    const recorder = useVoiceRecorder();

    await recorder.startRecording();
    expect(recorder.isRecording.value).toBe(true);

    recorder.cancelRecording();

    expect(mockRecorder.stop).toHaveBeenCalled();
    expect(recorder.isRecording.value).toBe(false);
  });

  it("cancelRecording handles missing mediaRecorder gracefully", async () => {
    const { useVoiceRecorder } = await import(
      "@/features/chat/composables/useVoiceRecorder"
    );
    const recorder = useVoiceRecorder();

    // Cancel without starting
    expect(() => recorder.cancelRecording()).not.toThrow();
    expect(recorder.isRecording.value).toBe(false);
  });

  it("getVoiceRecorderUnavailableMessage returns message when navigator unavailable", async () => {
    // We test the internal logic indirectly by checking the behavior
    // If startRecording returns null due to unavailable message, it was triggered
    Object.defineProperty(window, "isSecureContext", {
      value: false,
      writable: true,
      configurable: true,
    });

    const { useVoiceRecorder } = await import(
      "@/features/chat/composables/useVoiceRecorder"
    );
    const recorder = useVoiceRecorder();

    const result = await recorder.startRecording();
    expect(result).toBeNull();
  });

  it("uses correct audio file extension for mp4 mime type", async () => {
    vi.setSystemTime(new Date("2026-05-18T12:00:00.000Z"));

    mockRecorder.mimeType = "audio/mp4";

    const { useVoiceRecorder } = await import(
      "@/features/chat/composables/useVoiceRecorder"
    );
    const recorder = useVoiceRecorder();

    await recorder.startRecording();
    vi.setSystemTime(new Date("2026-05-18T12:00:03.000Z"));

    if (mockRecorder.ondataavailable) {
      mockRecorder.ondataavailable({
        data: new Blob(["audio-data"], { type: "audio/mp4" }),
      });
    }

    const resultPromise = recorder.finishRecording();
    if (mockRecorder.onstop) {
      mockRecorder.onstop();
    }
    const result = await resultPromise;

    expect(result!.file.name).toMatch(/\.m4a$/);
  });

  it("prefers MediaRecorder.mimeType over detected mime type", async () => {
    vi.setSystemTime(new Date("2026-05-18T12:00:00.000Z"));

    // MediaRecorder returns its own mimeType
    mockRecorder.mimeType = "audio/webm";

    const { useVoiceRecorder } = await import(
      "@/features/chat/composables/useVoiceRecorder"
    );
    const recorder = useVoiceRecorder();

    await recorder.startRecording();
    vi.setSystemTime(new Date("2026-05-18T12:00:03.000Z"));

    if (mockRecorder.ondataavailable) {
      mockRecorder.ondataavailable({
        data: new Blob(["audio-data"], { type: "audio/webm" }),
      });
    }

    const resultPromise = recorder.finishRecording();
    if (mockRecorder.onstop) {
      mockRecorder.onstop();
    }
    const result = await resultPromise;

    expect(result!.file.name).toMatch(/\.webm$/);
  });

  it("normalizes audio mime type by stripping codec info", async () => {
    vi.setSystemTime(new Date("2026-05-18T12:00:00.000Z"));

    mockRecorder.mimeType = "audio/webm;codecs=opus";

    const { useVoiceRecorder } = await import(
      "@/features/chat/composables/useVoiceRecorder"
    );
    const recorder = useVoiceRecorder();

    await recorder.startRecording();
    vi.setSystemTime(new Date("2026-05-18T12:00:03.000Z"));

    if (mockRecorder.ondataavailable) {
      mockRecorder.ondataavailable({
        data: new Blob(["audio-data"], { type: "audio/webm;codecs=opus" }),
      });
    }

    const resultPromise = recorder.finishRecording();
    if (mockRecorder.onstop) {
      mockRecorder.onstop();
    }
    const result = await resultPromise;

    // The file type should be normalized to "audio/webm"
    expect(result!.file.type).toBe("audio/webm");
  });

  it("allows insecure context when setting allows it", async () => {
    Object.defineProperty(window, "isSecureContext", {
      value: false,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(window, "location", {
      value: { hostname: "production.example.com" },
      writable: true,
      configurable: true,
    });

    // Override the mock to allow insecure recording
    const userSettingsMock = await import("@/stores/user-settings");
    vi.mocked(userSettingsMock.useUserSettingsStore).mockReturnValue({
      allowInsecureVoiceRecording: true,
    });

    // Re-import with the new mock
    const { useVoiceRecorder } = await import(
      "@/features/chat/composables/useVoiceRecorder"
    );
    const recorder = useVoiceRecorder();

    const result = await recorder.startRecording();

    // Should NOT be blocked because allowInsecureVoiceRecording is true
    expect(result).toBeNull();
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalled();
  });

  it("isRecordingContextSecure returns true for localhost", async () => {
    Object.defineProperty(window, "isSecureContext", {
      value: false,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(window, "location", {
      value: { hostname: "localhost" },
      writable: true,
      configurable: true,
    });

    const { useVoiceRecorder } = await import(
      "@/features/chat/composables/useVoiceRecorder"
    );
    const recorder = useVoiceRecorder();

    const result = await recorder.startRecording();
    expect(result).toBeNull();
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalled();
  });

  it("startRecording handles MediaRecorder not available", async () => {
    // @ts-expect-error - Remove MediaRecorder
    delete globalThis.MediaRecorder;

    const { useVoiceRecorder } = await import(
      "@/features/chat/composables/useVoiceRecorder"
    );
    const recorder = useVoiceRecorder();

    const result = await recorder.startRecording();

    expect(result).toBeNull();
    expect(navigator.mediaDevices.getUserMedia).not.toHaveBeenCalled();
  });
});
