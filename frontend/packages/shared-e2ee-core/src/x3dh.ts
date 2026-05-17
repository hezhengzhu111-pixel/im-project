import {
  concatDhOutputs,
  deriveBase64Key,
  ecdsaSignP1363,
  ecdsaVerifyP1363,
  generateEcdhKeyPair,
  generateEcdsaKeyPair,
  p256Ecdh,
} from "./crypto";
import { base64ToBytes } from "./bytes";
import type {
  EncodedEcdhKeyPair,
  EncodedBundle,
  KeyBundle,
  PreKeyBundle,
  X3dhResult,
} from "./types";

const X3DH_INFO = "X3DH-RootKey-v1";
const X3DH_ZERO_SALT = new Uint8Array(32);

export const generateKeyBundle = (options?: { oneTimePreKeyCount?: number }): KeyBundle => {
  const identityKeyPair = generateEcdhKeyPair();
  const signingIdentityKeyPair = generateEcdsaKeyPair();
  const signedPreKeyPair = generateEcdhKeyPair();
  const oneTimePreKeyCount = options?.oneTimePreKeyCount ?? 0;
  const oneTimePreKeyPairs = Array.from({ length: oneTimePreKeyCount }, () => generateEcdhKeyPair());
  const signedPreKeySignature = ecdsaSignP1363(
    signingIdentityKeyPair.privateKey,
    base64ToBytes(signedPreKeyPair.publicKey),
  );

  const bundle: EncodedBundle = {
    identityKey: identityKeyPair.publicKey,
    signingIdentityKey: signingIdentityKeyPair.publicKey,
    signedPreKey: signedPreKeyPair.publicKey,
    signedPreKeySignature,
    oneTimePreKeys: oneTimePreKeyPairs.map((pair) => pair.publicKey),
  };

  return {
    identityKeyPair,
    signingIdentityKeyPair,
    signedPreKeyPair,
    oneTimePreKeyPairs,
    bundle,
  };
};

export const x3dhInitiate = (
  identityKeyPair: EncodedEcdhKeyPair,
  remoteBundle: PreKeyBundle,
): X3dhResult => {
  const sigValid = ecdsaVerifyP1363(
    remoteBundle.signingIdentityKey,
    remoteBundle.signedPreKeySignature,
    base64ToBytes(remoteBundle.signedPreKey),
  );
  if (!sigValid) {
    throw new Error("X3DH: SPK signature verification failed");
  }

  const ephemeralKeyPair = generateEcdhKeyPair();
  const dh1 = p256Ecdh(identityKeyPair.privateKey, remoteBundle.signedPreKey);
  const dh2 = p256Ecdh(ephemeralKeyPair.privateKey, remoteBundle.identityKey);
  const dh3 = p256Ecdh(ephemeralKeyPair.privateKey, remoteBundle.signedPreKey);
  const rootKey = deriveBase64Key(concatDhOutputs(dh1, dh2, dh3), X3DH_ZERO_SALT, X3DH_INFO);

  return {
    rootKey,
    ephemeralPublicKey: ephemeralKeyPair.publicKey,
    ephemeralKeyPair,
  };
};

export const x3dhRespond = (
  identityKeyPair: EncodedEcdhKeyPair,
  signedPreKeyPair: EncodedEcdhKeyPair,
  oneTimePreKeyPair: EncodedEcdhKeyPair | null,
  remoteIdentityKeyRaw: string,
  remoteEphemeralKeyRaw: string,
): string => {
  if (oneTimePreKeyPair) {
    throw new Error("X3DH: one-time pre-keys are not enabled for this protocol version");
  }
  const dh1 = p256Ecdh(signedPreKeyPair.privateKey, remoteIdentityKeyRaw);
  const dh2 = p256Ecdh(identityKeyPair.privateKey, remoteEphemeralKeyRaw);
  const dh3 = p256Ecdh(signedPreKeyPair.privateKey, remoteEphemeralKeyRaw);
  return deriveBase64Key(concatDhOutputs(dh1, dh2, dh3), X3DH_ZERO_SALT, X3DH_INFO);
};

