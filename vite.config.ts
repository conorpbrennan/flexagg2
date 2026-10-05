/// <reference types="vitest" />
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

// Vendor chunks for the two heavy libraries, so each is cached apart from app code. vega-lite, the vega
// runtime and d3 are split three ways because together they exceed the 500 kB warning. React gets its
// own chunk: left unassigned, Rollup hoists it into vendor-ag-grid (via ag-grid-react) and the entry
// then preloads the whole grid. CSS is never assigned: main.tsx imports ag-grid's styles globally, and in
// vendor-ag-grid they made the entry import the grid's JS too. Everything else is left to Rollup's default
// chunking.
const VENDOR_CHUNKS: [RegExp, string][] = [
  [/^(react|react-dom|scheduler)$/, "vendor-react"],
  [/^ag-grid-/, "vendor-ag-grid"],
  // vega-embed and vega-themes import vega-lite. In vendor-vega they made it and vendor-vega-lite import
  // each other, which Rollup warns about as a circular chunk.
  [/^vega-(lite|embed|themes)$/, "vendor-vega-lite"],
  [/^vega(-|$)/, "vendor-vega"],
  [/^d3-/, "vendor-d3"],
];

export function vendorChunk(id: string): string | undefined {
  if (/\.css($|\?)/.test(id)) return undefined;
  const pkg = id.replace(/\\/g, "/").match(/\/node_modules\/((?:@[^/]+\/)?[^/]+)\//)?.[1];
  if (!pkg) return undefined;
  return VENDOR_CHUNKS.find(([re]) => re.test(pkg))?.[1];
}

// Served at "/" on port 5175. In dev, /api/* is proxied to risk_api (:8010) with the prefix stripped.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ".", "");
  return {
    base: "/",
    plugins: [react()],
    build: {
      // ag-grid-community v32 is one prebuilt ~850 kB module (896 kB with ag-grid-react), so no
      // split can bring vendor-ag-grid under Vite's 500 kB default. It loads only with the lazy Pivot
      // route. The limit sits just above it, so anything else that grows past it still warns.
      chunkSizeWarningLimit: 950,
      rollupOptions: { output: { manualChunks: vendorChunk } },
    },
    server: {
      port: 5175,
      strictPort: true,
      proxy: {
        "/api": {
          target: env.RISK_API_URL || "http://127.0.0.1:8010",
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/api/, ""),
          // LLM endpoints stream raw text/markdown — never buffer them in the dev proxy.
          configure: (proxy) => {
            proxy.on("proxyRes", (proxyRes) => {
              proxyRes.headers["x-accel-buffering"] = "no";
            });
          },
        },
        // Views store (server/views_api.py): /views-api/views/... -> :8020/views/... A regex key, as for /ap/.
        "^/views-api/": {
          target: env.VIEWS_TARGET || "http://127.0.0.1:8020",
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/views-api\//, "/"),
        },
        // ActivePivot REST: /ap/activeviam/... -> :9095/activeviam/... (strips exactly AP_BASE).
        "^/ap/": {
          target: env.AP_TARGET || "http://127.0.0.1:9095",
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/ap\//, "/"),
        },
      },
    },
    test: {
      environment: "jsdom",
      globals: true,
      setupFiles: ["./src/test/setup.ts"],
      css: false,
    },
  };
});
