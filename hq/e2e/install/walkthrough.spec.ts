import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test, expect, type Page } from '@playwright/test'
import { answerSpeechProviders } from '../fixtures/voiceProviders'

// HQ as installed: every image built here, `agenthix install` at the machine's network address over plain http, and
// this walkthrough in a real browser. scripts/install-test/run.sh does the rest and runs this as the `install`
// project; without what it passes, the walkthrough skips. The steps run in order on one page, each starting where
// the last ended: the first admin and setup with the stand-in as the model provider (so no real model is called), a conversation opened
// and a message sent in it, then the Fleet Console.

const HQ = process.env.INSTALL_TEST_HQ
const LINK = process.env.INSTALL_TEST_LINK
const MODEL = process.env.INSTALL_TEST_MODEL
const CONSOLE = process.env.INSTALL_TEST_CONSOLE
// The install's hq-server container. Setup checks a speech key with its vendor at an address no test can redirect,
// so the browser's call for it is answered here, and the provider put in the install's database from inside that
// container (scripts/install-test/speech-provider.cjs), where its database address and secrets key already are.
const HQ_SERVER = process.env.INSTALL_TEST_HQ_SERVER
const SPEECH_PROVIDER = resolve(dirname(fileURLToPath(import.meta.url)), '../../../scripts/install-test/speech-provider.cjs')
// What the stand-in answers every chat with (scripts/install-test/stand-in-model.mjs).
const REPLY = 'The stand-in model answers.'
const ADMIN = { name: 'Install Test', username: 'install-test-admin', password: 'InstallTest!2026' }

const onStep = (page: Page, step: string) => page.waitForURL((url) => url.pathname === '/setup' && url.searchParams.get('step') === step)

test.describe.configure({ mode: 'serial' })

test.describe('HQ installed at a network address over plain http @SC-1149', () => {
  test.skip(!HQ || !LINK || !MODEL || !CONSOLE || !HQ_SERVER, 'run by scripts/install-test/run.sh, which installs HQ first')

  let page: Page
  const errors: string[] = []

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage({ baseURL: HQ })
    page.on('pageerror', (e) => errors.push(e.message))
    await answerSpeechProviders(page, (vendor) => {
      execFileSync('docker', ['exec', '-i', HQ_SERVER!, 'node', '-', vendor], {
        input: readFileSync(SPEECH_PROVIDER), stdio: ['pipe', 'inherit', 'inherit'],
      })
    })
  })
  test.afterAll(async () => {
    await page.close()
  })

  test('the first admin is made from the install’s link, with the stand-in as the model provider', async () => {
    await page.goto(LINK!)
    // The page HQ serves here is not a secure context: what a browser keeps for one is missing.
    expect(await page.evaluate(() => window.isSecureContext)).toBe(false)
    await page.getByLabel(/^your name/i).fill(ADMIN.name)
    await page.getByLabel(/^username/i).fill(ADMIN.username)
    await page.getByLabel(/^password/i).fill(ADMIN.password)
    await page.getByRole('button', { name: /^continue$/i }).click()

    // Setup opens at the organisation, from where it resumes: the address has no step yet.
    await expect(page.getByRole('heading', { name: 'Your organisation', exact: true })).toBeVisible()
    await page.getByLabel(/^name/i).fill('Install Test')
    await page.getByRole('button', { name: /^continue$/i }).click()

    // One AI step: each provider is added from the Add a provider pop-up, which closes once the key is checked.
    await expect(page.getByRole('heading', { name: 'Connect AI' })).toBeVisible()
    await page.getByRole('button', { name: /Add a provider/ }).click()
    await page.getByRole('button', { name: /^Your own OpenAI-compatible endpoint/ }).click()
    await page.getByLabel(/^address/i).fill(MODEL!)
    await page.getByLabel(/^api key/i).fill('sk-test-fake')
    await page.getByRole('button', { name: /^save$/i }).click()
    await expect(page.getByText(/Works\. Added by you\./)).toBeVisible()

    // The speech vendors cannot be reached from a test: the call is answered here, and the provider put in the install's database.
    for (const vendor of [/^AssemblyAI/, /^Inworld/]) {
      await page.getByRole('button', { name: /Add a provider/ }).click()
      await page.getByRole('button', { name: vendor }).click()
      await page.getByLabel(/^api key/i).fill('sk-test-fake')
      await page.getByRole('dialog').getByRole('button', { name: /^save$/i }).click()
      await expect(page.getByRole('dialog')).toHaveCount(0)
    }
    await expect(page.getByRole('region', { name: 'Your providers' }).getByText('Inworld', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: /^continue$/i }).click()
    await onStep(page, 'review')
    await page.getByRole('button', { name: /^finish$/i }).click()
    await page.waitForURL((url) => url.pathname === '/')
  })

  test('the organisation talks on the stand-in', async () => {
    // Nothing chooses the default models in setup, and the stand-in names one model; an admin chooses it in
    // Manage › Models, here through the same operation that page calls.
    const raw = await page.evaluate(() => localStorage.getItem('wasp:sessionId'))
    const headers = { Authorization: `Bearer ${JSON.parse(raw!)}`, 'Content-Type': 'application/json' }
    const listed = await page.request.post(`${HQ}/operations/get-ai-providers`, { headers, data: { json: null }, failOnStatusCode: false })
    expect(listed.status(), await listed.text()).toBe(200)
    const providers = (await listed.json()).json as { id: string; vendor: string }[]
    const standIn = providers.find((p) => p.vendor === 'openai_compatible')
    expect(standIn, 'the stand-in model provider added in setup').toBeTruthy()
    const choice = `${standIn!.id}/stand-in`
    const res = await page.request.post(`${HQ}/operations/set-model-defaults`, {
      headers, data: { json: { conversation: choice } }, failOnStatusCode: false,
    })
    expect(res.status(), await res.text()).toBe(200)
  })

  test('a conversation is started in the chat panel’s box, a message sent in it, and the stand-in answers', async () => {
    await page.goto('/')
    // Voice is never started here: its button is greyed with a reason (the agent's voice is off on a fresh HQ, which
    // it names before the page not being secure).
    const voice = page.getByRole('button', { name: 'Start voice' }).first()
    await expect(voice).toHaveAttribute('aria-disabled', 'true')
    await expect(voice).toHaveAccessibleDescription(/.+/)
    // Home has no box of its own beside the chat: the panel's new-conversation box is the first one.
    const start = page.getByRole('textbox', { name: 'Ask any agent…' }).first()
    await start.fill('Hello from the install test.')
    await start.press('Enter')
    // The conversation opens beside Home (?c=<id>), or on its own page.
    await expect(page).toHaveURL(/[?&]c=[^&]+|\/chat\/t\/[^/?]+/)
    await expect(page.getByText('Hello from the install test.').first()).toBeVisible()
    await expect(page.getByText(REPLY).first()).toBeVisible({ timeout: 120_000 })
    expect(errors).toEqual([])
  })

  test('the Fleet Console opens on this machine and lets the first admin in', async ({ browser }) => {
    const fleet = await browser.newPage()
    await fleet.goto(CONSOLE!)
    await expect(fleet.getByRole('heading', { name: 'Sign in' })).toBeVisible()
    await fleet.getByLabel('Username').fill(ADMIN.username)
    await fleet.getByLabel('Password').fill(ADMIN.password)
    await fleet.getByRole('button', { name: 'Sign in', exact: true }).click()
    // The first account is a fleet admin too, so the sign-in gives way to the console itself.
    await expect(fleet.getByRole('heading', { name: 'Sign in' })).toBeHidden()
    await fleet.close()
  })
})
