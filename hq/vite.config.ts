import { defineConfig } from "vite";
import { wasp } from "wasp/client/vite";
import tailwindcss from "@tailwindcss/vite";
import { SERVICE_PORTS } from "@agenthix/core";

// One environment variable moves each port; the numbers come from the ports file.
const WEB_PORT = Number(process.env.HQ_WEB_PORT) || SERVICE_PORTS.hq.web;
const SERVER = `http://localhost:${Number(process.env.HQ_SERVER_PORT) || SERVICE_PORTS.hq.server}`;

export default defineConfig({
  plugins: [wasp(), tailwindcss()],
  server: {
    // `start.sh --tailnet` sets HQ_DEV_LISTEN_HOST=127.0.0.1: reached through `tailscale serve` only.
    host: process.env.HQ_DEV_LISTEN_HOST || true,
    port: WEB_PORT,
    // Refuses when the port is taken instead of moving to the next one: hq's web address is fixed in .env.server.
    strictPort: true,
    // `.ts.net` is the machine's Tailscale name (`start.sh --tailnet`). HMR needs no setting there:
    // the client derives wss://<name>:4443 from the page's own address.
    allowedHosts: ['.local', 'localhost', '.ts.net'],
    open: true,
    proxy: {
      // Proxy all API and socket traffic to the Express backend
      '/api': SERVER,
      // Only proxy the Express file-serving sub-paths, not the React route /agents/:id
      '^/agents/[^/]+/images': SERVER,
      '/files': SERVER,
      '/presets': SERVER,
    },
  },
});
