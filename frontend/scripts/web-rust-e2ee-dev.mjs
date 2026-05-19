import { spawn } from "node:child_process";
import process from "node:process";

const webUrl = "http://localhost:3000/?rustE2eeSmoke=1";

console.log("");
console.log("Rust E2EE Web smoke verification");
console.log("--------------------------------");
console.log("1. Vite will start on http://localhost:3000");
console.log(`2. Open ${webUrl}`);
console.log("3. The page will replace itself with a Rust E2EE smoke result.");
console.log("4. PASS means Web called Rust WASM to create sessions, encrypt, decrypt, export, and restore.");
console.log("");

const child = spawn("npm", ["run", "dev", "--workspace=@im/web", "--", "--host", "0.0.0.0", "--port", "3000"], {
  stdio: "inherit",
  shell: process.platform === "win32",
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
