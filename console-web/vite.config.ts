import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { SERVICE_PORTS } from '@agenthix/core'

// The Fleet Console's own server serves dist/ in the image (console/src/http/app.ts). In development, `npm run dev`
// serves the app here and passes /api to that server, as if the page came from it: its guards refuse another origin.
const CONSOLE = `http://127.0.0.1:${SERVICE_PORTS.console.server}`

// The bundled fonts' licence (SIL OFL 1.1) travels with them: each copy of the fonts carries its notice.
function fontLicences(): Plugin {
  const require = createRequire(import.meta.url)
  return {
    name: 'font-licences',
    apply: 'build',
    generateBundle() {
      for (const font of ['inter', 'jetbrains-mono']) {
        const licence = require.resolve(`@fontsource-variable/${font}/LICENSE`)
        this.emitFile({ type: 'asset', fileName: `licences/${font}-OFL.txt`, source: readFileSync(licence, 'utf8') })
      }
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), fontLicences()],
  // ui/ and its own node_modules are linked, not copied: one React, whoever imports it.
  resolve: { dedupe: ['react', 'react-dom', 'lucide-react'] },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // Every asset a file of its own: the server's CSP allows nothing inline, data: URLs included.
    assetsInlineLimit: 0,
  },
  server: {
    host: '127.0.0.1',
    port: SERVICE_PORTS.console.web,
    // Refuses when taken rather than moving: the proxy and the console's guards expect this one address.
    strictPort: true,
    // Help reads the user guide's pages from docs/guide/ at the repository's root.
    fs: { allow: ['..'] },
    proxy: {
      '/api': {
        target: CONSOLE,
        changeOrigin: true,
        configure: proxy => {
          proxy.on('proxyReq', req => { if (req.getHeader('origin')) req.setHeader('origin', CONSOLE) })
        },
      },
    },
  },
})
