import { test, expect, type Page } from '@playwright/test'
import { STAND_IN_URL } from './fixtures/standInModel'
import { answerSpeechProviders } from './fixtures/voiceProviders'

// Setup, once per HQ, for its first admin: the one-time link /invite/<code> makes the account (setup's first step)
// and sends the person to /setup, which opens at the first step whose need is unmet: How will your agents reach AI?
// Agenthix Cloud's card is disabled (*not available yet*), so the way through is Your own keys: one model provider,
// then voice (one speech to text, one text to speech), Your organisation with its time zone, and a last look.
// The step is kept in the address, so a refresh and Back both stay on it.
//
// It needs a fresh HQ with no admin yet and that HQ's first-admin link, which the HQ prints in its log
// ("No admin yet. Open this link", or `agenthix hq invite-admin`). The link works once and nothing in the suite
// seeds it, so pass it in:
//
//   E2E_FIRST_ADMIN_LINK=http://localhost:4100/invite/<code> npx playwright test e2e/setup.spec.ts
//
// Without it the suite skips. The tests share one signed-in page and run in order: each starts where the last ended.
//
// No vendor is reached. HQ checks a key with its vendor before it stores it, at an address a test cannot redirect, so:
//  - the model provider is an own OpenAI-compatible endpoint at the stand-in model (fixtures/standInModel.ts), which
//    answers the check's model listing, so HQ's real check runs, against the stand-in;
//  - the speech providers (AssemblyAI, Inworld) have only their vendor's address, so the browser's add-provider call
//    for them is answered by the test (a route intercept) and the provider is put in HQ's database with an obviously
//    fake key (fixtures/add-provider.mjs, which uses DATABASE_URL, else hq/.env.server).

const LINK = process.env.E2E_FIRST_ADMIN_LINK
const CLIENT_URL = process.env.E2E_CLIENT_URL ?? 'http://localhost:4100'

const onStep = (page: Page, step: string) => page.waitForURL((url) => url.pathname === '/setup' && url.searchParams.get('step') === step)

test.describe.configure({ mode: 'serial' })

test.describe('the first admin sets up their HQ and lands on Home @SC-008 @SC-147', () => {
  test.skip(!LINK, 'needs a fresh HQ and its first-admin link: set E2E_FIRST_ADMIN_LINK')

  let page: Page

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage({ baseURL: CLIENT_URL })
    await answerSpeechProviders(page)
  })
  test.afterAll(async () => {
    await page.close()
  })

  test('the first-admin link makes the account and opens setup at how agents reach AI', async () => {
    await page.goto(LINK!)
    await page.getByLabel(/^your name/i).fill('E2E Admin')
    await page.getByLabel(/^username/i).fill(`e2e-first-${Date.now()}`)
    await page.getByLabel(/^password/i).fill('E2eFirstAdmin!2026')
    await page.getByRole('button', { name: /^continue$/i }).click()
    await expect(page.getByRole('heading', { name: 'How will your agents reach AI?' })).toBeVisible()
  })

  test('Agenthix Cloud cannot be chosen yet, and Your own keys is the way through', async () => {
    const cloud = page.getByRole('region', { name: 'Agenthix Cloud' })
    await expect(cloud.getByText(/not available yet/i).first()).toBeVisible()
    await expect(cloud.getByRole('button', { name: 'Connect' })).toBeDisabled()

    await page.getByRole('region', { name: 'Your own keys' }).getByRole('button', { name: 'Choose' }).click()
    await onStep(page, 'model')
    await expect(page.getByRole('heading', { name: 'Your model provider' })).toBeVisible()
  })

  test('a model provider is added with its key, checked, and a refresh stays on the step', async () => {
    // Nothing to continue with until one works.
    await expect(page.getByRole('button', { name: /^continue$/i })).toHaveCount(0)
    await page.getByRole('button', { name: /Your own OpenAI-compatible endpoint/ }).click()
    await page.getByLabel(/^address/i).fill(STAND_IN_URL)
    await page.getByLabel(/^api key/i).fill('sk-test-fake')
    await page.getByRole('button', { name: /^save$/i }).click()
    await expect(page.getByText(/works\. Added by you\./)).toBeVisible()

    await page.reload()
    await expect(page.getByRole('heading', { name: 'Your model provider' })).toBeVisible()
    await expect(page.getByText(/works\. Added by you\./)).toBeVisible()
    await page.getByRole('button', { name: /^continue$/i }).click()
    await onStep(page, 'voice')
  })

  test('voice needs one speech to text and one text to speech provider', async () => {
    await expect(page.getByRole('heading', { name: 'Voice' })).toBeVisible()
    await expect(page.getByRole('button', { name: /^continue$/i })).toHaveCount(0)

    await page.getByRole('button', { name: /^AssemblyAI/ }).click()
    await page.getByLabel(/^api key/i).fill('sk-test-fake')
    await page.getByRole('button', { name: /^save$/i }).click()
    await expect(page.getByText('AssemblyAI').first()).toBeVisible()
    // One of the two is not enough.
    await expect(page.getByRole('button', { name: /^continue$/i })).toHaveCount(0)

    await page.getByRole('button', { name: /^Inworld/ }).click()
    await page.getByLabel(/^api key/i).fill('sk-test-fake')
    await page.getByRole('button', { name: /^save$/i }).click()
    await expect(page.getByRole('button', { name: /^continue$/i })).toBeVisible()
  })

  test('Back returns to the model provider, still added', async () => {
    await page.getByRole('button', { name: /^back$/i }).click()
    await onStep(page, 'model')
    await expect(page.getByText(/works\. Added by you\./)).toBeVisible()
    await page.getByRole('button', { name: /^continue$/i }).click()
    await onStep(page, 'voice')
    await page.getByRole('button', { name: /^continue$/i }).click()
    await onStep(page, 'organisation')
  })

  test('your organisation: a name and a time zone', async () => {
    await expect(page.getByRole('heading', { name: 'Your organisation' })).toBeVisible()
    await page.getByLabel(/^name/i).fill('Acme Corp')
    await page.getByLabel('Time zone').selectOption('Europe/London')
    await page.getByRole('button', { name: /^continue$/i }).click()
    await onStep(page, 'review')
  })

  test('the last look says where models and voice come from, the organisation and its time zone', async () => {
    await expect(page.getByRole('heading', { name: 'Check everything before you start' })).toBeVisible()
    await expect(page.getByText(/^Your own keys: (?=.*AssemblyAI)(?=.*Inworld)/)).toBeVisible()
    await expect(page.getByText('Acme Corp').first()).toBeVisible()
    await expect(page.getByText('Europe/London').first()).toBeVisible()
    await expect(page.getByText('Kernel, with a voice')).toBeVisible()
  })

  test('Edit on the review returns to the review afterwards', async () => {
    await page.getByRole('button', { name: /^edit your organisation$/i }).click()
    await expect(page.getByRole('heading', { name: 'Your organisation' })).toBeVisible()
    await page.getByLabel(/^name/i).fill('Acme Corporation')
    await page.getByRole('button', { name: /^continue$/i }).click()
    await onStep(page, 'review')
    await expect(page.getByText('Acme Corporation').first()).toBeVisible()
  })

  test('Finish records setup and lands on Home, and setup is not offered again', async () => {
    await page.getByRole('button', { name: /^finish$/i }).click()
    await page.waitForURL((url) => url.pathname === '/')
    await page.goto('/setup')
    await page.waitForURL((url) => url.pathname === '/')
  })
})
