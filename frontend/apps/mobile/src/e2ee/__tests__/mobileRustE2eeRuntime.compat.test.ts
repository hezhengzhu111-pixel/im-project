import { NativeModules } from 'react-native';
import { base64ToBytes, bytesToBase64 } from '@im/shared-e2ee-core';

import { MobileRustE2eeRuntime } from '@/e2ee/runtime/mobileRustE2eeRuntime';
import { b64 } from './helpers/cryptoTestUtils';
import { installNativeModule, uninstallNativeModule } from './helpers/nativeMock';
import { makeWire } from './fixtures/wireFixtures';

describe('MobileRustE2eeRuntime UTF-8 compat', () => {
  afterEach(() => {
    uninstallNativeModule();
  });

  it('encrypts plain string input as UTF-8 plaintext for compatibility', async () => {
    const nativeModule = installNativeModule();
    const runtime = new MobileRustE2eeRuntime();
    const wireBase64 = bytesToBase64(makeWire());
    nativeModule.encrypt.mockResolvedValue(wireBase64);

    await expect(runtime.encrypt('alice_bob', 'hello')).resolves.toEqual(base64ToBytes(wireBase64));

    expect(nativeModule.encrypt).toHaveBeenCalledWith('alice_bob', b64('hello'));
  });
});
