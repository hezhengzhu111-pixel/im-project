/**
 * Tauri desktop E2EE adapter.
 *
 * Bridges the native Rust `e2ee-core` bridge (via Tauri IPC) to the
 * `E2eeRuntime` interface used by the shared e2ee-core package.
 */

import { invoke } from "@tauri-apps/api/core";
import type {
  E2eeRuntime,
  RustLocalE2eeKeyMaterial,
  RustPublicPreKeyBundle,
  RustE2eeEnvelope,
  GeneratePreKeyBundleOptions,
  RustPreKey,
  BinaryInput,
  Base64String,
} from "@im/shared-e2ee-core";
import {
  base64ToBytes,
  asBase64String,
  copyBytes,
  utf8ToBytes,
  assertRustWireFormat,
  envelopeWireBytes,
} from "@im/shared-e2ee-core";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const RUST_E2EE_ENVELOPE_VERSION = 2 as const;
const RUST_E2EE_ALGORITHM = "rust-x25519-x3dh-dr-v1" as const;

const optionalBytes = (value: Uint8Array | Base64String, label: string): Uint8Array =>
  typeof value === "string" ? base64ToBytes(asBase64String(value, label)) : copyBytes(value);

/** Convert a Uint8Array to a JSON-compatible number array for Tauri IPC. */
const toJSONBytes = (bytes: Uint8Array): number[] => Array.from(bytes);

/** Parse a number array (from Tauri) into a Uint8Array. */
const fromJSONBytes = (arr: number[]): Uint8Array => new Uint8Array(arr);

/** Convert the Rust public bundle (with Vec<u8> fields) to the shared type. */
const parsePublicBundle = (raw: Record<string, unknown>): RustPublicPreKeyBundle => {
  const identityKey = raw.identityKey as number[];
  const signingKey = raw.signingKey as number[];
  const signedPreKeyRaw = raw.signedPreKey as Record<string, unknown>;
  const signedPreKeySignature = raw.signedPreKeySignature as number[];
  const oneTimePreKeysRaw = raw.oneTimePreKeys as Array<Record<string, unknown>> | undefined;

  const signedPreKey: RustPreKey = {
    id: signedPreKeyRaw.id as number,
    key: btoa(String.fromCharCode(...(signedPreKeyRaw.key as number[]))),
  };

  const oneTimePreKeys: RustPreKey[] | undefined = oneTimePreKeysRaw?.map((otk) => ({
    id: otk.id as number,
    key: btoa(String.fromCharCode(...(otk.key as number[]))),
  }));

  return {
    identityKey: btoa(String.fromCharCode(...identityKey)),
    signingKey: btoa(String.fromCharCode(...signingKey)),
    signedPreKey,
    signedPreKeySignature: btoa(String.fromCharCode(...signedPreKeySignature)),
    oneTimePreKeys,
    oneTimePreKey: oneTimePreKeys?.[0],
  };
};

// ---------------------------------------------------------------------------
// TauriE2eeRuntime
// ---------------------------------------------------------------------------

export class TauriE2eeRuntime implements E2eeRuntime {
  async createIdentity(options?: GeneratePreKeyBundleOptions): Promise<RustLocalE2eeKeyMaterial> {
    return this.generatePreKeyBundle(options);
  }

  async generatePreKeyBundle(options?: GeneratePreKeyBundleOptions): Promise<RustLocalE2eeKeyMaterial> {
    const result = await invoke<{
      version: number;
      identityKeyPairBincode: number[];
      signedPreKeyPairBincode: number[];
      signingKeyPairBincode?: number[];
      oneTimePreKeyPairs: Array<{
        id: number;
        keyPairBincode: number[];
        publicKey: number[];
      }>;
      publicBundle: Record<string, unknown>;
    }>("e2ee_generate_key_bundle", {
      signedPreKeyId: options?.signedPreKeyId ?? 1,
      oneTimePreKeyStartId: options?.oneTimePreKeyStartId ?? 1,
      oneTimePreKeyCount: options?.oneTimePreKeyCount ?? 100,
    });

    return {
      version: RUST_E2EE_ENVELOPE_VERSION,
      identityKeyPairBincode: btoa(String.fromCharCode(...result.identityKeyPairBincode)),
      signedPreKeyPairBincode: btoa(String.fromCharCode(...result.signedPreKeyPairBincode)),
      oneTimePreKeyPairs: result.oneTimePreKeyPairs.map((otk) => ({
        id: otk.id,
        keyPairBincode: btoa(String.fromCharCode(...otk.keyPairBincode)),
        publicKey: btoa(String.fromCharCode(...otk.publicKey)),
      })),
      publicBundle: parsePublicBundle(result.publicBundle),
    };
  }

