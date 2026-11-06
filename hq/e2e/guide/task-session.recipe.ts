import { expect, test } from '@playwright/test'
import { capture } from './capture'

// screenshot:task-session — WEB-2, whose run waits for Sam's approval.
test('task-session', async ({ page }) => {
  await capture(page, {
    path: '/tasks/WEB-2',
    ready: (p) => expect(p.getByTestId('request-card')).toBeVisible(),
  })
})
