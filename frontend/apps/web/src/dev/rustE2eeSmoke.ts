import { bytesToUtf8 } from "@im/shared-e2ee-core";
import { createWebE2eeRuntime } from "@im/shared-e2ee-core/runtime/web";

interface SmokeStep {
  name: string;
  detail: string;
}

interface SmokeResult {
  ok: boolean;
  steps: SmokeStep[];
  error?: string;
}

const assert = (condition: boolean, message: string): void => {
  if (!condition) {
    throw new Error(message);
  }
};

const wireHeaderLen = (wire: Uint8Array): number => {
  assert(wire.byteLength >= 4, "wire is too short to contain header_len");
  return ((wire[0] << 24) | (wire[1] << 16) | (wire[2] << 8) | wire[3]) >>> 0;
};

export const runRustE2eeWebSmoke = async (): Promise<SmokeResult> => {
  const steps: SmokeStep[] = [];
  const aliceRuntime = createWebE2eeRuntime();
  const bobRuntime = createWebE2eeRuntime();
  const sessionAliceToBob = "web-smoke-alice-bob";
  const sessionBobInbound = "web-smoke-bob-inbound";

  try {
    const aliceKeys = await aliceRuntime.generatePreKeyBundle({
      signedPreKeyId: 1,
      oneTimePreKeyStartId: 100,
      oneTimePreKeyCount: 2,
    });
    const bobKeys = await bobRuntime.generatePreKeyBundle({
      signedPreKeyId: 1,
      oneTimePreKeyStartId: 200,
      oneTimePreKeyCount: 2,
    });
    steps.push({ name: "generatePreKeyBundle", detail: "Alice and Bob Rust key material generated" });

    const handshake = await aliceRuntime.createOutboundSession({
      sessionId: sessionAliceToBob,
      localKeys: aliceKeys,
      remoteBundle: bobKeys.publicBundle,
    });
    assert(handshake.byteLength >= 40, `handshake too short: ${handshake.byteLength}`);
    steps.push({ name: "createOutboundSession", detail: `handshake=${handshake.byteLength} bytes` });

    await bobRuntime.createInboundSession({
      sessionId: sessionBobInbound,
      localKeys: bobKeys,
      remoteIdentityKey: aliceKeys.publicBundle.identityKey,
      handshake,
    });
    steps.push({ name: "createInboundSession", detail: "Bob inbound session created from Alice handshake" });

    const wire1 = await aliceRuntime.encrypt(sessionAliceToBob, "hello rust e2ee from web");
    const headerLen = wireHeaderLen(wire1);
    assert(headerLen === 52, `expected Rust header_len=52, got ${headerLen}`);
    const plain1 = await bobRuntime.decrypt(sessionBobInbound, wire1);
    assert(bytesToUtf8(plain1) === "hello rust e2ee from web", "Bob decrypted plaintext mismatch");
    steps.push({ name: "encrypt/decrypt", detail: `wire=${wire1.byteLength} bytes, header_len=${headerLen}` });

    const exportedAlice = await aliceRuntime.exportSession(sessionAliceToBob);
    assert(exportedAlice.byteLength > 0, "exported Alice session is empty");
    await aliceRuntime.removeSession(sessionAliceToBob);
    await aliceRuntime.restoreSession(sessionAliceToBob, exportedAlice);
    const wire2 = await aliceRuntime.encrypt(sessionAliceToBob, "after restore from rust wasm");
    const plain2 = await bobRuntime.decrypt(sessionBobInbound, wire2);
    assert(bytesToUtf8(plain2) === "after restore from rust wasm", "restore decrypt plaintext mismatch");
    steps.push({ name: "export/restore", detail: `state=${exportedAlice.byteLength} bytes` });

    return { ok: true, steps };
  } catch (error) {
    return {
      ok: false,
      steps,
      error: error instanceof Error ? error.stack || error.message : String(error),
    };
  } finally {
    await aliceRuntime.removeSession(sessionAliceToBob).catch(() => undefined);
    await bobRuntime.removeSession(sessionBobInbound).catch(() => undefined);
  }
};

export const installRustE2eeSmokePage = async (): Promise<void> => {
  const result = await runRustE2eeWebSmoke();
  const color = result.ok ? "#0f7b0f" : "#b00020";
  const title = result.ok ? "PASS" : "FAIL";
  const stepHtml = result.steps
    .map((step) => `<li><strong>${step.name}</strong>: ${step.detail}</li>`)
    .join("");
  document.body.innerHTML = `
    <main style="font-family: system-ui, sans-serif; max-width: 880px; margin: 40px auto; line-height: 1.55;">
      <h1 style="color: ${color};">Rust E2EE Web Smoke: ${title}</h1>
      <p>This browser page called <code>@im/shared-e2ee-core/runtime/web</code>, which loads Rust WASM and uses <code>WasmSessionManager</code>.</p>
      <ul>${stepHtml}</ul>
      ${result.error ? `<pre style="white-space: pre-wrap; background: #fff0f0; padding: 16px; border: 1px solid #f0a0a0;">${result.error}</pre>` : ""}
    </main>
  `;
  if (!result.ok) {
    throw new Error(result.error || "Rust E2EE smoke failed");
  }
};
