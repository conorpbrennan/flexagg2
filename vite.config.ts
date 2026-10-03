/// <reference types="vitest" />
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

// Served at "/" on port 5175. In dev, /api/* is proxied to risk_api (:8010) with the prefix stripped.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ".", "");
  return {
    base: "/",
    plugins: [react()],
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
