import { bytesToBase64, utf8ToBytes, type RustLocalE2eeKeyMaterial } from '@im/shared-e2ee-core';
import { b64 } from '../helpers/cryptoTestUtils';

export const makeLocalKeys = (): RustLocalE2eeKeyMaterial => ({
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

export const keyMaterial = (owner: string): RustLocalE2eeKeyMaterial => ({
  version: 2,
  identityKeyPairBincode: bytesToBase64(utf8ToBytes(`identity-private-${owner}`)),
  signedPreKeyPairBincode: bytesToBase64(utf8ToBytes(`signed-private-${owner}`)),
  oneTimePreKeyPairs: [{ id: 1, keyPairBincode: bytesToBase64(utf8ToBytes(`otk-private-${owner}`)), publicKey: bytesToBase64(utf8ToBytes(`otk-public-${owner}`)) }],
  publicBundle: {
    identityKey: bytesToBase64(utf8ToBytes(`identity-public-${owner}`)),
    signingKey: bytesToBase64(utf8ToBytes(`signing-public-${owner}`)),
    signedPreKey: { id: 1, key: bytesToBase64(utf8ToBytes(`signed-public-${owner}`)) },
    signedPreKeySignature: bytesToBase64(utf8ToBytes(`signature-${owner}`)),
    oneTimePreKeys: [{ id: 1, key: bytesToBase64(utf8ToBytes(`otk-public-${owner}`)) }],
  },
});
