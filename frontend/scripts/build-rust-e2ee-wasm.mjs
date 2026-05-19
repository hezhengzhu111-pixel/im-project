import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const frontendRoot = path.resolve(path.dirname(scriptPath), "..");
const repoRoot = path.resolve(frontendRoot, "..");
const backendRoot = path.join(repoRoot, "backend");
const outDir = path.join(frontendRoot, "packages", "rust-e2ee-wasm", "src");
const jsOutput = path.join(outDir, "e2ee_wasm.js");
const dtsOutput = path.join(outDir, "e2ee_wasm.d.ts");
const wasmOutput = path.join(outDir, "e2ee_wasm_bg.wasm");
const wasmInput = path.join(
  backendRoot,
  "target",
  "wasm32-unknown-unknown",
  "release",
  "e2ee_wasm.wasm",
);

const artifactsReady = () => existsSync(jsOutput) && existsSync(dtsOutput) && existsSync(wasmOutput);

const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
};

mkdirSync(outDir, { recursive: true });

if (process.env.E2EE_WASM_BUILD_SKIP === "1") {
  if (!artifactsReady()) {
    console.error("E2EE_WASM_BUILD_SKIP=1 but generated Rust WASM artifacts are missing.");
    console.error(`Expected: ${jsOutput}`);
    console.error(`Expected: ${dtsOutput}`);
    console.error(`Expected: ${wasmOutput}`);
    process.exit(1);
  }
  console.log("Rust E2EE WASM artifacts already exist; skipping Rust build.");
  process.exit(0);
}

run("rustup", ["target", "add", "wasm32-unknown-unknown"], { cwd: backendRoot });

run("cargo", ["build", "-p", "e2ee-wasm", "--target", "wasm32-unknown-unknown", "--release"], {
  cwd: backendRoot,
});

run("wasm-bindgen", ["--target", "web", "--out-dir", outDir, "--out-name", "e2ee_wasm", wasmInput], {
  cwd: repoRoot,
});
