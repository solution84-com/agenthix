import { defineConfig } from "vite";
import { wasp } from "wasp/client/vite";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [wasp(), tailwindcss()],
  server: {
    // `start.sh --tailnet` sets HQ_DEV_LISTEN_HOST=127.0.0.1: reached through `tailscale serve` only.
    host: process.env.HQ_DEV_LISTEN_HOST || true,
    port: 4100,
    // `.ts.net` is the machine's Tailscale name (`start.sh --tailnet`). HMR needs no setting there:
    // the client derives wss://<name>:4443 from the page's own address.
    allowedHosts: ['.local', 'localhost', '.ts.net'],
    open: true,
    proxy: {
      // Proxy all API and socket traffic to the Express backend
      '/api': 'http://localhost:4101',
      // Only proxy the Express file-serving sub-paths, not the React route /agents/:id
      '^/agents/[^/]+/images': 'http://localhost:4101',
      '/files': 'http://localhost:4101',
      '/presets': 'http://localhost:4101',
    },
  },
});
