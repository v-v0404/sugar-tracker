import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Relative base so the built app works when hosted at
// https://<username>.github.io/<repo-name>/ (a subpath), not just at a domain root.
export default defineConfig({
  plugins: [react()],
  base: "./",
});
