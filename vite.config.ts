import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tailwindcss(), reactRouter(), tsconfigPaths()],
  // PROTOTYPE worktree: node_modules is a symlink to the main checkout's,
  // so Vite must be allowed to serve files from there.
  server: { fs: { allow: [".", "../../../node_modules"] } },
});
