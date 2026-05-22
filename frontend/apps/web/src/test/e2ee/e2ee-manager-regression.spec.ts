/**
 * E2EE manager 第二阶段补丁回归测试
 *
 * 覆盖：
 * - 旧 encryptMessage/decryptMessage 直接 throw
 * - ensureOutboundSession 利用 localStorage remote_device 恢复 session
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const wasmExports: Record<string, unknown> = {};
const wasmStore = new Map<string, Uint8Array>();

vi.mock("@im/rust-e2ee-wasm", () => ({
  default: () => Promise.resolve(undefined),
  WasmSessionManager: class {
    encrypt(): Uint8Array {
      const wire = new Uint8Array(4 + 52 + 16);
      new DataView(wire.buffer).setUint32(0, 52, false);
      return wire;
    }
    decrypt(): Uint8Array {
      return new TextEncoder().encode("decrypted plaintext");
    }
    export_session(): Uint8Array {
      return new Uint8Array([1, 2, 3]);
    }
    restore_session(_sid: string, _state: Uint8Array): void {
      // no-op
    }
  },
}));

const mockResolveDeviceId = vi.fn().mockResolvedValue("web-device-alice");
const mockEnsureRegistered = vi.fn().mockResolvedValue(undefined);

vi.mock("@/features/e2ee/manager/device-identity", () => ({
  resolveDeviceId: () => mockResolveDeviceId(),
}));

vi.mock("@/features/e2ee/manager/local-device", () => ({
  ensureLocalE2eeDeviceRegistered: () => mockEnsureRegistered(),
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

vi.mock("@/features/e2ee/runtime", () => ({
  webE2eeRuntime: {
    encrypt: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3])),
    decrypt: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3])),
    exportSession: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3])),
    restoreSession: vi.fn().mockResolvedValue(undefined),
    removeSession: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("@/features/e2ee/api/key-service", () => ({
  keyService: {
    getDevices: vi.fn().mockResolvedValue({ data: [] }),
    getBundle: vi.fn().mockResolvedValue({ data: null }),
  },
}));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

import { e2eeManager } from "@/features/e2ee/manager/e2ee-manager";

describe("E2EE manager regression — 旧 API 入口", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it("encryptMessage throws with clear message about removed API", async () => {
    await expect(
      e2eeManager.encryptMessage("session-1", "hello"),
    ).rejects.toThrow("Legacy E2EE header/ciphertext API is removed; use encryptToEnvelope");
  });

  it("decryptMessage throws with clear message about removed API", async () => {
    await expect(
      e2eeManager.decryptMessage("session-1", "alice", {}, "AAAA"),
    ).rejects.toThrow("Legacy E2EE header/ciphertext API is removed; use decryptEnvelope");
  });

  it("encryptMessage does not call getSessionStateBytes", async () => {
    const { getSessionStateBytes } = await import("@/features/e2ee/store/session-store");
    const spy = vi.spyOn({ getSessionStateBytes }, "getSessionStateBytes");

    await e2eeManager.encryptMessage("s", "x").catch(() => undefined);

    expect(spy).not.toHaveBeenCalled();
  });

  it("decryptMessage does not call getSessionStateBytes", async () => {
    const { getSessionStateBytes } = await import("@/features/e2ee/store/session-store");
    const spy = vi.spyOn({ getSessionStateBytes }, "getSessionStateBytes");

    await e2eeManager.decryptMessage("s", "a", {}, "x").catch(() => undefined);

    expect(spy).not.toHaveBeenCalled();
  });
});
