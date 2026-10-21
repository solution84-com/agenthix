import { test, expect, type Page } from '@playwright/test'

// Setup, once per HQ, for its first admin: the one-time link /invite/<code> makes the account (setup's first
// step) and sends the person to /setup?step=organisation, then Your organisation, Model access and a Review.
// The step is kept in the address, so a refresh and Back both stay on it. Setup needs no Execution Site, agent
// or model credential, so a model is skipped, not added.
//
// It needs a fresh HQ with no admin yet and that HQ's first-admin link, which the HQ prints in its log
// ("No admin yet. Open this link", or `agenthix hq invite-admin`). The link works once and nothing in the suite
// seeds it, so pass it in:
//
//   E2E_FIRST_ADMIN_LINK=http://localhost:4100/invite/<code> npx playwright test e2e/setup.spec.ts
//
// Without it the suite skips. The tests share one signed-in page and run in order: each starts where the last ended.

const LINK = process.env.E2E_FIRST_ADMIN_LINK
const CLIENT_URL = process.env.E2E_CLIENT_URL ?? 'http://localhost:4100'

const onStep = (page: Page, step: string) => page.waitForURL((url) => url.pathname === '/setup' && url.searchParams.get('step') === step)

test.describe.configure({ mode: 'serial' })

test.describe('the first admin sets up their HQ and lands on Home @SC-008 @SC-147', () => {
  test.skip(!LINK, 'needs a fresh HQ and its first-admin link: set E2E_FIRST_ADMIN_LINK')

  let page: Page

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage({ baseURL: CLIENT_URL })
  })
  test.afterAll(async () => {
    await page.close()
  })

  test('the first-admin link makes the account and opens setup at the organisation step', async () => {
    await page.goto(LINK!)
    await page.getByLabel(/^your name/i).fill('E2E Admin')
    await page.getByLabel(/^username/i).fill(`e2e-first-${Date.now()}`)
    await page.getByLabel(/^password/i).fill('E2eFirstAdmin!2026')
    await page.getByRole('button', { name: /^continue$/i }).click()
    await onStep(page, 'organisation')
    await expect(page.getByRole('heading', { name: 'Your organisation' })).toBeVisible()
  })

  test('the organisation step advances to model access, and Back returns with the step kept in the address', async () => {
    await page.getByLabel(/^name/i).fill('Acme Corp')
    await page.getByRole('button', { name: /^continue$/i }).click()
    await onStep(page, 'model')
    await expect(page.getByRole('heading', { name: 'Model access' })).toBeVisible()

    await page.getByRole('button', { name: /^back$/i }).click()
    await onStep(page, 'organisation')
    await expect(page.getByLabel(/^name/i)).toHaveValue('Acme Corp')

    await page.getByRole('button', { name: /^continue$/i }).click()
    await onStep(page, 'model')
    // A refresh stays on the step.
    await page.reload()
    await expect(page.getByRole('heading', { name: 'Model access' })).toBeVisible()
  })

  test('model access can be skipped, and the review summarises each step', async () => {
    await page.getByRole('button', { name: /^skip for now$/i }).click()
    await onStep(page, 'review')
    await expect(page.getByRole('heading', { name: 'Check everything before you start' })).toBeVisible()
    await expect(page.getByText('Acme Corp').first()).toBeVisible()
    await expect(page.getByText('Not set')).toBeVisible()
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
