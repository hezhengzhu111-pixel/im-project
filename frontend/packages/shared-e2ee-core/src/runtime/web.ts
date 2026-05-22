import initWasm, { WasmSessionManager } from "@im/rust-e2ee-wasm";

import { asBase64String, base64ToBytes, copyBytes, utf8ToBytes, type Base64String } from "../bytes";
import { envelopeWireBytes } from "../envelope";
import { E2eePolicyError } from "../policy";
import { assertRustWireFormat, normalizeHandshake, parseRustHandshake } from "../rust-wire";
import {
  RUST_E2EE_ENVELOPE_VERSION,
  type GeneratePreKeyBundleOptions,
  type RustE2eeEnvelope,
  type RustLocalE2eeKeyMaterial,
  type RustPreKey,
  type RustPublicPreKeyBundle,
} from "../types";
import type { CreateInboundSessionInput, CreateOutboundSessionInput, E2eeRuntime } from "../runtime";

let wasmInitPromise: Promise<void> | null = null;

const ensureWasmLoaded = async (): Promise<void> => {
  wasmInitPromise ??= initWasm().then(() => undefined);
  await wasmInitPromise;
};

const bytesToJsonArray = (value: string): number[] => Array.from(base64ToBytes(value));

const optionalBytes = (value: Uint8Array | Base64String, label: string): Uint8Array =>
  typeof value === "string" ? base64ToBytes(asBase64String(value, label)) : copyBytes(value);

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

const parseGeneratedKeyMaterial = (json: string): RustLocalE2eeKeyMaterial => {
  const value = JSON.parse(json) as RustLocalE2eeKeyMaterial;
  if (value.version !== RUST_E2EE_ENVELOPE_VERSION) {
    throw new Error("invalid Rust E2EE key material version");
  }
  if (!value.identityKeyPairBincode || !value.signedPreKeyPairBincode || !value.publicBundle) {
    throw new Error("invalid Rust E2EE key material");
  }
  return value;
};

const defaultOptions = (options?: GeneratePreKeyBundleOptions): Required<GeneratePreKeyBundleOptions> => ({
  signedPreKeyId: options?.signedPreKeyId ?? 1,
  oneTimePreKeyStartId: options?.oneTimePreKeyStartId ?? 1,
  oneTimePreKeyCount: options?.oneTimePreKeyCount ?? 100,
});

export class WebE2eeRuntime implements E2eeRuntime {
  private manager: WasmSessionManager | null = null;

  private async sessionManager(): Promise<WasmSessionManager> {
    await ensureWasmLoaded();
    this.manager ??= new WasmSessionManager();
    return this.manager;
  }

  async createIdentity(options?: GeneratePreKeyBundleOptions): Promise<RustLocalE2eeKeyMaterial> {
    return this.generatePreKeyBundle(options);
  }

  async generatePreKeyBundle(options?: GeneratePreKeyBundleOptions): Promise<RustLocalE2eeKeyMaterial> {
    const resolved = defaultOptions(options);
    const manager = await this.sessionManager();
    return parseGeneratedKeyMaterial(
      manager.generate_pre_key_bundle(
        resolved.signedPreKeyId,
        resolved.oneTimePreKeyStartId,
        resolved.oneTimePreKeyCount,
      ),
    );
  }

  async createOutboundSession(input: CreateOutboundSessionInput): Promise<Uint8Array> {
    const manager = await this.sessionManager();
    return manager.create_outbound_session(
      input.sessionId,
      base64ToBytes(input.localKeys.identityKeyPairBincode),
      remoteBundleToRustJson(input.remoteBundle),
    );
  }

  async createInboundSession(input: CreateInboundSessionInput): Promise<void> {
    const manager = await this.sessionManager();
    const handshakeBytes = optionalBytes(input.handshake, "handshake");
    const handshake = normalizeHandshake(parseRustHandshake(handshakeBytes));
    const signedPreKeyId = input.localKeys.publicBundle.signedPreKey.id;
    if (signedPreKeyId !== handshake.signedPreKeyId) {
      throw new Error("Rust E2EE handshake references an unknown signed pre-key");
    }

    const oneTimePreKeyPair =
      handshake.oneTimePreKeyId == null
        ? null
        : input.localKeys.oneTimePreKeyPairs.find((pair) => pair.id === handshake.oneTimePreKeyId) ?? null;
    if (handshake.oneTimePreKeyId != null && !oneTimePreKeyPair) {
      throw new E2eePolicyError(
        `Rust E2EE handshake references missing one-time pre-key: ${handshake.oneTimePreKeyId}`,
        "E2EE_ONE_TIME_PREKEY_MISSING",
        "protocol",
      );
    }

    manager.create_inbound_session(
      input.sessionId,
      base64ToBytes(input.localKeys.identityKeyPairBincode),
      base64ToBytes(input.localKeys.signedPreKeyPairBincode),
      oneTimePreKeyPair ? base64ToBytes(oneTimePreKeyPair.keyPairBincode) : null,
      base64ToBytes(input.remoteIdentityKey),
      handshake.ephemeralPublicKey,
    );
  }

  async encrypt(sessionId: string, plaintext: Uint8Array | string): Promise<Uint8Array> {
    const manager = await this.sessionManager();
    const plaintextBytes = typeof plaintext === "string" ? utf8ToBytes(plaintext) : copyBytes(plaintext);
    const wire = manager.encrypt(sessionId, plaintextBytes);
    assertRustWireFormat(wire);
    return wire;
  }

  async decrypt(sessionId: string, encryptedWire: Uint8Array | Base64String | RustE2eeEnvelope): Promise<Uint8Array> {
    const manager = await this.sessionManager();
    const wire =
      typeof encryptedWire === "string" || encryptedWire instanceof Uint8Array
        ? optionalBytes(encryptedWire, "encryptedWire")
        : envelopeWireBytes(encryptedWire);
    assertRustWireFormat(wire);
    return manager.decrypt(sessionId, wire);
  }

  async exportSession(sessionId: string): Promise<Uint8Array> {
    const manager = await this.sessionManager();
    return manager.export_session(sessionId);
  }

  async restoreSession(sessionId: string, stateBytes: Uint8Array | Base64String): Promise<void> {
    const manager = await this.sessionManager();
    manager.restore_session(sessionId, optionalBytes(stateBytes, "stateBytes"));
  }

  async removeSession(sessionId: string): Promise<void> {
    const manager = await this.sessionManager();
    manager.remove_session(sessionId);
  }
}

export const createWebE2eeRuntime = (): WebE2eeRuntime => new WebE2eeRuntime();
