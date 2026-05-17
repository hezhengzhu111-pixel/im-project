import {
  aesGcmDecryptBytes,
  aesGcmEncryptBytes,
  deriveBase64Key,
  generateEcdhKeyPair,
  p256Ecdh,
  randomAesGcmIv,
} from "./crypto";
import { base64ToBytes, bytesToBase64, bytesToUtf8, concatBytes, utf8ToBytes } from "./bytes";
import type { EncodedEcdhKeyPair, RatchetHeader, RatchetState } from "./types";

const EMPTY_SALT = new Uint8Array(0);
const INFO_ROOT_KEY = "RootKey";
const INFO_SENDING_CHAIN = "SendingChainKey";
const INFO_RECEIVING_CHAIN = "ReceivingChainKey";
export const INITIAL_CHAIN_INFOS = [INFO_SENDING_CHAIN, INFO_RECEIVING_CHAIN] as const;
const INFO_MESSAGE_KEYS = "MessageKeys";
const INFO_CHAIN_KEYS = "ChainKeys";
export const DEFAULT_MAX_COUNTER_GAP = 2000;
export const DEFAULT_MAX_SKIPPED_MESSAGE_KEYS = 2000;

const normalizeSkipped = (state: RatchetState): Record<string, string> => state.skippedMessageKeys || {};

const cloneRatchetState = (state: RatchetState): RatchetState => ({
  ...state,
  dhKeyPair: { ...state.dhKeyPair },
  skippedMessageKeys: { ...normalizeSkipped(state) },
});

const commitRatchetState = (target: RatchetState, source: RatchetState): void => {
  target.rootKey = source.rootKey;
  target.sendingChainKey = source.sendingChainKey;
  target.receivingChainKey = source.receivingChainKey;
  target.sendCounter = source.sendCounter;
  target.receiveCounter = source.receiveCounter;
  target.previousCounter = source.previousCounter;
  target.dhKeyPair = { ...source.dhKeyPair };
  target.remotePublicKey = source.remotePublicKey;
  target.skippedMessageKeys = { ...normalizeSkipped(source) };
};

const shouldAttemptInitialInboundRepair = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error || '').toLowerCase();
  if (message.includes('counter gap')) {
    return false;
  }
  if (message.includes('invalid counter')) {
    return false;
  }
  return true;
};

export const buildRatchetAad = (header: Pick<RatchetHeader, "ratchetPublicKey" | "counter" | "previousCounter">): Uint8Array =>
  utf8ToBytes(JSON.stringify({
    ratchetPublicKey: header.ratchetPublicKey,
    counter: header.counter,
    previousCounter: header.previousCounter,
  }));

const splitChainKey = (chainKey: string): { messageKey: string; chainKey: string } => {
  const raw = base64ToBytes(chainKey);
  return {
    messageKey: deriveBase64Key(raw, EMPTY_SALT, INFO_MESSAGE_KEYS),
    chainKey: deriveBase64Key(raw, EMPTY_SALT, INFO_CHAIN_KEYS),
  };
};

const kdfRootKey = (
  rootKey: string,
  dhOutput: Uint8Array,
  chainInfo: string,
): { newRootKey: string; chainKey: string } => {
  const input = concatBytes(base64ToBytes(rootKey), dhOutput);
  return {
    newRootKey: deriveBase64Key(input, EMPTY_SALT, INFO_ROOT_KEY),
    chainKey: deriveBase64Key(input, EMPTY_SALT, chainInfo),
  };
};

const trimSkippedKeys = (state: RatchetState, maxSkippedMessageKeys: number): void => {
  const entries = Object.entries(normalizeSkipped(state));
  if (entries.length <= maxSkippedMessageKeys) {
    return;
  }
  state.skippedMessageKeys = Object.fromEntries(entries.slice(entries.length - maxSkippedMessageKeys));
};

