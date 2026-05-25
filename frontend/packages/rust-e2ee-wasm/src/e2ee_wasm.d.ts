/* tslint:disable */
/* eslint-disable */

export class WasmSessionManager {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Create an inbound session (Bob side).
     */
    create_inbound_session(session_id: string, identity_key_pair_bincode: Uint8Array, signed_pre_key_pair_bincode: Uint8Array, one_time_pre_key_pair_bincode: Uint8Array | null | undefined, remote_identity_key_bytes: Uint8Array, remote_ephemeral_key_bytes: Uint8Array): void;
    /**
     * Create an outbound session (Alice side).
     * Returns handshake bytes: ephemeral_pk(32) || spk_id(4 BE) || otk_id(4 BE)
     */
    create_outbound_session(session_id: string, identity_key_pair_bincode: Uint8Array, remote_bundle_json: string): Uint8Array;
    /**
     * Decrypt wire format back to plaintext
     */
    decrypt(session_id: string, encrypted: Uint8Array): Uint8Array;
    /**
     * Encrypt plaintext, returns wire format: header_len(4 BE) || RatchetHeader(52) || ciphertext
     */
    encrypt(session_id: string, plaintext: Uint8Array): Uint8Array;
    /**
     * Export session state as bincode bytes
     */
    export_session(session_id: string): Uint8Array;
    /**
     * Generate Rust E2EE key material and public pre-key bundle JSON.
     */
    generate_pre_key_bundle(signed_pre_key_id: number, one_time_pre_key_start_id: number, one_time_pre_key_count: number): string;
    constructor();
    /**
     * Remove a session
     */
    remove_session(session_id: string): void;
    /**
     * Restore session from bincode bytes.
     *
     * Fails if a session with the same id is already present.
     * Callers that intend to replace an existing session must call
     * `remove_session` first.
     */
    restore_session(session_id: string, state_bincode: Uint8Array): void;
}

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_wasmsessionmanager_free: (a: number, b: number) => void;
    readonly wasmsessionmanager_create_inbound_session: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number, l: number, m: number) => [number, number];
    readonly wasmsessionmanager_create_outbound_session: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => [number, number, number, number];
    readonly wasmsessionmanager_decrypt: (a: number, b: number, c: number, d: number, e: number) => [number, number, number, number];
    readonly wasmsessionmanager_encrypt: (a: number, b: number, c: number, d: number, e: number) => [number, number, number, number];
    readonly wasmsessionmanager_export_session: (a: number, b: number, c: number) => [number, number, number, number];
    readonly wasmsessionmanager_generate_pre_key_bundle: (a: number, b: number, c: number, d: number) => [number, number, number, number];
    readonly wasmsessionmanager_new: () => number;
    readonly wasmsessionmanager_remove_session: (a: number, b: number, c: number) => void;
    readonly wasmsessionmanager_restore_session: (a: number, b: number, c: number, d: number, e: number) => [number, number];
    readonly __wbindgen_exn_store: (a: number) => void;
    readonly __externref_table_alloc: () => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
