import { NativeModules } from 'react-native';
import {
  bytesToBase64,
  utf8ToBytes,
  type RustLocalE2eeKeyMaterial,
} from '@im/shared-e2ee-core';

import { MobileRustE2eeRuntime } from '@/e2ee/runtime/mobileRustE2eeRuntime';

type NativeRustE2eeModuleMock = {
  generatePreKeyBundle: jest.Mock;
  createOutboundSession: jest.Mock;
  createInboundSession: jest.Mock;
  encrypt: jest.Mock;
  decrypt: jest.Mock;
  exportSession: jest.Mock;
  restoreSession: jest.Mock;
  removeSession: jest.Mock;
};

const writeUint32Be = (bytes: Uint8Array, offset: number, value: number): void => {
  bytes[offset] = Math.floor(value / 2 ** 24) & 0xff;
  bytes[offset + 1] = (value >>> 16) & 0xff;
  bytes[offset + 2] = (value >>> 8) & 0xff;
  bytes[offset + 3] = value & 0xff;
};

const makeHandshake = (signedPreKeyId: number, oneTimePreKeyId: number | null): { bytes: Uint8Array; ephemeralBase64: string } => {
  const bytes = new Uint8Array(40);
  for (let index = 0; index < 32; index += 1) {
    bytes[index] = index + 1;
  }
  writeUint32Be(bytes, 32, signedPreKeyId);
  writeUint32Be(bytes, 36, oneTimePreKeyId ?? 0xffffffff);
  return {
    bytes,
    ephemeralBase64: bytesToBase64(bytes.slice(0, 32)),
  };
};

const b64 = (value: string): string => bytesToBase64(utf8ToBytes(value));

const makeLocalKeys = (): RustLocalE2eeKeyMaterial => ({
  version: 2,
  identityKeyPairBincode: b64('identity-private'),
  signedPreKeyPairBincode: b64('signed-private'),
  oneTimePreKeyPairs: [
    { id: 7, keyPairBincode: b64('otk-private-7'), publicKey: b64('otk-public-7') },
  ],
  publicBundle: {
    identityKey: b64('identity-public'),
    signingKey: b64('signing-public'),
    signedPreKey: { id: 3, key: b64('signed-public') },
    signedPreKeySignature: b64('signature'),
    oneTimePreKeys: [{ id: 7, key: b64('otk-public-7') }],
  },
});

const installNativeModule = (): NativeRustE2eeModuleMock => {
  const module: NativeRustE2eeModuleMock = {
    generatePreKeyBundle: jest.fn(),
    createOutboundSession: jest.fn(),
    createInboundSession: jest.fn(async () => undefined),
    encrypt: jest.fn(),
    decrypt: jest.fn(),
    exportSession: jest.fn(),
    restoreSession: jest.fn(),
    removeSession: jest.fn(),
  };
  (NativeModules as Record<string, unknown>).RustE2eeModule = module;
  return module;
};

describe('MobileRustE2eeRuntime inbound OTK handling', () => {
  afterEach(() => {
    delete (NativeModules as Record<string, unknown>).RustE2eeModule;
  });

  it('passes the matching one-time pre-key pair when the handshake references an OTK', async () => {
    const nativeModule = installNativeModule();
    const runtime = new MobileRustE2eeRuntime();
    const localKeys = makeLocalKeys();
    const handshake = makeHandshake(3, 7);

    await expect(runtime.createInboundSession({
      sessionId: 'alice_bob',
      localKeys,
      remoteIdentityKey: b64('remote-identity'),
      handshake: bytesToBase64(handshake.bytes),
    })).resolves.toBeUndefined();

    expect(nativeModule.createInboundSession).toHaveBeenCalledWith(
      'alice_bob',
      localKeys.identityKeyPairBincode,
      localKeys.signedPreKeyPairBincode,
      b64('otk-private-7'),
      b64('remote-identity'),
      handshake.ephemeralBase64,
    );
  });

  it('rejects and skips native inbound creation when the referenced OTK is missing', async () => {
    const nativeModule = installNativeModule();
    const runtime = new MobileRustE2eeRuntime();
    const localKeys = {
      ...makeLocalKeys(),
      oneTimePreKeyPairs: [],
    };
    const handshake = makeHandshake(3, 7);

    await expect(runtime.createInboundSession({
      sessionId: 'alice_bob',
      localKeys,
      remoteIdentityKey: b64('remote-identity'),
      handshake: bytesToBase64(handshake.bytes),
    })).rejects.toThrow('missing one-time pre-key: 7');

    expect(nativeModule.createInboundSession).not.toHaveBeenCalled();
  });

  it('allows null one-time pre-key pair when the handshake does not reference an OTK', async () => {
    const nativeModule = installNativeModule();
    const runtime = new MobileRustE2eeRuntime();
    const localKeys = {
      ...makeLocalKeys(),
      oneTimePreKeyPairs: [],
    };
    const handshake = makeHandshake(3, null);

    await expect(runtime.createInboundSession({
      sessionId: 'alice_bob',
      localKeys,
      remoteIdentityKey: b64('remote-identity'),
      handshake: handshake.bytes,
    })).resolves.toBeUndefined();

    expect(nativeModule.createInboundSession).toHaveBeenCalledWith(
      'alice_bob',
      localKeys.identityKeyPairBincode,
      localKeys.signedPreKeyPairBincode,
      null,
      b64('remote-identity'),
      handshake.ephemeralBase64,
    );
  });
});
