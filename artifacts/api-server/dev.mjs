import { context as esbuildContext } from "esbuild";
import { rm } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import { artifactDir, sharedConfig } from "./esbuild.config.mjs";

const distDir = path.resolve(artifactDir, "dist");
const serverEntry = path.resolve(distDir, "index.mjs");

let serverProcess = null;

function startServer() {
  if (serverProcess) {
    serverProcess.kill("SIGTERM");
    serverProcess = null;
  }
  serverProcess = spawn(
    process.execPath,
    ["--enable-source-maps", serverEntry],
    { stdio: "inherit", env: { ...process.env, NODE_ENV: "development" } }
  );
  serverProcess.on("exit", (code, signal) => {
    if (signal !== "SIGTERM" && code !== null) {
      console.error(`[dev] Server exited with code ${code}`);
    }
  });
}

const restartPlugin = {
  name: "restart-on-build",
  setup(build) {
    build.onEnd((result) => {
      if (result.errors.length > 0) {
        console.error("[dev] Build failed, not restarting server.");
        return;
      }
      console.log("[dev] Build succeeded, restarting server...");
      startServer();
    });
  },
};

await rm(distDir, { recursive: true, force: true });

const ctx = await esbuildContext(sharedConfig([restartPlugin]));

await ctx.watch();
console.log("[dev] Watching for changes in src/...");

function shutdown() {
  ctx.dispose();
  if (serverProcess) serverProcess.kill("SIGTERM");
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
