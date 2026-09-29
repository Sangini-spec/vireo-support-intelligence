// Managed workflow supervisor: the Python child never runs as an orphan service.
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
const directory = path.dirname(fileURLToPath(import.meta.url));
const python = process.env.VIREO_PYTHON || "python3";
const analyticsPort = process.env.VIREO_ANALYTICS_PORT || "18765";
const children = [];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill("SIGTERM");
  setTimeout(() => {
    for (const child of children) child.kill("SIGKILL");
    process.exit(code);
  }, 2000).unref();
}
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => stop());
function run(command, args, options = {}) {
  const child = spawn(command, args, { stdio: "inherit", cwd: directory, ...options });
  children.push(child);
  child.on("error", () => stop(1));
  return child;
}
function finish(child) {
  return new Promise((resolve, reject) => {
    child.on("exit", code => code === 0 ? resolve() : reject(new Error(`Setup command failed (${code})`)));
    child.on("error", reject);
  });
}
try {
  // Dependencies are installed by Replit's managed package system, not at startup.
  await finish(run(python, ["-c", "import fastapi, uvicorn, pandas, httpx, jsonschema, yaml"]));
  const analytics = run(python, ["-m", "uvicorn", "app:app", "--host", "127.0.0.1", "--port", analyticsPort],
                        { cwd: path.join(directory, "python") });
  analytics.on("exit", code => { if (!stopping) stop(code || 1); });
  const env = { ...process.env, VIREO_ANALYTICS_URL: `http://127.0.0.1:${analyticsPort}` };
  const gateway = run(process.execPath, ["--enable-source-maps", path.join(directory, "dist/index.mjs")], { env });
  gateway.on("exit", code => { if (!stopping) stop(code || 1); });
} catch (error) {
  process.stderr.write(`Vireo startup failed: ${error.message}. See README setup instructions.\n`);
  stop(1);
}