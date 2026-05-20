import { NativeModules } from 'react-native';
import {
  bytesToBase64,
  utf8ToBytes,
  type Base64String,
} from '@im/shared-e2ee-core';

import { MobileRustE2eeRuntime } from '@/e2ee/runtime/mobileRustE2eeRuntime';
import { installNativeModule, uninstallNativeModule } from './helpers/nativeMock';
import { makeWire } from './fixtures/wireFixtures';

describe('MobileRustE2eeRuntime binary input paths', () => {
  afterEach(() => {
    uninstallNativeModule();
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