const performDhRatchet = (state: RatchetState, newRemotePublicKey: string): void => {
  state.previousCounter = state.sendCounter;
  state.sendCounter = 0;
  state.receiveCounter = 0;

  const dh1 = p256Ecdh(state.dhKeyPair.privateKey, newRemotePublicKey);
  const receiveResult = kdfRootKey(state.rootKey, dh1, INFO_SENDING_CHAIN);
  state.rootKey = receiveResult.newRootKey;
  state.receivingChainKey = receiveResult.chainKey;

  state.dhKeyPair = generateEcdhKeyPair();
  const dh2 = p256Ecdh(state.dhKeyPair.privateKey, newRemotePublicKey);
  const sendResult = kdfRootKey(state.rootKey, dh2, INFO_SENDING_CHAIN);
  state.rootKey = sendResult.newRootKey;
  state.sendingChainKey = sendResult.chainKey;
  state.remotePublicKey = newRemotePublicKey;
};

export const importRootKey = (rootKeyBase64: string): string => {
  const rootKey = base64ToBytes(rootKeyBase64);
  if (rootKey.byteLength !== 32) {
    throw new Error("Root key must be 32 bytes");
  }
  return rootKeyBase64;
};

export const initSendingChain = (
  rootKeyBase64: string,
  _identityKeyPair?: EncodedEcdhKeyPair,
): RatchetState => {
  const rootKey = importRootKey(rootKeyBase64);
  const rootRaw = base64ToBytes(rootKey);
  return {
    rootKey,
    sendingChainKey: deriveBase64Key(rootRaw, EMPTY_SALT, INFO_SENDING_CHAIN),
    receivingChainKey: deriveBase64Key(rootRaw, EMPTY_SALT, INFO_RECEIVING_CHAIN),
    sendCounter: 0,
    receiveCounter: 0,
    previousCounter: 0,
    dhKeyPair: generateEcdhKeyPair(),
    remotePublicKey: null,
    skippedMessageKeys: {},
  };
};

export const initReceivingChain = (
  rootKeyBase64: string,
  _identityKeyPair?: EncodedEcdhKeyPair,
): RatchetState => {
  const rootKey = importRootKey(rootKeyBase64);
  const rootRaw = base64ToBytes(rootKey);
  return {
    rootKey,
    sendingChainKey: deriveBase64Key(rootRaw, EMPTY_SALT, INFO_RECEIVING_CHAIN),
    receivingChainKey: deriveBase64Key(rootRaw, EMPTY_SALT, INFO_SENDING_CHAIN),
    sendCounter: 0,
    receiveCounter: 0,
    previousCounter: 0,
    dhKeyPair: generateEcdhKeyPair(),
    remotePublicKey: null,
    skippedMessageKeys: {},
  };
};

export const ratchetEncrypt = (
  state: RatchetState,
  plaintext: string,
): { header: RatchetHeader; ciphertext: string } => {
  if (!state.sendingChainKey) {
    throw new Error("Double Ratchet: sending chain not initialized");
  }

  const split = splitChainKey(state.sendingChainKey);
  state.sendingChainKey = split.chainKey;

  const iv = randomAesGcmIv();
  const header: RatchetHeader = {
    ratchetPublicKey: state.dhKeyPair.publicKey,
    counter: state.sendCounter,
    previousCounter: state.previousCounter,
    iv: bytesToBase64(iv),
  };

  const ciphertext = aesGcmEncryptBytes(split.messageKey, utf8ToBytes(plaintext), iv, buildRatchetAad(header));
  state.sendCounter += 1;
  return { header, ciphertext };
};

export interface RatchetDecryptOptions {
  maxCounterGap?: number;
  maxSkippedMessageKeys?: number;
}