  async createOutboundSession(input: {
    sessionId: string;
    localKeys: RustLocalE2eeKeyMaterial;
    remoteBundle: RustPublicPreKeyBundle;
  }): Promise<Uint8Array> {
    const bundle = input.remoteBundle;
    const oneTimePreKey = bundle.oneTimePreKey ?? bundle.oneTimePreKeys?.[0] ?? null;

    const remoteBundleJson = {
      identity_key: toJSONBytes(base64ToBytes(asBase64String(bundle.identityKey, "identityKey"))),
      signing_key: toJSONBytes(base64ToBytes(asBase64String(bundle.signingKey, "signingKey"))),
      signed_pre_key: {
        id: bundle.signedPreKey.id,
        key: toJSONBytes(
          base64ToBytes(asBase64String(bundle.signedPreKey.key, "signedPreKey.key")),
        ),
      },
      signed_pre_key_signature: toJSONBytes(
        base64ToBytes(asBase64String(bundle.signedPreKeySignature, "signedPreKeySignature")),
      ),
      one_time_pre_key: oneTimePreKey
        ? {
            id: oneTimePreKey.id,
            key: toJSONBytes(
              base64ToBytes(asBase64String(oneTimePreKey.key, "oneTimePreKey.key")),
            ),
          }
        : null,
    };

    const handshake = await invoke<number[]>("e2ee_create_outbound_session", {
      sessionId: input.sessionId,
      identityKeyPairBincode: toJSONBytes(
        base64ToBytes(asBase64String(input.localKeys.identityKeyPairBincode, "identityKeyPairBincode")),
      ),
      remoteBundleJson,
    });

    return fromJSONBytes(handshake);
  }

  async createInboundSession(input: {
    sessionId: string;
    localKeys: RustLocalE2eeKeyMaterial;
    remoteIdentityKey: string;
    handshake: BinaryInput;
  }): Promise<void> {
    const handshakeBytes = optionalBytes(input.handshake, "handshake");
    const remoteIdKey = base64ToBytes(asBase64String(input.remoteIdentityKey, "remoteIdentityKey"));

    // Find the matching OTK pair based on the handshake's otk_id
    const otkId = readUint32Be(handshakeBytes, 36);
    const oneTimePreKeyPair =
      otkId === 0xffffffff
        ? null
        : input.localKeys.oneTimePreKeyPairs.find((pair) => pair.id === otkId) ?? null;

    await invoke("e2ee_create_inbound_session", {
      sessionId: input.sessionId,
      identityKeyPairBincode: toJSONBytes(
        base64ToBytes(asBase64String(input.localKeys.identityKeyPairBincode, "identityKeyPairBincode")),
      ),
      signedPreKeyPairBincode: toJSONBytes(
        base64ToBytes(asBase64String(input.localKeys.signedPreKeyPairBincode, "signedPreKeyPairBincode")),
      ),
      oneTimePreKeyPairBincode: oneTimePreKeyPair
        ? toJSONBytes(base64ToBytes(asBase64String(oneTimePreKeyPair.keyPairBincode, "otk.keyPairBincode")))
        : null,
      remoteIdentityKey: toJSONBytes(remoteIdKey),
      handshake: toJSONBytes(handshakeBytes),
    });
  }

  async encrypt(sessionId: string, plaintext: Uint8Array | string): Promise<Uint8Array> {
    const plaintextBytes =
      typeof plaintext === "string" ? utf8ToBytes(plaintext) : copyBytes(plaintext);
    const wire = await invoke<number[]>("e2ee_encrypt", {
      sessionId,
      plaintext: toJSONBytes(plaintextBytes),
    });
    const result = fromJSONBytes(wire);
    assertRustWireFormat(result);
    return result;
  }

  async decrypt(
    sessionId: string,
    encryptedWire: Uint8Array | Base64String | RustE2eeEnvelope,
  ): Promise<Uint8Array> {
    const wire =
      typeof encryptedWire === "string" || encryptedWire instanceof Uint8Array
        ? optionalBytes(encryptedWire, "encryptedWire")
        : envelopeWireBytes(encryptedWire);
    assertRustWireFormat(wire);
    const result = await invoke<number[]>("e2ee_decrypt", {
      sessionId,
      wire: toJSONBytes(wire),
    });
    return fromJSONBytes(result);
  }

  async exportSession(sessionId: string): Promise<Uint8Array> {
    const result = await invoke<number[]>("e2ee_export_session", { sessionId });
    return fromJSONBytes(result);
  }

  async restoreSession(sessionId: string, stateBytes: BinaryInput): Promise<void> {
    const bytes = optionalBytes(stateBytes, "stateBytes");
    await invoke("e2ee_restore_session", {
      sessionId,
      stateBytes: toJSONBytes(bytes),
    });
  }

  async removeSession(sessionId: string): Promise<void> {
    await invoke("e2ee_remove_session", { sessionId });
  }
}

// ---------------------------------------------------------------------------
// Helpers (internal)
// ---------------------------------------------------------------------------

function readUint32Be(bytes: Uint8Array, offset: number): number {
  if (bytes.byteLength < offset + 4) {
    return 0xffffffff;
  }
  return (
    ((bytes[offset] << 24) |
      (bytes[offset + 1] << 16) |
      (bytes[offset + 2] << 8) |
      bytes[offset + 3]) >>>
    0
  );
}

export const createTauriE2eeRuntime = (): TauriE2eeRuntime => new TauriE2eeRuntime();
