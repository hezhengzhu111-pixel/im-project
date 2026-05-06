import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveDeviceId: vi.fn(),
  getLocalPublicBundle: vi.fn(),
  hasIdentityKey: vi.fn(),
  saveIdentityKeyPair: vi.fn(),
  saveLocalPublicBundle: vi.fn(),
  saveSignedPreKey: vi.fn(),
  generateKeyBundle: vi.fn(),
  uploadBundle: vi.fn(),
}));

vi.mock("@/utils/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

vi.mock("@/features/e2ee/manager/device-identity", () => ({
  resolveDeviceId: (...args: unknown[]) => mocks.resolveDeviceId(...args),
}));

vi.mock("@/features/e2ee/store/key-store", () => ({
  getLocalPublicBundle: (...args: unknown[]) =>
    mocks.getLocalPublicBundle(...args),
  hasIdentityKey: (...args: unknown[]) => mocks.hasIdentityKey(...args),
  saveIdentityKeyPair: (...args: unknown[]) =>
    mocks.saveIdentityKeyPair(...args),
  saveLocalPublicBundle: (...args: unknown[]) =>
    mocks.saveLocalPublicBundle(...args),
  saveSignedPreKey: (...args: unknown[]) => mocks.saveSignedPreKey(...args),
}));

vi.mock("@/features/e2ee/engine/x3dh", () => ({
  generateKeyBundle: (...args: unknown[]) => mocks.generateKeyBundle(...args),
}));

vi.mock("@/features/e2ee/api/key-service", () => ({
  keyService: {
    uploadBundle: (...args: unknown[]) => mocks.uploadBundle(...args),
  },
}));

import { ensureLocalE2eeDeviceRegistered } from "@/features/e2ee/manager/local-device";

const localBundle = {
  version: 2 as const,
  identityKey: "identity",
  signingIdentityKey: "signing",
  signedPreKey: "signed-pre",
  signedPreKeySignature: "signature",
};

describe("local E2EE device registration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveDeviceId.mockResolvedValue("device-1");
    mocks.uploadBundle.mockResolvedValue({ code: 200, data: "ok" });
  });

  it("uploads an existing local bundle for the current authenticated account", async () => {
    mocks.hasIdentityKey.mockResolvedValue(true);
    mocks.getLocalPublicBundle.mockResolvedValue(localBundle);

    const deviceId = await ensureLocalE2eeDeviceRegistered();

    expect(deviceId).toBe("device-1");
    expect(mocks.generateKeyBundle).not.toHaveBeenCalled();
    expect(mocks.uploadBundle).toHaveBeenCalledWith({
      deviceId: "device-1",
      identityKey: "identity",
      signingIdentityKey: "signing",
      signedPreKey: "signed-pre",
      signedPreKeySignature: "signature",
      oneTimePreKeys: [],
    });
  });

  it("generates, stores, and uploads a new bundle when local keys are missing", async () => {
    mocks.hasIdentityKey.mockResolvedValue(false);
    mocks.getLocalPublicBundle.mockResolvedValue(null);
    mocks.generateKeyBundle.mockResolvedValue({
      identityKeyPair: "identity-key-pair",
      signedPreKeyPair: "signed-pre-key-pair",
      bundle: {
        identityKey: "new-identity",
        signingIdentityKey: "new-signing",
        signedPreKey: "new-signed-pre",
        signedPreKeySignature: "new-signature",
      },
    });

    await ensureLocalE2eeDeviceRegistered();

    expect(mocks.saveIdentityKeyPair).toHaveBeenCalledWith(
      "identity-key-pair",
    );
    expect(mocks.saveSignedPreKey).toHaveBeenCalledWith(
      1,
      "signed-pre-key-pair",
    );
    expect(mocks.saveLocalPublicBundle).toHaveBeenCalledWith({
      version: 2,
      identityKey: "new-identity",
      signingIdentityKey: "new-signing",
      signedPreKey: "new-signed-pre",
      signedPreKeySignature: "new-signature",
    });
    expect(mocks.uploadBundle).toHaveBeenCalledWith({
      deviceId: "device-1",
      identityKey: "new-identity",
      signingIdentityKey: "new-signing",
      signedPreKey: "new-signed-pre",
      signedPreKeySignature: "new-signature",
      oneTimePreKeys: [],
    });
  });
});
