/**
 * The thread harness's own Playwright run: it serves the harness page with Vite on a free port and measures the real
 * thread in each browser installed. No hq, site or database. From `hq/`:
 * `npx playwright test -c e2e/harness/playwright.config.ts` (add `--project chromium` for one browser).
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, devices } from '@playwright/test'
import { freePort } from '../fixtures/freePort'

const hq = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
// Workers load this file again: the port is chosen once and handed on in the environment.
process.env.HARNESS_PORT ??= String(await freePort())
const PORT = Number(process.env.HARNESS_PORT)

export default defineConfig({
  testDir: '.',
  testMatch: /\.harness\.ts$/,
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  timeout: 120_000,
  use: { baseURL: `http://127.0.0.1:${PORT}` },
  webServer: {
    command: `npx vite --config e2e/harness/vite.config.ts --port ${PORT} --strictPort`,
    cwd: hq,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: false,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
})
