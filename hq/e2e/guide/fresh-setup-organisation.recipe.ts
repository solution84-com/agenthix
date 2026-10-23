import { expect, test } from '@playwright/test'
import { capture } from './capture'

// screenshot:setup-organisation — setup's Your organisation step, with its name and time zone filled in. Afterwards
// it saves them, so the last look names the organisation.
test('setup-organisation', async ({ page }) => {
  await capture(page, {
    path: '/setup?step=organisation&path=keys',
    before: async (p) => {
      await p.getByLabel('Name', { exact: true }).fill('Fernhill & Co')
      await p.getByLabel('Time zone').selectOption('Europe/London')
    },
    ready: (p) => expect(p.getByRole('heading', { name: 'Your organisation' })).toBeVisible(),
  })
  await page.getByRole('button', { name: 'Continue' }).click()
  await expect(page.getByRole('heading', { name: 'Check everything before you start' })).toBeVisible()
})
