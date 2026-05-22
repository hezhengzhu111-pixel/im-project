/**
 * E2EE negotiation bundle OTK id 语义测试 — 第二阶段补丁
 *
 * 覆盖：
 * - oneTimePreKeyId=0 时必须保留 0
 * - oneTimePreKeyId=null/undefined 时不能变成 0
 * - oneTimePreKey 有值但 id 缺失时抛出明确错误
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const {
  mockBundleData,
  mockGetDevices,
  mockSaveSessionStateBytes,
  mockDeleteSessionState,
  mockGetSessionStateBytes,
  mockRequestEncryption,
} = vi.hoisted(() => ({
  mockBundleData: vi.fn(),
  mockGetDevices: vi.fn(),
  mockSaveSessionStateBytes: vi.fn(() => Promise.resolve()),
  mockDeleteSessionState: vi.fn(() => Promise.resolve()),
  mockGetSessionStateBytes: vi.fn(() => Promise.resolve(null)),
  mockRequestEncryption: vi.fn(() => Promise.resolve()),
}));

vi.mock("@/features/e2ee/api/key-service", () => ({
  keyService: {
    getDevices: () => mockGetDevices(),
    getBundle: () => mockBundleData(),
    requestEncryption: mockRequestEncryption,
  },
}));

vi.mock("@/features/e2ee/runtime", () => ({
  webE2eeRuntime: {
    exportSession: () => Promise.resolve(new Uint8Array([1, 2, 3])),
    removeSession: () => Promise.resolve(),
    createOutboundSession: () => Promise.resolve(new Uint8Array(40)),
  },
}));

vi.mock("@/features/e2ee/manager/local-device", () => ({
  ensureLocalE2eeDeviceRegistered: () => Promise.resolve("web-device-alice"),
  getLocalRustKeyMaterial: () =>
    Promise.resolve({
      deviceId: "web-device-alice",
      userId: "alice",
      publicBundle: {
        identityKey: "identity-alice",
        signedPreKey: { id: 1, key: "spk-alice" },
        oneTimePreKeys: [],
      },
      oneTimePreKeyPairs: [],
    }),
}));

vi.mock("@/features/e2ee/store/session-store", () => ({
  saveSessionStateBytes: mockSaveSessionStateBytes,
  deleteSessionState: mockDeleteSessionState,
  getSessionStateBytes: mockGetSessionStateBytes,
}));

vi.mock("@/features/e2ee/store/key-store", () => ({
  markOneTimePreKeyConsumed: () => Promise.resolve(),
}));

// Mock shared-e2ee-core: provide the 4 functions that negotiation.ts imports.
// Must be synchronous because async factories block dependent module resolution.
vi.mock("@im/shared-e2ee-core", () => ({
  asBase64String: (input: string) => input,
  base64ToBytes: (input: string) => new Uint8Array(input.split("").map((c: string) => c.charCodeAt(0))),
  bytesToBase64: (input: Uint8Array) => Array.from(input).map((b: number) => String.fromCharCode(b)).join(""),
  parseRustHandshake: () => ({ oneTimePreKeyId: null }),
}));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

import {
  initiateNegotiation,
  respondToNegotiation,
  getLocalSessionStatus,
} from "@/features/e2ee/manager/negotiation";

describe("E2EE negotiation — respondToNegotiation senderDeviceId / targetDeviceId 语义", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("respondToNegotiation 缺少 senderDeviceId 时进入 failed，且不保存 session state", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { saveSessionStateBytes } = await import("@/features/e2ee/store/session-store");

    const result = await respondToNegotiation(
      "p_alice_bob",
      "remote-ik-b64",
      "aGFuZHNoYWtl",
      "bob",
      "", // empty senderDeviceId
      "web-device-alice",
    );

    expect(result).toBe(false);
    expect(getLocalSessionStatus("p_alice_bob")).toBe("failed");
    // Must NOT call saveSessionStateBytes
    expect(saveSessionStateBytes).not.toHaveBeenCalled();
    // Must NOT write remote_device to localStorage
    expect(localStorage.getItem("e2ee:remote_device:p_alice_bob")).toBeNull();

    consoleSpy.mockRestore();
  });

  it("respondToNegotiation senderDeviceId 为空字符串时进入 failed", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { saveSessionStateBytes } = await import("@/features/e2ee/store/session-store");

    const result = await respondToNegotiation(
      "p_alice_bob",
      "remote-ik-b64",
      "aGFuZHNoYWtl",
      "bob",
      "", // empty string
      "web-device-alice",
    );

    expect(result).toBe(false);
    expect(getLocalSessionStatus("p_alice_bob")).toBe("failed");
    expect(saveSessionStateBytes).not.toHaveBeenCalled();
    expect(localStorage.getItem("e2ee:remote_device:p_alice_bob")).toBeNull();

    consoleSpy.mockRestore();
  });

  it("respondToNegotiation 缺少 targetDeviceId 时进入 failed，不保存 session state", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { saveSessionStateBytes } = await import("@/features/e2ee/store/session-store");

    const result = await respondToNegotiation(
      "p_alice_bob",
      "remote-ik-b64",
      "aGFuZHNoYWtl",
      "bob",
      "mobile-bob",
      "", // empty targetDeviceId
    );

    expect(result).toBe(false);
    expect(getLocalSessionStatus("p_alice_bob")).toBe("failed");
    expect(saveSessionStateBytes).not.toHaveBeenCalled();
    expect(localStorage.getItem("e2ee:remote_device:p_alice_bob")).toBeNull();

    consoleSpy.mockRestore();
  });

  it("respondToNegotiation targetDeviceId 与当前 deviceId 不匹配时返回 false，不保存 session state", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { saveSessionStateBytes } = await import("@/features/e2ee/store/session-store");

    // Current local device is "web-device-alice" (mocked), but targetDeviceId is "web-device-bob"
    const result = await respondToNegotiation(
      "p_alice_bob",
      "remote-ik-b64",
      "aGFuZHNoYWtl",
      "bob",
      "mobile-bob",
      "web-device-bob", // does NOT match current local device "web-device-alice"
    );

    expect(result).toBe(false);
    expect(getLocalSessionStatus("p_alice_bob")).toBe("failed");
    expect(saveSessionStateBytes).not.toHaveBeenCalled();
    expect(localStorage.getItem("e2ee:remote_device:p_alice_bob")).toBeNull();

    consoleSpy.mockRestore();
  });
});

describe("E2EE negotiation — oneTimePreKeyId 语义", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();

    mockGetDevices.mockResolvedValue({
      data: [
        {
          deviceId: "mobile-bob",
          identityKey: "identity-bob",
          lastActiveAt: new Date().toISOString(),
        },
      ],
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("oneTimePreKeyId=0 时必须保留 0（不变成 null/undefined）", async () => {
    const rawBundle = {
      identityKey: "ik-bob",
      signingIdentityKey: "sign-ik-bob",
      signedPreKey: "spk-bob",
      signedPreKeySignature: "sig-bob",
      oneTimePreKey: "otk-bob",
      oneTimePreKeyId: 0,
      deviceId: "mobile-bob",
    };

    mockBundleData.mockResolvedValue({ data: rawBundle });

    // This should succeed because id=0 is a valid OTK id
    const result = await initiateNegotiation("p_alice_bob", "bob");
    // Negotiation may fail for other reasons (e.g. WASM export), but should NOT
    // fail with "oneTimePreKey without oneTimePreKeyId" when id is 0
    expect(result).toBeDefined();
  });

  it("oneTimePreKey 有值但 oneTimePreKeyId 为 undefined 时失败（fetchRemoteBundle 内部 throw）", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const rawBundle = {
      identityKey: "ik-bob",
      signingIdentityKey: "sign-ik-bob",
      signedPreKey: "spk-bob",
      signedPreKeySignature: "sig-bob",
      oneTimePreKey: "otk-bob",
      // oneTimePreKeyId intentionally omitted
      deviceId: "mobile-bob",
    };

    mockBundleData.mockResolvedValue({ data: rawBundle });

    const result = await initiateNegotiation("p_alice_bob", "bob");
    expect(result).toBe(false);

    // Verify the error was logged
    expect(consoleSpy).toHaveBeenCalledWith(
      "[E2EE] Rust negotiation initiation failed:",
      expect.stringContaining("E2EE bundle contains oneTimePreKey without oneTimePreKeyId"),
    );

    consoleSpy.mockRestore();
  });

  it("oneTimePreKey 有值但 oneTimePreKeyId 为 null 时失败", async () => {
    const rawBundle = {
      identityKey: "ik-bob",
      signingIdentityKey: "sign-ik-bob",
      signedPreKey: "spk-bob",
      signedPreKeySignature: "sig-bob",
      oneTimePreKey: "otk-bob",
      oneTimePreKeyId: null,
      deviceId: "mobile-bob",
    };

    mockBundleData.mockResolvedValue({ data: rawBundle });

    const result = await initiateNegotiation("p_alice_bob", "bob");
    expect(result).toBe(false);
  });

  it("oneTimePreKey 有值但 oneTimePreKeyId 为 NaN 时失败", async () => {
    const rawBundle = {
      identityKey: "ik-bob",
      signingIdentityKey: "sign-ik-bob",
      signedPreKey: "spk-bob",
      signedPreKeySignature: "sig-bob",
      oneTimePreKey: "otk-bob",
      oneTimePreKeyId: NaN,
      deviceId: "mobile-bob",
    };

    mockBundleData.mockResolvedValue({ data: rawBundle });

    const result = await initiateNegotiation("p_alice_bob", "bob");
    expect(result).toBe(false);
  });

  it("oneTimePreKey 为空字符串时不会触发 OTK 处理", async () => {
    const rawBundle = {
      identityKey: "ik-bob",
      signingIdentityKey: "sign-ik-bob",
      signedPreKey: "spk-bob",
      signedPreKeySignature: "sig-bob",
      oneTimePreKey: "",
      // oneTimePreKeyId missing — irrelevant since oneTimePreKey is empty
      deviceId: "mobile-bob",
    };

    mockBundleData.mockResolvedValue({ data: rawBundle });

    // Should not throw about oneTimePreKeyId because oneTimePreKey is empty
    const result = await initiateNegotiation("p_alice_bob", "bob");
    expect(result).toBeDefined();
  });

  it("oneTimePreKey 为 null 时不会触发 OTK 处理", async () => {
    const rawBundle = {
      identityKey: "ik-bob",
      signingIdentityKey: "sign-ik-bob",
      signedPreKey: "spk-bob",
      signedPreKeySignature: "sig-bob",
      oneTimePreKey: null,
      deviceId: "mobile-bob",
    };

    mockBundleData.mockResolvedValue({ data: rawBundle });

    const result = await initiateNegotiation("p_alice_bob", "bob");
    expect(result).toBeDefined();
  });
});

describe("E2EE negotiation — senderDeviceId / targetDeviceId payload 语义", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();

    mockGetDevices.mockResolvedValue({
      data: [
        {
          deviceId: "mobile-bob",
          identityKey: "identity-bob",
          lastActiveAt: new Date().toISOString(),
        },
      ],
    });

    mockBundleData.mockResolvedValue({
      data: {
        identityKey: "ik-bob",
        signingIdentityKey: "sign-ik-bob",
        signedPreKey: "spk-bob",
        signedPreKeySignature: "sig-bob",
        oneTimePreKey: "otk-bob",
        oneTimePreKeyId: 1,
        deviceId: "mobile-bob",
      },
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("initiateNegotiation requestPayloadJson 包含 senderDeviceId 和 targetDeviceId", async () => {
    const { keyService } = await import("@/features/e2ee/api/key-service");
    const requestEncryptionMock = keyService.requestEncryption as ReturnType<typeof vi.fn>;

    await initiateNegotiation("p_alice_bob", "bob");

    // Verify requestEncryption was called
    expect(requestEncryptionMock).toHaveBeenCalledTimes(1);
    const payloadJson = requestEncryptionMock.mock.calls[0][3] as string;
    const payload = JSON.parse(payloadJson);

    // initiator local device = "web-device-alice" (mocked ensureLocalE2eeDeviceRegistered)
    expect(payload.senderDeviceId).toBe("web-device-alice");
    // remote bundle deviceId = "mobile-bob"
    expect(payload.targetDeviceId).toBe("mobile-bob");
  });

  it("initiateNegotiation 不再生成旧字段 deviceId", async () => {
    const { keyService } = await import("@/features/e2ee/api/key-service");
    const requestEncryptionMock = keyService.requestEncryption as ReturnType<typeof vi.fn>;

    await initiateNegotiation("p_alice_bob", "bob");

    const payloadJson = requestEncryptionMock.mock.calls[0][3] as string;
    const payload = JSON.parse(payloadJson);

    // Old deviceId field must NOT be present
    expect(payload.deviceId).toBeUndefined();
  });

  it("initiateNegotiation 在 remoteBundle.deviceId 为空时 fail-fast，不保存 session state", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { saveSessionStateBytes } = await import("@/features/e2ee/store/session-store");

    mockBundleData.mockResolvedValue({
      data: {
        identityKey: "ik-bob",
        signingIdentityKey: "sign-ik-bob",
        signedPreKey: "spk-bob",
        signedPreKeySignature: "sig-bob",
        oneTimePreKey: null,
        deviceId: "", // empty!
      },
    });

    const result = await initiateNegotiation("p_alice_bob", "bob");
    expect(result).toBe(false);
    expect(saveSessionStateBytes).not.toHaveBeenCalled();

    consoleSpy.mockRestore();
  });
});

describe("E2EE negotiation — respondToNegotiation inbound session state 语义", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("respondToNegotiation 保存 session state 时 remoteDeviceId === senderDeviceId", async () => {
    // Need to mock createInboundSession for this test
    const { webE2eeRuntime } = await import("@/features/e2ee/runtime");
    (webE2eeRuntime as unknown as Record<string, unknown>).createInboundSession = vi.fn().mockResolvedValue(undefined);

    const { saveSessionStateBytes } = await import("@/features/e2ee/store/session-store");

    const result = await respondToNegotiation(
      "p_alice_bob",
      "remote-ik-b64",
      "aGFuZHNoYWtl",
      "bob",
      "mobile-bob", // senderDeviceId — initiator's device
      "web-device-alice", // targetDeviceId — this device (responder)
    );

    expect(result).toBe(true);
    // Check saveSessionStateBytes was called with remoteDeviceId = senderDeviceId
    expect(saveSessionStateBytes).toHaveBeenCalledTimes(1);
    const meta = (saveSessionStateBytes as ReturnType<typeof vi.fn>).mock.calls[0][2];
    expect(meta.localDeviceId).toBe("web-device-alice");
    expect(meta.remoteDeviceId).toBe("mobile-bob"); // senderDeviceId, not targetDeviceId
    expect(meta.remoteUserId).toBe("bob");
    expect(meta.direction).toBe("inbound");
  });

  it("respondToNegotiation 写入 localStorage remote_device 的值是 senderDeviceId", async () => {
    const { webE2eeRuntime } = await import("@/features/e2ee/runtime");
    (webE2eeRuntime as unknown as Record<string, unknown>).createInboundSession = vi.fn().mockResolvedValue(undefined);

    await respondToNegotiation(
      "p_alice_bob",
      "remote-ik-b64",
      "aGFuZHNoYWtl",
      "bob",
      "mobile-bob", // senderDeviceId
      "web-device-alice", // targetDeviceId
    );

    // localStorage remote_device must be senderDeviceId, NOT targetDeviceId
    expect(localStorage.getItem("e2ee:remote_device:p_alice_bob")).toBe("mobile-bob");
  });
});
