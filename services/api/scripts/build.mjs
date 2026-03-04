import { build } from "esbuild";
import { mkdirSync } from "node:fs";

mkdirSync(new URL("../dist", import.meta.url), { recursive: true });

await build({
  entryPoints: [
  "src/handlers/health.ts",
  "src/handlers/me.ts",
  "src/handlers/tasks-create.ts",
  "src/handlers/tasks-list.ts",
  "src/handlers/tasks-update.ts",
  "src/handlers/tasks-delete.ts",
  "src/handlers/tasks-complete.ts"
],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  sourcemap: true,
  outdir: "dist/handlers",
});

console.log("API build complete.");