import { test, expect, type Page } from '@playwright/test'
import { CLIENT_URL } from './fixtures/urls'
import { STAND_IN_URL } from './fixtures/standInModel'
import { answerSpeechProviders } from './fixtures/voiceProviders'

// Setup, once per HQ, for its first admin: the one-time link /invite/<code> makes the account (setup's first step)
// and sends the person to /setup, which opens at the first step whose need is unmet: Your organisation, with its time
// zone. Then one AI step: the list of providers, an Add a provider pop-up that lists every provider (Agenthix Cloud
// among them, disabled as *not available yet*), and what agents can do. This walk adds a model provider and Inworld (one
// key covers hearing and speaking), then a last look. The step can be skipped (ADR-0160). The step is kept in the
// address, so a refresh and Back both stay on it.
//
// It needs a fresh HQ with no admin yet and that HQ's first-admin link, which the HQ prints in its log
// ("No admin yet. Open this link", or `agenthix hq invite-admin`). The link works once and nothing in the suite
// seeds it, so pass it in:
//
//   E2E_FIRST_ADMIN_LINK=<hq's address>/invite/<code> npx playwright test e2e/setup.spec.ts
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

const onStep = (page: Page, step: string) => page.waitForURL((url) => url.pathname === '/setup' && url.searchParams.get('step') === step)

test.describe.configure({ mode: 'serial' })

test.describe('the first admin sets up their HQ and lands on Home @SC-008 @SC-147 @SC-1184 @SC-1185', () => {
  test.skip(!LINK, 'needs a fresh HQ and its first-admin link: set E2E_FIRST_ADMIN_LINK')

  let page: Page

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage({ baseURL: CLIENT_URL })
    await answerSpeechProviders(page)
  })
  test.afterAll(async () => {
    await page.close()
  })

  test('the first-admin link makes the account and opens setup at the organisation', async () => {
    await page.goto(LINK!)
    await page.getByLabel(/^your name/i).fill('E2E Admin')
    await page.getByLabel(/^username/i).fill(`e2e-first-${Date.now()}`)
    await page.getByLabel(/^password/i).fill('E2eFirstAdmin!2026')
    await page.getByRole('button', { name: /^continue$/i }).click()
    // Setup opens at the organisation, from where it resumes: the address has no step yet.
    await expect(page.getByRole('heading', { name: 'Your organisation', exact: true })).toBeVisible()
  })

  test('your organisation: a name and a time zone, then the AI step, which can be skipped', async () => {
    await page.getByLabel(/^name/i).fill('Acme Corp')
    await page.getByLabel('Time zone').selectOption('Europe/London')
    await page.getByRole('button', { name: /^continue$/i }).click()
    await onStep(page, 'ai')
    await expect(page.getByRole('heading', { name: 'Connect AI' })).toBeVisible()
    await expect(page.getByText(/^Step 3 of 4/)).toBeVisible()
    // Nothing added: the list says so, and skipping is there, never Continue.
    await expect(page.getByText('None yet')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Skip for now' })).toBeVisible()
    await expect(page.getByRole('button', { name: /^continue$/i })).toHaveCount(0)
  })

  test('the Add a provider pop-up lists every provider, and Agenthix Cloud cannot be chosen yet', async () => {
    await page.getByRole('button', { name: /Add a provider/ }).click()
    const list = page.getByRole('list', { name: 'Providers to add' })
    for (const name of ['Anthropic', 'OpenAI', 'Google Gemini', 'OpenRouter', 'Inworld', 'AssemblyAI']) {
      await expect(list.getByText(name, { exact: true })).toBeVisible()
    }
    await expect(list.getByRole('button', { name: /^Agenthix Cloud/ })).toBeDisabled()
    await expect(list.getByText('Not available yet').first()).toBeVisible()
  })

  test('a provider is added with its key, with the vendor’s key guide above the form, and a refresh stays on the step', async () => {
    await page.getByRole('button', { name: /^Your own OpenAI-compatible endpoint/ }).click()
    // A person's own endpoint has no key guide; every other vendor's form opens with one.
    await expect(page.getByRole('region', { name: 'Where to get the key' })).toHaveCount(0)
    await page.getByLabel(/^address/i).fill(STAND_IN_URL)
    await page.getByLabel(/^api key/i).fill('sk-test-fake')
    await page.getByRole('button', { name: /^save$/i }).click()
    // The key was checked with the stand-in model, the pop-up closed, and the provider is listed.
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(page.getByText(/Works\. Added by you\./)).toBeVisible()
    await expect(page.getByRole('button', { name: /^continue$/i })).toBeVisible()

    await page.reload()
    await expect(page.getByRole('heading', { name: 'Connect AI' })).toBeVisible()
    await expect(page.getByText(/Works\. Added by you\./)).toBeVisible()
  })

  test('Inworld adds hearing and speaking on one key, and a type nothing covers is not a fault', async () => {
    await expect(page.getByText('Add a provider that speaks.')).toBeVisible()
    await page.getByRole('button', { name: /Add a provider/ }).click()
    await page.getByRole('button', { name: /^Inworld/ }).click()
    await expect(page.getByRole('heading', { name: 'Where do I get an Inworld key?' })).toBeVisible()
    await expect(page.getByRole('link', { name: /Open Inworld.s key page/ })).toHaveAttribute('target', '_blank')
    await page.getByLabel(/^api key/i).fill('sk-test-fake')
    await page.getByRole('dialog').getByRole('button', { name: /^save$/i }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(page.getByRole('region', { name: 'Your providers' }).getByText('Speaking')).toBeVisible()
    await expect(page.getByText('Add a provider that speaks.')).toHaveCount(0)
  })

  test('Continue goes to the last look, and Back returns to the AI step with both providers still there', async () => {
    await page.getByRole('button', { name: /^continue$/i }).click()
    await onStep(page, 'review')
    await page.getByRole('button', { name: /^back$/i }).click()
    await onStep(page, 'ai')
    await expect(page.getByRole('heading', { name: 'Connect AI' })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Your providers' }).getByText('Inworld', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: /^continue$/i }).click()
    await onStep(page, 'review')
  })

  test('the last look has one AI row saying what works, the organisation and its time zone', async () => {
    await expect(page.getByRole('heading', { name: 'Check everything before you start' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'AI', exact: true })).toBeVisible()
    await expect(page.getByText('Inworld', { exact: true })).toBeVisible()
    await expect(page.getByText('Defaults for everyone')).toHaveCount(0)
    for (const name of ['Thinking', 'Hearing', 'Speaking', 'Web search']) await expect(page.getByText(name, { exact: true }).first()).toBeVisible()
    await expect(page.getByText('Acme Corp').first()).toBeVisible()
    await expect(page.getByText('Europe/London').first()).toBeVisible()
    // Setup chooses a voice by default, so the first agent is shown speaking as it.
    await expect(page.getByText(/^Kernel, speaking as \S/)).toBeVisible()
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
