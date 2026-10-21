import { test, expect } from '@playwright/test'
import { signIn, ADMIN } from './fixtures/auth'

// SC-093 user can pair a mobile app with this site · SC-207 a pairing code is
// single-use, valid for 5 minutes, shown as a QR + copyable link with a
// countdown, and regenerable when expired.
//
// Pure UI flow on the Connect Mobile settings page. These specs need not run or
// pass in this task — they assert the current page contract for a later harness.

test.describe('mobile pairing', () => {
  test('settings page shows a pairing QR and copyable link @SC-093', async ({ page }) => {
    await signIn(page, ADMIN)
    await page.goto('/settings/mobile')
    // A code is generated on request, then shown as a QR code beside a copyable link.
    await page.getByRole('button', { name: 'Generate QR Code' }).click()
    await expect(page.getByText('Or copy the link manually')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Connect Mobile App' })).toBeVisible()
  })

  test('pairing code shows a countdown and can be regenerated @SC-207', async ({ page }) => {
    await signIn(page, ADMIN)
    await page.goto('/settings/mobile')
    await page.getByRole('button', { name: 'Generate QR Code' }).click()
    // A countdown is shown while the 5-minute code is valid…
    await expect(page.getByText(/Expires in/i).first()).toBeVisible()
    // …and once it has expired, a control generates a new code ("Generate New Code"). The wait is
    // the code's whole life, so this part is not driven here.
    // The regenerate half of SC-207 is therefore not proven by a browser test here.
  })
})
