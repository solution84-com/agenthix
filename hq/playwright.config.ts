import { readFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { defineConfig, devices } from '@playwright/test'
import { freePort } from './e2e/fixtures/freePort'
import { CLIENT_URL } from './e2e/fixtures/urls'

// The e2e suite runs against an already-running hq (see e2e/README.md): E2E_CLIENT_URL and E2E_SERVER_URL name it,
// and without them it is the dev hq. The one server this file starts is the stand-in model, on a free port chosen
// when the file loads. Workers load this file again, so the port is put in the environment once and they read it.
process.env.E2E_STAND_IN_PORT ??= String(await freePort())
const STAND_IN_PORT = Number(process.env.E2E_STAND_IN_PORT)

// The same app at a made-up name that Chromium resolves to this machine. A browser gives some features
// (crypto.randomUUID, the clipboard, the microphone) only to a secure page, https or localhost, and HQ is also
// opened over plain http at a network address: there the page is not secure, as it is not here.
const NOT_SECURE_HOST = 'hq-e2e.local'
const notSecure = new URL(CLIENT_URL)
notSecure.hostname = NOT_SECURE_HOST
// The specs that send a message, start a conversation and copy text, run there too.
const NOT_SECURE_SPECS = /(notSecure|chatStreaming|mobilePairing)\.spec\.ts$/

// Every guide screenshot is made the same way (e2e/guide/README.md): the window, density, language and
// timezone of the sample organisation, hq's default (light) theme and reduced motion. The fixed date is set
// by the capture helper, since a browser context cannot take it as an option.
const { clock } = JSON.parse(readFileSync(new URL('./e2e/guide/sample.json', import.meta.url), 'utf8'))
const guideUse = {
  ...devices['Desktop Chrome'],
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2,
  locale: clock.locale,
  timezoneId: clock.timezone,
  colorScheme: 'light' as const,
  reducedMotion: 'reduce' as const,
}

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  // A failing test of an experimental feature's own group is recorded and reported, not failed (adr-0172).
  globalSetup: './e2e/fixtures/experimentalFailures.global.ts',
  use: {
    baseURL: CLIENT_URL,
    trace: 'on-first-retry',
  },
  // The stand-in model the e2e specs talk on (e2e/fixtures/standInModel.ts), so none calls a real one.
  webServer: {
    command: `node ../scripts/install-test/stand-in-model.mjs ${STAND_IN_PORT} ${path.join(os.tmpdir(), 'hq-e2e-stand-in.log')}`,
    port: STAND_IN_PORT,
    reuseExistingServer: false,
  },
  projects: [
    // Checks the seeded accounts before anything signs in, so an unseeded database stops the run instead of tripping the sign-in limit.
    { name: 'seeded-accounts', testMatch: /fixtures[\\/]seededAccounts\.setup\.ts$/ },
    { name: 'stand-in', testMatch: /fixtures[\\/]standIn\.setup\.ts$/, teardown: 'stand-in-teardown', dependencies: ['seeded-accounts'] },
    { name: 'stand-in-teardown', testMatch: /fixtures[\\/]standIn\.teardown\.ts$/ },
    { name: 'chromium', testIgnore: ['**/guide/**', '**/install/**', '**/notSecure.spec.ts'], use: { ...devices['Desktop Chrome'] }, dependencies: ['stand-in'] },
    {
      name: 'not-secure',
      testMatch: NOT_SECURE_SPECS,
      dependencies: ['stand-in'],
      use: {
        ...devices['Desktop Chrome'],
        baseURL: notSecure.origin,
        launchOptions: { args: [`--host-resolver-rules=MAP ${NOT_SECURE_HOST} 127.0.0.1`] },
      },
    },
    // HQ as installed, at the machine's network address over plain http: scripts/install-test/run.sh starts it
    // and runs this project against it. Without that install it skips.
    { name: 'install', testMatch: /install[\\/][^\\/]+\.spec\.ts$/, use: { ...devices['Desktop Chrome'] }, retries: 0, timeout: 10 * 60_000, expect: { timeout: 30_000 } },
    // The user guide's recipes: one screenshot each, against the sample organisation (seed-guide-data.mjs).
    // `fresh-` recipes need hq with no organisation yet, so they are their own project and run first.
    // A cold dev server in CI is slow to answer its first requests, so recipes wait longer than the e2e specs.
    { name: 'guide', testMatch: /guide[\\/](?!fresh-)[^\\/]+\.recipe\.ts$/, use: guideUse, expect: { timeout: 20_000 }, timeout: 60_000 },
    // Each fresh recipe builds on the one before (a retry would find the administrator already made), so none retries.
    { name: 'guide-fresh', testMatch: /guide[\\/]fresh-[^\\/]+\.recipe\.ts$/, use: guideUse, expect: { timeout: 20_000 }, timeout: 60_000, retries: 0 },
  ],
})
