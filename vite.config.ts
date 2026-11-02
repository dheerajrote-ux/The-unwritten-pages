import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import fs from "node:fs";

// `vite build --mode demo` produces a self-contained static build (hash routing,
// relative asset paths, in-browser data). Demo PDFs live in /demo-assets and are
// ONLY bundled for demo builds, so production never exposes public PDF URLs.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  const artifact = mode === "artifact";
  // Production builds never fall back to demo assets: the app connects to the
  // public project in src/lib/public-supabase.ts unless env vars override it.
  const demo = artifact || mode === "demo" || env.VITE_DATA_MODE === "demo";
  return {
    plugins: [
      react(),
      tailwindcss(),
      {
        // On Vercel, static files win over rewrites. Renaming the shell lets every
        // route (including "/") pass through /api/meta for server-side social tags.
        name: "vercel-app-shell",
        apply: "build",
        closeBundle() {
          if (!process.env.VERCEL || demo) return;
          const dir = path.resolve(__dirname, "dist");
          if (fs.existsSync(path.join(dir, "index.html"))) fs.renameSync(path.join(dir, "index.html"), path.join(dir, "app.html"));
        },
      },
    ],
    base: mode === "demo" || artifact ? "./" : "/",
    // The artifact preview can't host PDFs, so it ships pre-rendered page images instead.
    publicDir: artifact ? "demo-assets-artifact" : demo ? "demo-assets" : "public",
    resolve: { alias: { "@": path.resolve(__dirname, "src") } },
    build: {
      outDir: artifact ? "dist-artifact" : mode === "demo" ? "dist-demo" : "dist",
      chunkSizeWarningLimit: 1600,
      // Inline fonts as data URIs in the artifact build (its CSP only allows data: fonts).
      assetsInlineLimit: artifact ? 400_000 : 4096,
    },
  };
});
