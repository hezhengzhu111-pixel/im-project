import { NativeModules } from 'react-native';
import { bytesToBase64 } from '@im/shared-e2ee-core';

import { MobileRustE2eeRuntime } from '@/e2ee/runtime/mobileRustE2eeRuntime';
import { b64 } from './helpers/cryptoTestUtils';
import { installNativeModule, uninstallNativeModule } from './helpers/nativeMock';
import { makeHandshake } from './fixtures/handshakeFixtures';
import { makeLocalKeys } from './fixtures/keyMaterialFixtures';

describe('MobileRustE2eeRuntime inbound OTK handling', () => {
  afterEach(() => {
    uninstallNativeModule();
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
