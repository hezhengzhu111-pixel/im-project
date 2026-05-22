import { NativeModules } from 'react-native';
import { bytesToBase64, E2eePolicyError, classifyE2eeError } from '@im/shared-e2ee-core';

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

  it('rejects with E2eePolicyError type carrying correct code and category', async () => {
    installNativeModule();
    const runtime = new MobileRustE2eeRuntime();
    const localKeys = {
      ...makeLocalKeys(),
      oneTimePreKeyPairs: [],
    };
    const handshake = makeHandshake(3, 7);

    let caught: unknown = null;
    try {
      await runtime.createInboundSession({
        sessionId: 'alice_bob',
        localKeys,
        remoteIdentityKey: b64('remote-identity'),
        handshake: bytesToBase64(handshake.bytes),
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(E2eePolicyError);
    const policyErr = caught as E2eePolicyError;
    expect(policyErr.code).toBe('E2EE_ONE_TIME_PREKEY_MISSING');
    expect(policyErr.category).toBe('protocol');
  });

  it('classifies E2EE_ONE_TIME_PREKEY_MISSING error correctly by message', () => {
    const classification = classifyE2eeError(
      new Error('Rust E2EE handshake references missing one-time pre-key: 7'),
    );
    expect(classification.code).toBe('E2EE_ONE_TIME_PREKEY_MISSING');
    expect(classification.category).toBe('protocol');
    expect(classification.retryable).toBe(false);
    expect(classification.safeMessage).toBe('加密会话状态不完整，请重新协商');
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
