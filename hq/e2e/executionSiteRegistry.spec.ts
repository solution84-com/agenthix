import { test, expect, type Page } from '@playwright/test'
import { signIn, sessionToken, callOperation, MEMBER, ADMIN, SERVER_URL } from './fixtures/auth'

/**
 * Execution Site registry — the list, the removed registration routes, and project placement (spec §3; AC-155a–f).
 * A site joins only when a fleet admin adds it in the Fleet Console, so this suite reads the list and the default site
 * and checks that nothing else admits a site.
 */

/** A project key is 2-6 uppercase letters and unique. */
function projectKey(): string {
  return Array.from({ length: 6 }, () => String.fromCharCode(65 + Math.floor(Math.random() * 26))).join('')
}

function uniqueSiteId(suffix: string): string {
  return `e2e-site-${Date.now()}-${suffix}-${Math.random().toString(36).slice(2, 8)}`
}

/** A site's row in the Execution Sites list: one link holding its name, state and what it holds. */
function siteRow(page: Page, label: string) {
  return page.getByTestId('site-row').filter({ hasText: label })
}

test.describe('the registry lists HQ\'s own site', () => {
  test('HQ\'s own site reads "<machine> · HQ\'s site" in the list', async ({ page }) => {
    await signIn(page, ADMIN)
    await page.goto('/org/settings/where-work-runs')
    await expect(page.getByRole('heading', { name: /^Where work runs$/ })).toBeVisible()
    test.skip((await page.getByTestId('site-row').count()) === 0, 'needs HQ\'s built-in site (paired at boot)')
    // Named after the machine HQ runs on, as everywhere since host management: "hq-box · HQ's site".
    await expect(siteRow(page, " · HQ's site").first()).toBeVisible()
  })
})

test.describe('no route admits a site by a registration token or a device code', () => {
  test('the registration-token route is gone (adr-0115)', async ({ request }) => {
    const res = await request.post(`${SERVER_URL}/api/v1/sites/register`, {
      data: { registrationToken: `srt_${'0'.repeat(8)}_${'f'.repeat(48)}`, siteId: uniqueSiteId('bogus') },
    })
    expect(res.status(), 'nothing answers on the removed route').toBe(404)
  })

  test('the device-code routes are gone', async ({ request }) => {
    for (const path of ['device-code', 'device-token']) {
      const res = await request.post(`${SERVER_URL}/api/v1/sites/${path}`, { data: { siteId: uniqueSiteId('bogus') } })
      expect(res.status(), `nothing answers on /sites/${path}`).toBe(404)
    }
  })
})

test.describe('a project with no Execution Site named is placed on the default site @SC-287', () => {
  // Creating a project is an admin action, and the admin check runs before the
  // placement check — so the placement rule is only reachable as an admin, and
  // a Member is refused earlier, with 403.
  test('a Member is refused creating a project at all', async ({ page }) => {
    await signIn(page, MEMBER)
    const res = await callOperation(page, 'create-project', await sessionToken(page), {
      name: `E2E project ${Date.now()}`,
    })
    expect(res.status(), 'creating a project is an admin-only action').toBe(403)
  })

  // Needs hq's default Execution Site to exist (it is created at boot, paired
  // with its own site); with none the operation says so instead.
  test('an ADMIN creating a project without a siteId puts it on hq\'s default site', async ({ page }) => {
    await signIn(page, ADMIN)
    const token = await sessionToken(page)
    const res = await callOperation(page, 'create-project', token, { name: `E2E project ${Date.now()}`, key: projectKey() })
    expect(res.status(), await res.text()).toBe(200)
    const { json: created } = await res.json()

    const shown = await callOperation(page, 'get-project', token, { projectId: created.id })
    expect(shown.status()).toBe(200)
    const { json: project } = await shown.json()
    // The query hands the site over by its shown name; hq's own site is the one named "<machine> · HQ's site".
    expect(project.executionSite.label).toMatch(/ · HQ's site$/)
  })
})
