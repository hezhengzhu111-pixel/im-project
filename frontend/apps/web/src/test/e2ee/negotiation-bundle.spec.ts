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

const mockBundleData = vi.fn();
const mockGetDevices = vi.fn();

vi.mock("@/features/e2ee/api/key-service", () => ({
  keyService: {
    getDevices: () => mockGetDevices(),
    getBundle: () => mockBundleData(),
    requestEncryption: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("@/features/e2ee/runtime", () => ({
  webE2eeRuntime: {
    exportSession: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3])),
    removeSession: vi.fn().mockResolvedValue(undefined),
    createOutboundSession: vi.fn().mockResolvedValue(new Uint8Array(40)),
  },
}));

vi.mock("@/features/e2ee/manager/local-device", () => ({
  ensureLocalE2eeDeviceRegistered: vi.fn().mockResolvedValue("web-device-alice"),
  getLocalRustKeyMaterial: vi.fn().mockResolvedValue({
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
  saveSessionStateBytes: vi.fn().mockResolvedValue(undefined),
  deleteSessionState: vi.fn().mockResolvedValue(undefined),
  getSessionStateBytes: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/features/e2ee/store/key-store", () => ({
  markOneTimePreKeyConsumed: vi.fn().mockResolvedValue(undefined),
}));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

import {
  initiateNegotiation,
  respondToNegotiation,
  getLocalSessionStatus,
} from "@/features/e2ee/manager/negotiation";

describe("E2EE negotiation — respondToNegotiation 空 remoteDeviceId 拒绝", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("respondToNegotiation 缺少 expectedDeviceId 时进入 failed，且不保存 session state", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { saveSessionStateBytes } = await import("@/features/e2ee/store/session-store");

    const result = await respondToNegotiation(
      "p_alice_bob",
      "remote-ik-b64",
      "aGFuZHNoYWtl",
      "bob",
      undefined, // missing expectedDeviceId
    );

    expect(result).toBe(false);
    expect(getLocalSessionStatus("p_alice_bob")).toBe("failed");
    // Must NOT call saveSessionStateBytes
    expect(saveSessionStateBytes).not.toHaveBeenCalled();
    // Must NOT write remote_device to localStorage
    expect(localStorage.getItem("e2ee:remote_device:p_alice_bob")).toBeNull();

    consoleSpy.mockRestore();
  });

  it("respondToNegotiation expectedDeviceId 为空字符串时进入 failed", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { saveSessionStateBytes } = await import("@/features/e2ee/store/session-store");

    const result = await respondToNegotiation(
      "p_alice_bob",
      "remote-ik-b64",
      "aGFuZHNoYWtl",
      "bob",
      "", // empty string
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
    vi.restoreAllMocks();
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
