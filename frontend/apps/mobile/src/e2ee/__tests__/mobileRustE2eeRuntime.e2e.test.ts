import { NativeModules } from 'react-native';
import {
  base64ToBytes,
  bytesToBase64,
  bytesToUtf8,
  concatBytes,
  utf8ToBytes,
  type Base64String,
  type RustLocalE2eeKeyMaterial,
  type RustPreKey,
  type RustPublicPreKeyBundle,
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

type MockKeyMaterial = {
  identityPrivate: string;
  identityPublic: string;
  signedPreKeyPrivate: string;
  signedPreKeyPublic: string;
  oneTimePreKeyPairs: Array<{ id: number; privateKey: string; publicKey: string }>;
};

type RemoteBundle = {
  identityKey: string;
  signedPreKey: RustPreKey;
  oneTimePreKey: RustPreKey | null;
};

type MockSession = {
  sessionId: string;
  secret: string;
  nextSequence: number;
};

const RUST_RATCHET_HEADER_LEN = 52;
const WIRE_PREFIX_LEN = 4;

const writeUint32Be = (bytes: Uint8Array, offset: number, value: number): void => {
  bytes[offset] = Math.floor(value / 2 ** 24) & 0xff;
  bytes[offset + 1] = (value >>> 16) & 0xff;
  bytes[offset + 2] = (value >>> 8) & 0xff;
  bytes[offset + 3] = value & 0xff;
};

const readUint32Be = (bytes: Uint8Array, offset: number): number => {
  if (bytes.byteLength < offset + 4) {
    throw new Error('RUST_E2EE_CRYPTO: wire authentication failed');
  }
  return ((bytes[offset] * 2 ** 24) + (bytes[offset + 1] << 16) + (bytes[offset + 2] << 8) + bytes[offset + 3]) >>> 0;
};

const digestBytes = (label: string, length: number): Uint8Array => {
  let seed = 0x811c9dc5;
  for (let index = 0; index < label.length; index += 1) {
    seed = Math.imul(seed ^ label.charCodeAt(index), 0x01000193) >>> 0;
  }
  const output = new Uint8Array(length);
  for (let index = 0; index < length; index += 1) {
    seed = Math.imul(seed ^ index, 0x01000193) >>> 0;
    output[index] = seed & 0xff;
  }
  return output;
};

const fixedKey = (label: string): Base64String => bytesToBase64(digestBytes(label, 32));

const tagFor = (secret: string, sequence: number, plaintextBase64: string): Base64String =>
  bytesToBase64(digestBytes(`${secret}:${sequence}:${plaintextBase64}`, 16));

const deriveSecret = (input: {
  aliceIdentityPublic: string;
  bobIdentityPublic: string;
  bobSignedPreKeyPublic: string;
  bobOneTimePreKeyPublic: string | null;
  ephemeralPublic: string;
}): Base64String =>
  bytesToBase64(utf8ToBytes([
    input.aliceIdentityPublic,
    input.bobIdentityPublic,
    input.bobSignedPreKeyPublic,
    input.bobOneTimePreKeyPublic ?? 'NO_OTK',
    input.ephemeralPublic,
  ].join('|')));

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const byteArrayFieldToBase64 = (value: unknown, label: string): Base64String => {
  if (!Array.isArray(value)) {
    throw new Error(`invalid ${label}`);
  }
  return bytesToBase64(Uint8Array.from(value.map((item) => {
    if (!Number.isInteger(item) || item < 0 || item > 255) {
      throw new Error(`invalid ${label}`);
    }
    return item;
  })));
};

const parseRemotePreKey = (value: unknown, label: string): RustPreKey => {
  if (!isRecord(value) || typeof value.id !== 'number') {
    throw new Error(`invalid ${label}`);
  }
  return {
    id: value.id,
    key: byteArrayFieldToBase64(value.key, `${label}.key`),
  };
};

const parseRemoteBundleJson = (remoteBundleJson: string): RemoteBundle => {
  const parsed = JSON.parse(remoteBundleJson) as unknown;
  if (!isRecord(parsed)) {
    throw new Error('invalid remote bundle');
  }
  return {
    identityKey: byteArrayFieldToBase64(parsed.identity_key, 'identity_key'),
    signedPreKey: parseRemotePreKey(parsed.signed_pre_key, 'signed_pre_key'),
    oneTimePreKey: parsed.one_time_pre_key == null
      ? null
      : parseRemotePreKey(parsed.one_time_pre_key, 'one_time_pre_key'),
  };
};

const handshakeBytes = (
  ephemeralPublic: string,
  signedPreKeyId: number,
  oneTimePreKeyId: number | null,
): Uint8Array => {
  const bytes = new Uint8Array(40);
  bytes.set(base64ToBytes(ephemeralPublic), 0);
  writeUint32Be(bytes, 32, signedPreKeyId);
  writeUint32Be(bytes, 36, oneTimePreKeyId ?? 0xffffffff);
  return bytes;
};

const authenticatedWire = (session: MockSession, plaintextBase64: string): Base64String => {
  const sequence = session.nextSequence;
  session.nextSequence += 1;
  const header = digestBytes(`header:${session.secret}:${sequence}`, RUST_RATCHET_HEADER_LEN);
  const payload = utf8ToBytes(JSON.stringify({
    sequence,
    plaintext: plaintextBase64,
    tag: tagFor(session.secret, sequence, plaintextBase64),
  }));
  const prefix = new Uint8Array(WIRE_PREFIX_LEN);
  writeUint32Be(prefix, 0, RUST_RATCHET_HEADER_LEN);
  return bytesToBase64(concatBytes(prefix, header, payload));
};

const authenticationError = (): Error =>
  new Error('RUST_E2EE_CRYPTO: wire authentication failed');

const sessionNotFoundError = (sessionId: string): Error =>
  new Error(`RUST_E2EE_SESSION_NOT_FOUND: ${sessionId}`);

class StatefulRustE2eeNativeMock {
  readonly module: NativeRustE2eeModuleMock;

  private readonly keyByIdentityPrivate = new Map<string, MockKeyMaterial>();
  private readonly publicByPrivate = new Map<string, string>();
  private readonly sessions = new Map<string, MockSession>();
  private keyGeneration = 0;
  private ephemeralGeneration = 0;

  constructor(private readonly owner: string) {
    this.module = {
      generatePreKeyBundle: jest.fn(this.generatePreKeyBundle),
      createOutboundSession: jest.fn(this.createOutboundSession),
      createInboundSession: jest.fn(this.createInboundSession),
      encrypt: jest.fn(this.encrypt),
      decrypt: jest.fn(this.decrypt),
      exportSession: jest.fn(this.exportSession),
      restoreSession: jest.fn(this.restoreSession),
      removeSession: jest.fn(this.removeSession),
    };
  }

  private readonly generatePreKeyBundle = async (
    signedPreKeyId: number,
    oneTimePreKeyStartId: number,
    oneTimePreKeyCount: number,
  ): Promise<string> => {
    this.keyGeneration += 1;
    const namespace = `${this.owner}:keys:${this.keyGeneration}`;
    const oneTimePreKeyPairs = Array.from({ length: oneTimePreKeyCount }, (_unused, index) => ({
      id: oneTimePreKeyStartId + index,
      privateKey: fixedKey(`${namespace}:otk:${index}:private`),
      publicKey: fixedKey(`${namespace}:otk:${index}:public`),
    }));
    const material: MockKeyMaterial = {
      identityPrivate: fixedKey(`${namespace}:identity:private`),
      identityPublic: fixedKey(`${namespace}:identity:public`),
      signedPreKeyPrivate: fixedKey(`${namespace}:signed:${signedPreKeyId}:private`),
      signedPreKeyPublic: fixedKey(`${namespace}:signed:${signedPreKeyId}:public`),
      oneTimePreKeyPairs,
    };
    this.keyByIdentityPrivate.set(material.identityPrivate, material);
    this.publicByPrivate.set(material.identityPrivate, material.identityPublic);
    this.publicByPrivate.set(material.signedPreKeyPrivate, material.signedPreKeyPublic);
    for (const pair of oneTimePreKeyPairs) {
      this.publicByPrivate.set(pair.privateKey, pair.publicKey);
    }

    const publicOneTimePreKeys = oneTimePreKeyPairs.map((pair) => ({
      id: pair.id,
      key: pair.publicKey,
    }));
    const keyMaterial: RustLocalE2eeKeyMaterial = {
      version: 2,
      identityKeyPairBincode: material.identityPrivate,
      signedPreKeyPairBincode: material.signedPreKeyPrivate,
      oneTimePreKeyPairs: oneTimePreKeyPairs.map((pair) => ({
        id: pair.id,
        keyPairBincode: pair.privateKey,
        publicKey: pair.publicKey,
      })),
      publicBundle: {
        identityKey: material.identityPublic,
        signingKey: fixedKey(`${namespace}:signing:public`),
        signedPreKey: {
          id: signedPreKeyId,
          key: material.signedPreKeyPublic,
        },
        signedPreKeySignature: fixedKey(`${namespace}:signed:${signedPreKeyId}:signature`),
        oneTimePreKey: publicOneTimePreKeys[0] ?? null,
        oneTimePreKeys: publicOneTimePreKeys,
      },
    };
    return JSON.stringify(keyMaterial);
  };

  private readonly createOutboundSession = async (
    sessionId: string,
    identityKeyPairBincodeBase64: string,
    remoteBundleJson: string,
  ): Promise<string> => {
    const localKeys = this.keyByIdentityPrivate.get(identityKeyPairBincodeBase64);
    if (!localKeys) {
      throw sessionNotFoundError(sessionId);
    }
    const remoteBundle = parseRemoteBundleJson(remoteBundleJson);
    this.ephemeralGeneration += 1;
    const ephemeralPublic = fixedKey(`${this.owner}:ephemeral:${this.ephemeralGeneration}`);
    const secret = deriveSecret({
      aliceIdentityPublic: localKeys.identityPublic,
      bobIdentityPublic: remoteBundle.identityKey,
      bobSignedPreKeyPublic: remoteBundle.signedPreKey.key,
      bobOneTimePreKeyPublic: remoteBundle.oneTimePreKey?.key ?? null,
      ephemeralPublic,
    });
    this.sessions.set(sessionId, { sessionId, secret, nextSequence: 0 });
    return bytesToBase64(handshakeBytes(
      ephemeralPublic,
      remoteBundle.signedPreKey.id,
      remoteBundle.oneTimePreKey?.id ?? null,
    ));
  };

  private readonly createInboundSession = async (
    sessionId: string,
    identityKeyPairBincodeBase64: string,
    signedPreKeyPairBincodeBase64: string,
    oneTimePreKeyPairBincodeBase64: string | null,
    remoteIdentityKeyBase64: string,
    remoteEphemeralKeyBase64: string,
  ): Promise<void> => {
    const identityPublic = this.publicByPrivate.get(identityKeyPairBincodeBase64);
    const signedPreKeyPublic = this.publicByPrivate.get(signedPreKeyPairBincodeBase64);
    const oneTimePreKeyPublic = oneTimePreKeyPairBincodeBase64 == null
      ? null
      : this.publicByPrivate.get(oneTimePreKeyPairBincodeBase64) ?? null;
    if (!identityPublic || !signedPreKeyPublic || (oneTimePreKeyPairBincodeBase64 != null && !oneTimePreKeyPublic)) {
      throw sessionNotFoundError(sessionId);
    }
    const secret = deriveSecret({
      aliceIdentityPublic: remoteIdentityKeyBase64,
      bobIdentityPublic: identityPublic,
      bobSignedPreKeyPublic: signedPreKeyPublic,
      bobOneTimePreKeyPublic: oneTimePreKeyPublic,
      ephemeralPublic: remoteEphemeralKeyBase64,
    });
    this.sessions.set(sessionId, { sessionId, secret, nextSequence: 0 });
  };

  private readonly encrypt = async (sessionId: string, plaintextBase64: string): Promise<string> => {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw sessionNotFoundError(sessionId);
    }
    base64ToBytes(plaintextBase64);
    return authenticatedWire(session, plaintextBase64);
  };

  private readonly decrypt = async (sessionId: string, encryptedWireBase64: string): Promise<string> => {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw sessionNotFoundError(sessionId);
    }
    const wire = base64ToBytes(encryptedWireBase64);
    const headerLength = readUint32Be(wire, 0);
    if (headerLength !== RUST_RATCHET_HEADER_LEN || wire.byteLength <= WIRE_PREFIX_LEN + headerLength) {
      throw authenticationError();
    }
    try {
      const body = JSON.parse(bytesToUtf8(wire.slice(WIRE_PREFIX_LEN + headerLength))) as unknown;
      if (!isRecord(body) || typeof body.sequence !== 'number' || typeof body.plaintext !== 'string' || typeof body.tag !== 'string') {
        throw authenticationError();
      }
      if (body.tag !== tagFor(session.secret, body.sequence, body.plaintext)) {
        throw authenticationError();
      }
      return body.plaintext;
    } catch {
      throw authenticationError();
    }
  };

  private readonly exportSession = async (sessionId: string): Promise<string> => {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw sessionNotFoundError(sessionId);
    }
    return bytesToBase64(utf8ToBytes(JSON.stringify(session)));
  };

  private readonly restoreSession = async (sessionId: string, stateBincodeBase64: string): Promise<void> => {
    const parsed = JSON.parse(bytesToUtf8(base64ToBytes(stateBincodeBase64))) as unknown;
    if (!isRecord(parsed) || parsed.sessionId !== sessionId || typeof parsed.secret !== 'string' || typeof parsed.nextSequence !== 'number') {
      throw new Error('RUST_E2EE_INVALID_STATE: invalid session state');
    }
    this.sessions.set(sessionId, {
      sessionId,
      secret: parsed.secret,
      nextSequence: parsed.nextSequence,
    });
  };

  private readonly removeSession = async (sessionId: string): Promise<void> => {
    this.sessions.delete(sessionId);
  };
}

