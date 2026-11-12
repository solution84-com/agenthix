import { defineConfig } from "vite";
import { wasp } from "wasp/client/vite";
import tailwindcss from "@tailwindcss/vite";
import { SERVICE_PORTS } from "@agenthix/core";

// One environment variable moves each port; the numbers come from the ports file.
const WEB_PORT = Number(process.env.HQ_WEB_PORT) || SERVICE_PORTS.hq.web;
const SERVER = `http://localhost:${Number(process.env.HQ_SERVER_PORT) || SERVICE_PORTS.hq.server}`;
// hq's relay (adr-0153): a file's bytes, and the line sites dial to serve them.
const RELAY = `http://localhost:${Number(process.env.RELAY_SERVER_PORT) || SERVICE_PORTS.relay.server}`;

export default defineConfig({
  plugins: [wasp(), tailwindcss()],
  // The highlighter's ES build imports lowlight without file extensions, which Node can't load when the app is
  // prerendered; bundling it into the server build resolves them.
  ssr: { noExternal: ['react-syntax-highlighter'] },
  // Packages reached only after sign-in (the rich text editor in InlineEdit and the agent editors; the pairing page's
  // QR code) are missed by Vite's start-up scan and optimised on the first screen that shows one, which reloads every
  // open page, browser tests included.
  optimizeDeps: {
    include: ['@tiptap/react', '@tiptap/starter-kit', '@tiptap/extension-placeholder', '@tiptap/markdown', 'react-qr-code'],
  },
  server: {
    // `start.sh --tailnet` sets HQ_DEV_LISTEN_HOST=127.0.0.1: reached through `tailscale serve` only.
    host: process.env.HQ_DEV_LISTEN_HOST || true,
    port: WEB_PORT,
    // Refuses when the port is taken instead of moving to the next one: hq's web address is fixed in .env.server.
    strictPort: true,
    // `.ts.net` is the machine's Tailscale name (`start.sh --tailnet`). HMR needs no setting there:
    // the client derives wss://<name>:4443 from the page's own address.
    allowedHosts: ['.local', 'localhost', '.localhost', '.ts.net'],
    open: true,
    proxy: {
      // Proxy all API and socket traffic to the Express backend
      '/api': SERVER,
      // Only a ticket's path, not the React routes that start with t (/tasks). The Host header is kept (no
      // changeOrigin): the relay answers only on the files host, and its check reads it.
      '^/t/': { target: RELAY, changeOrigin: false },
      // The bare address (adr-0153): a ticket opened on HQ's own address, where there is no files address.
      '^/relay/': { target: RELAY, changeOrigin: false },
      '/relay-line': { target: RELAY, changeOrigin: false, ws: true },
      // The PDF viewer page, which the relay serves on the files host only (files.localhost in development).
      '^/viewer/pdf(/|$)': { target: RELAY, changeOrigin: false },
    },
  },
});
