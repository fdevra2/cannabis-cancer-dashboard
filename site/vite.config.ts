import { defineConfig } from "vite";

// base "./" + hash routing: the build works from any path (GitHub Pages project site or locally).
export default defineConfig({
  base: "./",
  build: { outDir: "dist", sourcemap: false, target: "es2022" },
  test: { environment: "node", include: ["tests/**/*.test.ts"] },
} as any);