const useNativeModule = (bridge: StatefulRustE2eeNativeMock): void => {
  (NativeModules as Record<string, unknown>).RustE2eeModule = bridge.module;
};

const setupAliceBobSession = async (): Promise<{
  aliceBridge: StatefulRustE2eeNativeMock;
  bobBridge: StatefulRustE2eeNativeMock;
  aliceRuntime: MobileRustE2eeRuntime;
  bobRuntime: MobileRustE2eeRuntime;
  aliceKeys: RustLocalE2eeKeyMaterial;
  bobKeys: RustLocalE2eeKeyMaterial;
  handshake: Uint8Array;
  sessionId: string;
}> => {
  const aliceBridge = new StatefulRustE2eeNativeMock('alice');
  const bobBridge = new StatefulRustE2eeNativeMock('bob');
  const aliceRuntime = new MobileRustE2eeRuntime();
  const bobRuntime = new MobileRustE2eeRuntime();
  const sessionId = 'alice_device__bob_device';

  useNativeModule(aliceBridge);
  const aliceKeys = await aliceRuntime.generatePreKeyBundle({
    signedPreKeyId: 11,
    oneTimePreKeyStartId: 101,
    oneTimePreKeyCount: 1,
  });

  useNativeModule(bobBridge);
  const bobKeys = await bobRuntime.generatePreKeyBundle({
    signedPreKeyId: 21,
    oneTimePreKeyStartId: 201,
    oneTimePreKeyCount: 1,
  });

  useNativeModule(aliceBridge);
  const handshake = await aliceRuntime.createOutboundSession({
    sessionId,
    localKeys: aliceKeys,
    remoteBundle: bobKeys.publicBundle,
  });

  useNativeModule(bobBridge);
  await bobRuntime.createInboundSession({
    sessionId,
    localKeys: bobKeys,
    remoteIdentityKey: aliceKeys.publicBundle.identityKey,
    handshake,
  });

  return {
    aliceBridge,
    bobBridge,
    aliceRuntime,
    bobRuntime,
    aliceKeys,
    bobKeys,
    handshake,
    sessionId,
  };
};

