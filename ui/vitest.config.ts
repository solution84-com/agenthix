import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  resolve: { dedupe: ['react', 'react-dom', 'lucide-react'] },
  test: {
    environment: 'jsdom',
    // At most 4 test processes at once (VITEST_MAX_WORKERS overrides), as in console-web/.
    maxWorkers: Number(process.env.VITEST_MAX_WORKERS) || 4,
    exclude: ['**/node_modules/**', 'dist/**'],
    setupFiles: ['./vitest.setup.ts'],
  },
})
