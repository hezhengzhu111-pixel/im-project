import { NativeModules } from 'react-native';
import {
  assertRustWireFormat,
  asBase64String,
  base64ToBytes,
  bytesToBase64,
  copyBytes,
  parseRustHandshake,
  utf8ToBytes,
  type CreateInboundSessionInput,
  type CreateOutboundSessionInput,
  type E2eeRuntime,
  type GeneratePreKeyBundleOptions,
  type Base64String,
  type RustE2eeEnvelope,
  type RustLocalE2eeKeyMaterial,
  type RustPreKey,
  type RustPublicPreKeyBundle,
} from '@im/shared-e2ee-core';

type NativeRustE2eeModule = {
  generatePreKeyBundle(
    signedPreKeyId: number,
    oneTimePreKeyStartId: number,
    oneTimePreKeyCount: number,
  ): Promise<string>;
  createOutboundSession(
    sessionId: string,
    identityKeyPairBincodeBase64: string,
    remoteBundleJson: string,
  ): Promise<string>;
  createInboundSession(
    sessionId: string,
    identityKeyPairBincodeBase64: string,
    signedPreKeyPairBincodeBase64: string,
    oneTimePreKeyPairBincodeBase64: string | null,
    remoteIdentityKeyBase64: string,
    remoteEphemeralKeyBase64: string,
  ): Promise<void>;
  encrypt(sessionId: string, plaintextBase64: string): Promise<string>;
  decrypt(sessionId: string, encryptedWireBase64: string): Promise<string>;
  exportSession(sessionId: string): Promise<string>;
  restoreSession(sessionId: string, stateBincodeBase64: string): Promise<void>;
  removeSession(sessionId: string): Promise<void>;
};

const RUNTIME_NOT_LINKED = 'Mobile Rust E2EE runtime is not linked';

let injectedRuntime: E2eeRuntime | null = null;

const nativeModule = (): NativeRustE2eeModule => {
  const module = (NativeModules as Record<string, unknown>).RustE2eeModule as NativeRustE2eeModule | undefined;
  if (!module) {
    throw new Error(RUNTIME_NOT_LINKED);
  }
  return module;
};

const defaultOptions = (options?: GeneratePreKeyBundleOptions): Required<GeneratePreKeyBundleOptions> => ({
  signedPreKeyId: options?.signedPreKeyId ?? 1,
  oneTimePreKeyStartId: options?.oneTimePreKeyStartId ?? 1,
  oneTimePreKeyCount: options?.oneTimePreKeyCount ?? 100,
});

const parseGeneratedKeyMaterial = (json: string): RustLocalE2eeKeyMaterial => {
  const parsed = JSON.parse(json) as RustLocalE2eeKeyMaterial;
  if (
    parsed.version !== 2 ||
    !parsed.identityKeyPairBincode ||
    !parsed.signedPreKeyPairBincode ||
    !parsed.publicBundle?.identityKey ||
    !parsed.publicBundle?.signingKey ||
    !parsed.publicBundle?.signedPreKey?.key
  ) {
    throw new Error('invalid Rust E2EE key material');
  }
  return parsed;
};

const bytesToJsonArray = (value: string): number[] => Array.from(base64ToBytes(value));

const preKeyToRustJson = (preKey: RustPreKey) => ({
  id: preKey.id,
  key: bytesToJsonArray(preKey.key),
});

const remoteBundleToRustJson = (bundle: RustPublicPreKeyBundle): string => {
  const oneTimePreKey = bundle.oneTimePreKey ?? bundle.oneTimePreKeys?.[0] ?? null;
  return JSON.stringify({
    identity_key: bytesToJsonArray(bundle.identityKey),
    signing_key: bytesToJsonArray(bundle.signingKey),
    signed_pre_key: preKeyToRustJson(bundle.signedPreKey),
    signed_pre_key_signature: bytesToJsonArray(bundle.signedPreKeySignature),
    one_time_pre_key: oneTimePreKey ? preKeyToRustJson(oneTimePreKey) : null,
  });
};

const binaryInputToBase64 = (value: Uint8Array | Base64String, label: string): Base64String =>
  typeof value === 'string' ? asBase64String(value, label) : bytesToBase64(copyBytes(value));

