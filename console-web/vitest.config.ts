import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  resolve: { dedupe: ['react', 'react-dom', 'lucide-react'] },
  // Help reads the user guide's pages from docs/guide/ at the repository's root.
  server: { fs: { allow: ['..'] } },
  test: {
    environment: 'jsdom',
    // withFeature (adr-0172) uses the runner's globals; the run's experimental failures are summarised at its end.
    globals: true,
    globalSetup: ['./vitest.experimental-failures-setup.ts'],
    // At most 4 test processes at once (VITEST_MAX_WORKERS overrides), as in console/.
    maxWorkers: Number(process.env.VITEST_MAX_WORKERS) || 4,
    exclude: ['**/node_modules/**', 'dist/**'],
    setupFiles: ['./vitest.setup.ts'],
  },
})
