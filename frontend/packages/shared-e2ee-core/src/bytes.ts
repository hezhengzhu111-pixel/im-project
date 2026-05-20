const BASE64_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const BASE64_LOOKUP = new Map<string, number>(
  [...BASE64_ALPHABET].map((char, index) => [char, index]),
);

declare const base64StringBrand: unique symbol;

export type Base64String = string & { readonly [base64StringBrand]: "Base64String" };

export const concatBytes = (...chunks: Uint8Array[]): Uint8Array => {
  const total = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
};

export const copyBytes = (input: Uint8Array): Uint8Array => {
  const output = new Uint8Array(input.byteLength);
  output.set(input);
  return output;
};

export const bytesToBase64 = (bytes: Uint8Array): Base64String => {
  let output = "";
  let index = 0;
  for (; index + 2 < bytes.length; index += 3) {
    const chunk = (bytes[index] << 16) | (bytes[index + 1] << 8) | bytes[index + 2];
    output += BASE64_ALPHABET[(chunk >> 18) & 63];
    output += BASE64_ALPHABET[(chunk >> 12) & 63];
    output += BASE64_ALPHABET[(chunk >> 6) & 63];
    output += BASE64_ALPHABET[chunk & 63];
  }
  if (index < bytes.length) {
    const remaining = bytes.length - index;
    const chunk = bytes[index] << 16 | (remaining === 2 ? bytes[index + 1] << 8 : 0);
    output += BASE64_ALPHABET[(chunk >> 18) & 63];
    output += BASE64_ALPHABET[(chunk >> 12) & 63];
    output += remaining === 2 ? BASE64_ALPHABET[(chunk >> 6) & 63] : "=";
    output += "=";
  }
  return output as Base64String;
};

export const base64ToBytes = (value: string): Uint8Array => {
  const normalized = value.replace(/\s/g, "");
  if (normalized.length === 0) {
    return new Uint8Array(0);
  }
  if (normalized.length % 4 !== 0) {
    throw new Error("Invalid base64 length");
  }
  const padding =
    normalized.endsWith("==") ? 2 : normalized.endsWith("=") ? 1 : 0;
  const outputLength = (normalized.length / 4) * 3 - padding;
  const output = new Uint8Array(outputLength);
  let outputIndex = 0;

  for (let index = 0; index < normalized.length; index += 4) {
    const a = BASE64_LOOKUP.get(normalized[index]);
    const b = BASE64_LOOKUP.get(normalized[index + 1]);
    const c = normalized[index + 2] === "=" ? 0 : BASE64_LOOKUP.get(normalized[index + 2]);
    const d = normalized[index + 3] === "=" ? 0 : BASE64_LOOKUP.get(normalized[index + 3]);
    if (a == null || b == null || c == null || d == null) {
      throw new Error("Invalid base64 data");
    }
    const chunk = (a << 18) | (b << 12) | (c << 6) | d;
    if (outputIndex < outputLength) output[outputIndex++] = (chunk >> 16) & 255;
    if (outputIndex < outputLength) output[outputIndex++] = (chunk >> 8) & 255;
    if (outputIndex < outputLength) output[outputIndex++] = chunk & 255;
  }

  return output;
};

export const asBase64String = (value: string, label = "value"): Base64String => {
  try {
    base64ToBytes(value);
  } catch (error) {
    const detail = error instanceof Error && error.message ? `: ${error.message}` : "";
    throw new Error(`${label} must be Base64-encoded binary data${detail}`);
  }
  return value as Base64String;
};

export const utf8ToBytes = (value: string): Uint8Array => {
  if (typeof TextEncoder !== "undefined") {
    return new TextEncoder().encode(value);
  }
  const encoded = encodeURIComponent(value).replace(
    /%([0-9A-F]{2})/g,
    (_match, hex: string) => String.fromCharCode(Number.parseInt(hex, 16)),
  );
  return Uint8Array.from(encoded, (char) => char.charCodeAt(0));
};

export const bytesToUtf8 = (bytes: Uint8Array): string => {
  if (typeof TextDecoder !== "undefined") {
    return new TextDecoder().decode(bytes);
  }
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return decodeURIComponent(
    [...binary].map((char) => `%${char.charCodeAt(0).toString(16).padStart(2, "0")}`).join(""),
  );
};

export const secureRandomBytes = (length: number): Uint8Array => {
  if (!Number.isInteger(length) || length <= 0) {
    throw new Error("Invalid random byte length");
  }
  const cryptoLike = globalThis.crypto;
  if (!cryptoLike || typeof cryptoLike.getRandomValues !== "function") {
    throw new Error("Secure random source unavailable");
  }
  const output = new Uint8Array(length);
  cryptoLike.getRandomValues(output);
  return output;
};

export const hasSecureRandomSource = (): boolean =>
  Boolean(globalThis.crypto && typeof globalThis.crypto.getRandomValues === "function");