export class MobileRustE2eeRuntime implements E2eeRuntime {
  async createIdentity(options?: GeneratePreKeyBundleOptions): Promise<RustLocalE2eeKeyMaterial> {
    return this.generatePreKeyBundle(options);
  }

  async generatePreKeyBundle(options?: GeneratePreKeyBundleOptions): Promise<RustLocalE2eeKeyMaterial> {
    const resolved = defaultOptions(options);
    const json = await nativeModule().generatePreKeyBundle(
      resolved.signedPreKeyId,
      resolved.oneTimePreKeyStartId,
      resolved.oneTimePreKeyCount,
    );
    return parseGeneratedKeyMaterial(json);
  }

  async createOutboundSession(input: CreateOutboundSessionInput): Promise<Uint8Array> {
    const handshakeBase64 = await nativeModule().createOutboundSession(
      input.sessionId,
      input.localKeys.identityKeyPairBincode,
      remoteBundleToRustJson(input.remoteBundle),
    );
    return base64ToBytes(handshakeBase64);
  }

  async createInboundSession(input: CreateInboundSessionInput): Promise<void> {
    const handshakeBase64 = binaryInputToBase64(input.handshake, 'handshake');
    const handshake = parseRustHandshake(base64ToBytes(handshakeBase64));

    const signedPreKeyId = input.localKeys.publicBundle.signedPreKey.id;
    if (signedPreKeyId !== handshake.signedPreKeyId) {
      throw new Error('Rust E2EE handshake references an unknown signed pre-key');
    }

    const oneTimePreKeyPair =
      handshake.oneTimePreKeyId == null
        ? null
        : input.localKeys.oneTimePreKeyPairs.find((pair) => pair.id === handshake.oneTimePreKeyId) ?? null;
    if (handshake.oneTimePreKeyId != null && !oneTimePreKeyPair) {
      throw new Error(`Rust E2EE handshake references missing one-time pre-key: ${handshake.oneTimePreKeyId}`);
    }

    await nativeModule().createInboundSession(
      input.sessionId,
      input.localKeys.identityKeyPairBincode,
      input.localKeys.signedPreKeyPairBincode,
      oneTimePreKeyPair?.keyPairBincode ?? null,
      input.remoteIdentityKey,
      bytesToBase64(handshake.ephemeralPublicKey),
    );
  }

  async encrypt(sessionId: string, plaintext: Uint8Array | string): Promise<Uint8Array> {
    const plaintextBase64 = typeof plaintext === 'string' ? bytesToBase64(utf8ToBytes(plaintext)) : bytesToBase64(copyBytes(plaintext));
    const wire = base64ToBytes(await nativeModule().encrypt(sessionId, plaintextBase64));
    assertRustWireFormat(wire);
    return wire;
  }

  async decrypt(sessionId: string, encryptedWire: Uint8Array | Base64String | RustE2eeEnvelope): Promise<Uint8Array> {
    const wireBase64 =
      typeof encryptedWire === 'string'
        ? binaryInputToBase64(encryptedWire, 'encryptedWire')
        : encryptedWire instanceof Uint8Array
          ? bytesToBase64(copyBytes(encryptedWire))
          : asBase64String(encryptedWire.wire, 'encryptedWire.wire');
    const plaintext = base64ToBytes(await nativeModule().decrypt(sessionId, wireBase64));
    return plaintext;
  }

  async exportSession(sessionId: string): Promise<Uint8Array> {
    return base64ToBytes(await nativeModule().exportSession(sessionId));
  }

  async restoreSession(sessionId: string, stateBytes: Uint8Array | Base64String): Promise<void> {
    await nativeModule().restoreSession(sessionId, binaryInputToBase64(stateBytes, 'stateBytes'));
  }

  async removeSession(sessionId: string): Promise<void> {
    await nativeModule().removeSession(sessionId);
  }
}

const defaultRuntime = new MobileRustE2eeRuntime();

export const getMobileE2eeRuntime = (): E2eeRuntime => injectedRuntime ?? defaultRuntime;

export const setMobileE2eeRuntimeForTesting = (runtime: E2eeRuntime | null): void => {
  injectedRuntime = runtime;
};

export const mobileE2eeRuntime = defaultRuntime;
export const MOBILE_RUST_E2EE_RUNTIME_NOT_LINKED = RUNTIME_NOT_LINKED;