describe('MobileRustE2eeRuntime native bridge end-to-end security regressions', () => {
  afterEach(() => {
    delete (NativeModules as Record<string, unknown>).RustE2eeModule;
  });

  it('derives matching Alice outbound and Bob inbound sessions so Bob decrypts Alice ciphertext', async () => {
    const { aliceBridge, bobBridge, aliceRuntime, bobRuntime, sessionId } = await setupAliceBobSession();

    useNativeModule(aliceBridge);
    const wire = await aliceRuntime.encrypt(sessionId, 'message that requires Bob session secret');

    useNativeModule(bobBridge);
    const plaintext = await bobRuntime.decrypt(sessionId, wire);

    expect(bytesToUtf8(plaintext)).toBe('message that requires Bob session secret');
  });

  it('rejects Bob inbound session when the handshake claims an OTK Bob no longer has', async () => {
    const aliceBridge = new StatefulRustE2eeNativeMock('alice');
    const bobBridge = new StatefulRustE2eeNativeMock('bob');
    const aliceRuntime = new MobileRustE2eeRuntime();
    const bobRuntime = new MobileRustE2eeRuntime();
    const sessionId = 'alice_device__bob_missing_otk';

    useNativeModule(aliceBridge);
    const aliceKeys = await aliceRuntime.generatePreKeyBundle({
      signedPreKeyId: 11,
      oneTimePreKeyStartId: 101,
      oneTimePreKeyCount: 1,
    });

    useNativeModule(bobBridge);
    const bobKeys = await bobRuntime.generatePreKeyBundle({
      signedPreKeyId: 21,
      oneTimePreKeyStartId: 201,
      oneTimePreKeyCount: 1,
    });

    useNativeModule(aliceBridge);
    const handshake = await aliceRuntime.createOutboundSession({
      sessionId,
      localKeys: aliceKeys,
      remoteBundle: bobKeys.publicBundle,
    });

    const bobKeysWithoutOtk: RustLocalE2eeKeyMaterial = {
      ...bobKeys,
      oneTimePreKeyPairs: [],
    };

    useNativeModule(bobBridge);
    await expect(bobRuntime.createInboundSession({
      sessionId,
      localKeys: bobKeysWithoutOtk,
      remoteIdentityKey: aliceKeys.publicBundle.identityKey,
      handshake,
    })).rejects.toThrow('missing one-time pre-key: 201');
    expect(bobBridge.module.createInboundSession).not.toHaveBeenCalled();
  });

  it('propagates native authentication failure when Bob decrypts damaged wire bytes', async () => {
    const { aliceBridge, bobBridge, aliceRuntime, bobRuntime, sessionId } = await setupAliceBobSession();

    useNativeModule(aliceBridge);
    const wire = await aliceRuntime.encrypt(sessionId, 'authenticated plaintext');
    const damagedWire = new Uint8Array(wire);
    damagedWire[damagedWire.byteLength - 1] ^= 0x01;

    useNativeModule(bobBridge);
    await expect(bobRuntime.decrypt(sessionId, damagedWire)).rejects.toThrow('wire authentication failed');
    expect(bobBridge.module.decrypt).toHaveBeenCalledTimes(1);
  });

  it('round-trips exported Uint8Array session state through restore before decrypting later ciphertext', async () => {
    const { aliceBridge, bobBridge, aliceRuntime, bobRuntime, sessionId } = await setupAliceBobSession();

    useNativeModule(bobBridge);
    const exportedState = await bobRuntime.exportSession(sessionId);
    await bobRuntime.removeSession(sessionId);
    await expect(bobRuntime.decrypt(sessionId, new Uint8Array([0, 0, 0, RUST_RATCHET_HEADER_LEN, 1]))).rejects.toThrow(sessionId);
    await bobRuntime.restoreSession(sessionId, exportedState);

    useNativeModule(aliceBridge);
    const wire = await aliceRuntime.encrypt(sessionId, utf8ToBytes('state restore keeps the ratchet secret'));

    useNativeModule(bobBridge);
    const plaintext = await bobRuntime.decrypt(sessionId, wire);

    expect(bytesToUtf8(plaintext)).toBe('state restore keeps the ratchet secret');
    expect(bobBridge.module.restoreSession).toHaveBeenCalledWith(sessionId, bytesToBase64(exportedState));
  });

  it('fails clearly before native decrypt or restore when binary string inputs are not Base64', async () => {
    const bridge = new StatefulRustE2eeNativeMock('local');
    const runtime = new MobileRustE2eeRuntime();
    useNativeModule(bridge);

    await expect(
      runtime.decrypt('local_session', 'definitely not base64' as unknown as Base64String),
    ).rejects.toThrow('encryptedWire must be Base64-encoded binary data');
    await expect(
      runtime.restoreSession('local_session', 'not session state' as unknown as Base64String),
    ).rejects.toThrow('stateBytes must be Base64-encoded binary data');

    expect(bridge.module.decrypt).not.toHaveBeenCalled();
    expect(bridge.module.restoreSession).not.toHaveBeenCalled();
  });
});
