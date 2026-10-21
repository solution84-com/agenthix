import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'
import { globSync, readFileSync } from 'node:fs'

const exclude = ['**/node_modules/**', '**/dist/**', '**/.agenthix/**', '**/.wasp/**', '**/e2e/**', '**/*.integration.test.ts']

// Starting a fresh process for each test file is most of this suite's time. A file that reaches outside
// itself — a module mock, a stub, a spy, fake timers, environment variables, globals or a DOM environment —
// keeps that fresh process, so nothing it changes reaches another file. Every other file only passes values
// to code and checks what comes back, so those run one after another in a shared process instead. A file
// that starts using any of these moves back to its own process without anyone having to say so.
const REACHES_OUTSIDE =
  /\bvi\.(mock|doMock|unmock|doUnmock|hoisted|stubGlobal|stubEnv|unstubAllGlobals|unstubAllEnvs|resetModules|spyOn|useFakeTimers|setSystemTime)\b|process\.(env|on|once|chdir|exit)\b|globalThis|@vitest-environment/

const sharedProcessFiles = globSync('src/**/*.test.{ts,tsx}', { cwd: __dirname, exclude: (name) => name.endsWith('.integration.test.ts') })
  .filter((file) => !REACHES_OUTSIDE.test(readFileSync(path.join(__dirname, file), 'utf8')))

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    globals: true,
    // At most 4 test processes at once (VITEST_MAX_WORKERS overrides). Vitest's
    // default is one per CPU core less one, and a few overlapping runs of that
    // exhausted a 10-core machine's memory.
    maxWorkers: Number(process.env.VITEST_MAX_WORKERS) || 4,
    exclude,
    globalSetup: ['./src/test/storage-root.ts'],
    setupFiles: ['./src/test/environment-setup.ts', './src/test/provider-guard-setup.ts'],
    projects: [
      { extends: true, test: { name: 'isolated', exclude: [...exclude, ...sharedProcessFiles] } },
      { extends: true, test: { name: 'shared', include: sharedProcessFiles, isolate: false } },
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'json-summary', 'html'],
      reportsDirectory: './coverage',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['**/__tests__/**', '**/*.test.ts', '**/*.test.tsx', '**/*.integration.test.ts', 'e2e/**'],
    },
  },
  resolve: {
    dedupe: ['react', 'react-dom'],
    alias: {
      'wasp/server': path.resolve(
        __dirname,
        '.wasp/out/sdk/wasp/dist/server/HttpError.js'
      ),
    },
  },
})