export const ratchetDecrypt = (
  state: RatchetState,
  header: RatchetHeader,
  ciphertextBase64: string,
  options?: RatchetDecryptOptions,
): string => {
  const maxCounterGap = options?.maxCounterGap ?? DEFAULT_MAX_COUNTER_GAP;
  const maxSkippedMessageKeys = options?.maxSkippedMessageKeys ?? DEFAULT_MAX_SKIPPED_MESSAGE_KEYS;
  const targetCounter = Number(header.counter);
  if (!Number.isInteger(targetCounter) || targetCounter < 0) {
    throw new Error("Double Ratchet: invalid counter");
  }
  if (targetCounter - state.receiveCounter > maxCounterGap) {
    throw new Error("Double Ratchet: counter gap exceeds limit");
  }
  const iv = base64ToBytes(header.iv);
  const aad = buildRatchetAad(header);
  const skipKey = `${header.ratchetPublicKey}_${targetCounter}`;
  const cachedMessageKey = normalizeSkipped(state)[skipKey];

  if (cachedMessageKey) {
    delete state.skippedMessageKeys[skipKey];
    return bytesToUtf8(aesGcmDecryptBytes(cachedMessageKey, ciphertextBase64, iv, aad));
  }

  const needsRatchet = state.remotePublicKey !== null && state.remotePublicKey !== header.ratchetPublicKey;
  if (targetCounter < state.receiveCounter && !needsRatchet) {
    throw new Error("Double Ratchet: duplicate or expired message");
  }
  if (needsRatchet) {
    performDhRatchet(state, header.ratchetPublicKey);
  }
  if (!state.remotePublicKey) {
    state.remotePublicKey = header.ratchetPublicKey;
  }
  if (!state.receivingChainKey) {
    throw new Error("Double Ratchet: receiving chain not initialized");
  }

  let currentChainKey = state.receivingChainKey;
  state.skippedMessageKeys = normalizeSkipped(state);
  for (let counter = state.receiveCounter; counter < targetCounter; counter += 1) {
    const skipped = splitChainKey(currentChainKey);
    state.skippedMessageKeys[`${header.ratchetPublicKey}_${counter}`] = skipped.messageKey;
    currentChainKey = skipped.chainKey;
  }

  const split = splitChainKey(currentChainKey);
  state.receivingChainKey = split.chainKey;
  const plaintext = bytesToUtf8(aesGcmDecryptBytes(split.messageKey, ciphertextBase64, iv, aad));
  state.receiveCounter = targetCounter + 1;
  trimSkippedKeys(state, maxSkippedMessageKeys);
  return plaintext;
};

export interface RatchetDecryptSafeResult {
  plaintext: string;
  repaired: boolean;
  repairChainInfo?: (typeof INITIAL_CHAIN_INFOS)[number];
}

export const ratchetDecryptSafely = (
  state: RatchetState,
  header: RatchetHeader,
  ciphertextBase64: string,
  options?: RatchetDecryptOptions,
): RatchetDecryptSafeResult => {
  const original = cloneRatchetState(state);
  const normal = cloneRatchetState(original);
  try {
    const plaintext = ratchetDecrypt(normal, header, ciphertextBase64, options);
    commitRatchetState(state, normal);
    return { plaintext, repaired: false };
  } catch (error) {
    if (!shouldAttemptInitialInboundRepair(error)) {
      throw error;
    }
    const rootRaw = base64ToBytes(importRootKey(original.rootKey));
    const attempted = new Set<string>();
    for (const chainInfo of INITIAL_CHAIN_INFOS) {
      const chainKey = deriveBase64Key(rootRaw, EMPTY_SALT, chainInfo);
      if (attempted.has(chainKey)) {
        continue;
      }
      attempted.add(chainKey);
      const repaired = cloneRatchetState(original);
      repaired.receivingChainKey = chainKey;
      repaired.receiveCounter = 0;
      repaired.remotePublicKey = null;
      repaired.skippedMessageKeys = {};
      try {
        const plaintext = ratchetDecrypt(repaired, header, ciphertextBase64, options);
        commitRatchetState(state, repaired);
        return { plaintext, repaired: true, repairChainInfo: chainInfo };
      } catch {
        // try the next initial chain direction
      }
    }
    throw error;
  }
};
