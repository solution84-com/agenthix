import { execFileSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Page } from '@playwright/test'

const SPEECH_VENDORS = ['assemblyai', 'inworld']
const here = dirname(fileURLToPath(import.meta.url))

/**
 * Makes the Add provider form's speech vendors work without a real vendor. HQ checks a key with its vendor before it
 * stores it, at an address a test cannot redirect, so the browser's add-provider call for AssemblyAI or Inworld is
 * answered here, and `add` puts the provider in the database as HQ would have stored it (add-provider.mjs).
 * Every other vendor's call goes through to HQ: a model provider is checked against the stand-in model.
 */
export async function answerSpeechProviders(page: Page, add: (vendor: string) => void = (vendor) => addProvider(vendor)): Promise<void> {
  await page.route('**/operations/add-ai-provider', async (route) => {
    const sent = route.request().postDataJSON() as { json?: { vendor?: string } } | null
    const vendor = sent?.json?.vendor
    if (!vendor || !SPEECH_VENDORS.includes(vendor)) return route.continue()
    add(vendor)
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ json: { provider: { vendor } } }) })
  })
}

/** Adds the provider to the HQ under test's own database (`DATABASE_URL`, else hq/.env.server; the key is encrypted with `SECRETS_MASTER_KEY`, else the same file's). */
export function addProvider(vendor: string, env: NodeJS.ProcessEnv = process.env): void {
  execFileSync('node', [resolve(here, 'add-provider.mjs'), vendor], { env, stdio: 'inherit' })
}
