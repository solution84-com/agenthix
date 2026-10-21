import { test, expect, request } from '@playwright/test'

// Server (Express) port — separate from the client. API rungs hit it directly.
const SERVER_URL = process.env.E2E_SERVER_URL ?? 'http://localhost:4101'

// The canary proves the e2e harness end-to-end without mutating state: two
// public API rungs and one browser rung exercising the React app + router +
// auth guard. Account creation (which seeds the DB and needs the bootstrap
// secret) is a later, test-data-managed flow — not the canary.
test.describe('canary', () => {
  test('health endpoint returns 200 with its status and nothing else @SC-110 @SC-723', async () => {
    const ctx = await request.newContext()
    const res = await ctx.get(`${SERVER_URL}/health`)
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ status: 'ok' })
    await ctx.dispose()
  })

  test('bootstrap-status reports a boolean @SC-112', async () => {
    const ctx = await request.newContext()
    const res = await ctx.get(`${SERVER_URL}/api/auth/bootstrap-status`)
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(typeof body.bootstrapRequired).toBe('boolean')
    await ctx.dispose()
  })

  test('unauthenticated dashboard visit redirects to an auth page and renders @SC-001', async ({ page }) => {
    await page.goto('/')
    // Wasp's auth guard sends an unauthenticated user to /login. There the sign-in form shows, or, while
    // first-admin bootstrap is required, a page saying this HQ has no admin yet. Either is a pass.
    await page.waitForURL(/\/login/)
    expect(page.url()).toMatch(/\/login/)
    await expect(page.locator('input').first().or(page.getByRole('heading', { name: 'Set up Agenthix' }))).toBeVisible()
  })
})
