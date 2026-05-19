import { mkdirSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const frontendRoot = path.resolve(path.dirname(scriptPath), "..");
const repoRoot = path.resolve(frontendRoot, "..");
const backendRoot = path.join(repoRoot, "backend");
const outDir = path.join(frontendRoot, "packages", "rust-e2ee-wasm", "src");
const wasmInput = path.join(
  backendRoot,
  "target",
  "wasm32-unknown-unknown",
  "release",
  "e2ee_wasm.wasm",
);

const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    stdio: "inherit",
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
};

mkdirSync(outDir, { recursive: true });

run("cargo", ["build", "-p", "e2ee-wasm", "--target", "wasm32-unknown-unknown", "--release"], {
  cwd: backendRoot,
});

run("wasm-bindgen", ["--target", "web", "--out-dir", outDir, "--out-name", "e2ee_wasm", wasmInput], {
  cwd: repoRoot,
});
