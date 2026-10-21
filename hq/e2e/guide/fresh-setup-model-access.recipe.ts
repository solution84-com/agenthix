import { expect, test } from '@playwright/test'
import { capture } from './capture'
import { createFirstAdmin } from './fresh'

// screenshot:setup-model-access — setup's Model access step, with the Add model access menu open (in a window tall
// enough for the whole menu). Afterwards it saves a placeholder OpenRouter key, which hq stores without asking the
// provider, so the next recipe's review reads model access as set.
test('setup-model-access', async ({ page }) => {
  await createFirstAdmin(page)
  await page.getByLabel('Name', { exact: true }).fill('Fernhill & Co')
  await page.getByRole('button', { name: 'Continue' }).click()
  await expect(page.getByRole('heading', { name: 'Model access' })).toBeVisible()
  await capture(page, {
    as: null,
    path: '/setup?step=model',
    height: 1100,
    before: (p) => p.getByRole('button', { name: /Add model access/ }).click(),
    ready: (p) => expect(p.getByText('Claude subscription', { exact: false }).first()).toBeVisible(),
  })
  await page.getByRole('menuitem', { name: /OpenRouter/ }).click()
  await page.getByLabel('OpenRouter API key').fill('sk-or-guide-sample-not-a-key')
  await page.getByRole('button', { name: 'Save key' }).click()
  await expect(page.getByText(/OpenRouter/).first()).toBeVisible()
})
