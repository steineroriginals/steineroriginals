import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv } from "vite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, repoRoot, "");
  const publicR2 =
    env.PUBLIC_R2_BASE_URL?.trim().replace(/\/$/, "") ??
    process.env.PUBLIC_R2_BASE_URL?.trim().replace(/\/$/, "") ??
    "";

  return {
    root: __dirname,
    publicDir: path.join(__dirname, "public"),
    envDir: repoRoot,
    define: {
      __PUBLIC_R2_BASE_URL__: JSON.stringify(publicR2),
    },
    build: {
      outDir: path.join(__dirname, "dist"),
      emptyOutDir: true,
      sourcemap: true,
    },
    server: {
      port: 5173,
      open: false,
    },
  };
});
