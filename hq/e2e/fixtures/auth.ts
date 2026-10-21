import { expect, type Page } from '@playwright/test'

/**
 * Shared browser-auth helpers for specs that need a signed-in user.
 *
 * The accounts come from `seed-e2e-users.mjs`; see e2e/README.md for setup.
 * Wasp keeps the session id in localStorage and sends it as a Bearer token —
 * it does not use cookies — so signing a second user in requires clearing the
 * first one's token, and operation calls carry it explicitly.
 */

export const SERVER_URL = process.env.E2E_SERVER_URL ?? 'http://localhost:4101'

export const MEMBER = { username: 'e2e-operator', password: 'E2eOperator!2026' }
export const ADMIN = { username: 'e2e-admin', password: 'E2eAdmin!2026' }

export async function signIn(page: Page, user: { username: string; password: string }): Promise<void> {
  // Clear any prior session first — otherwise signing in a second user in the
  // same context silently keeps the first user's token and every subsequent
  // request goes out as the wrong person.
  await page.goto('/login')
  await page.evaluate(() => localStorage.clear())
  await page.goto('/login')
  await page.getByRole('textbox', { name: 'Username' }).fill(user.username)
  await page.getByLabel('Password', { exact: true }).fill(user.password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('wasp:sessionId')), { timeout: 15_000 })
    .not.toBeNull()
}

export async function sessionToken(page: Page): Promise<string> {
  const raw = await page.evaluate(() => localStorage.getItem('wasp:sessionId'))
  return JSON.parse(raw!)
}

/** Call a Wasp operation directly. Args are superjson-wrapped: the body is `{ json: args }`. */
export function callOperation(page: Page, name: string, token: string, args: unknown) {
  return page.request.post(`${SERVER_URL}/operations/${name}`, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    data: { json: args },
    failOnStatusCode: false,
  })
}
