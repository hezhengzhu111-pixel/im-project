import { NativeModules } from 'react-native';
import {
  base64ToBytes,
  bytesToBase64,
  utf8ToBytes,
  type Base64String,
} from '@im/shared-e2ee-core';

import { MobileRustE2eeRuntime } from '@/e2ee/runtime/mobileRustE2eeRuntime';
import { b64 } from './helpers/cryptoTestUtils';
import { installNativeModule, type NativeRustE2eeModuleMock } from './helpers/nativeMock';
import { makeHandshake } from './fixtures/handshakeFixtures';
import { makeLocalKeys } from './fixtures/keyMaterialFixtures';
import { makeWire } from './fixtures/wireFixtures';

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

  it('encrypts plain string input as UTF-8 plaintext for compatibility', async () => {
    const nativeModule = installNativeModule();
    const runtime = new MobileRustE2eeRuntime();
    const wireBase64 = bytesToBase64(makeWire());
    nativeModule.encrypt.mockResolvedValue(wireBase64);

    await expect(runtime.encrypt('alice_bob', 'hello')).resolves.toEqual(base64ToBytes(wireBase64));

    expect(nativeModule.encrypt).toHaveBeenCalledWith('alice_bob', b64('hello'));
  });

  it('rejects non-Base64 string decrypt input before calling native', async () => {
    const nativeModule = installNativeModule();
    const runtime = new MobileRustE2eeRuntime();

    await expect(
      runtime.decrypt('alice_bob', 'plain text' as unknown as Base64String),
    ).rejects.toThrow('encryptedWire must be Base64-encoded binary data');

    expect(nativeModule.decrypt).not.toHaveBeenCalled();
  });

  it('rejects non-Base64 string restoreSession input before calling native', async () => {
    const nativeModule = installNativeModule();
    const runtime = new MobileRustE2eeRuntime();

    await expect(
      runtime.restoreSession('alice_bob', 'not session state' as unknown as Base64String),
    ).rejects.toThrow('stateBytes must be Base64-encoded binary data');

    expect(nativeModule.restoreSession).not.toHaveBeenCalled();
  });

  it('keeps Uint8Array binary input paths unchanged', async () => {
    const nativeModule = installNativeModule();
    const runtime = new MobileRustE2eeRuntime();
    const wire = makeWire();
    const plaintext = utf8ToBytes('decoded');
    const state = utf8ToBytes('state-bytes');
    nativeModule.decrypt.mockResolvedValue(bytesToBase64(plaintext));

    await expect(runtime.decrypt('alice_bob', wire)).resolves.toEqual(plaintext);
    await expect(runtime.restoreSession('alice_bob', state)).resolves.toBeUndefined();

    expect(nativeModule.decrypt).toHaveBeenCalledWith('alice_bob', bytesToBase64(wire));
    expect(nativeModule.restoreSession).toHaveBeenCalledWith('alice_bob', bytesToBase64(state));
  });
});
