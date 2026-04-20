import { build as esbuild } from "esbuild";
import { rm } from "node:fs/promises";
import { artifactDir, sharedConfig } from "./esbuild.config.mjs";
import path from "node:path";

async function buildAll() {
  const distDir = path.resolve(artifactDir, "dist");
  await rm(distDir, { recursive: true, force: true });
  await esbuild(sharedConfig());
}

buildAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
