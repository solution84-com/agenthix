import { defineConfig } from 'vitest/config'
import fs from 'node:fs'
import path from 'path'
import { parseEnv } from 'node:util'

// The model checks' settings and key come from the repository root's `.env.dev` (`.env.dev.example`), the one file of
// keys a maintainer's machine has; a value already in the environment wins. The key is the dev key for the chosen
// vendor (`DEV_<VENDOR>_API_KEY`), copied only into this run's MODEL_CHECK_API_KEY, never into the shell.
const dev = path.resolve(__dirname, '../.env.dev')
if (fs.existsSync(dev)) {
  const file = parseEnv(fs.readFileSync(dev, 'utf8'))
  for (const name of ['MODEL_CHECK_PROVIDER', 'MODEL_CHECK_MODELS', 'MODEL_CHECK_RUNS', 'MODEL_CHECK_BASE_URL']) {
    if (process.env[name] === undefined && file[name]) process.env[name] = file[name]
  }
  const vendor = (process.env.MODEL_CHECK_PROVIDER ?? '').trim().toUpperCase()
  const key = vendor ? file[`DEV_${vendor}_API_KEY`] : undefined
  if (process.env.MODEL_CHECK_API_KEY === undefined && key) process.env.MODEL_CHECK_API_KEY = key
}

// The model checks (src/conversations/__modelchecks__/README.md): real model calls, on demand and before a release.
// Not the unit suite's provider guard, which fails any call to a model; the same storage and environment set-up
// otherwise, and the same stand-in for wasp/server, so nothing here can reach a database.
export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/__modelchecks__/**/*.models.ts'],
    globalSetup: ['./src/test/storage-root.ts'],
    setupFiles: ['./src/test/environment-setup.ts'],
    // Many models' calls, one after another.
    testTimeout: 60 * 60 * 1000,
    fileParallelism: false,
  },
  resolve: {
    alias: {
      'wasp/server': path.resolve(__dirname, '.wasp/out/sdk/wasp/dist/server/HttpError.js'),
    },
  },
})
