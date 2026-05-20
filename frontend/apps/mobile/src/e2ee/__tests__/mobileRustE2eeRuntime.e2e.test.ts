import { NativeModules } from 'react-native';
import {
  base64ToBytes,
  bytesToBase64,
  bytesToUtf8,
  utf8ToBytes,
  type Base64String,
  type RustLocalE2eeKeyMaterial,
} from '@im/shared-e2ee-core';

import { MobileRustE2eeRuntime } from '@/e2ee/runtime/mobileRustE2eeRuntime';
import {
  StatefulRustE2eeNativeMock,
  useNativeModule,
  setupAliceBobSession,
} from './mocks/statefulRustE2eeMock';
import { RUST_RATCHET_HEADER_LEN } from './fixtures/wireFixtures';

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
