import { test, expect } from '@playwright/test'
import { signIn, MEMBER } from './fixtures/auth'

// The dock's width is dragged on its inner edge and remembered in this browser. Needs the seeded conversation
// (fixtures/seed-e2e-data.mjs).
test.use({ viewport: { width: 1440, height: 800 } })

test('a dragged dock keeps its width across a reload, and a double click resets it @SC-1034', async ({ page }) => {
  const id = process.env.E2E_CONVERSATION_ID
  test.skip(!id, 'needs the seeded conversation (fixtures/seed-e2e-data.mjs)')
  await signIn(page, MEMBER)
  await page.goto(`/space?c=${id}`)
  const dock = page.getByRole('complementary', { name: 'Conversation' })
  const handle = page.getByRole('separator', { name: 'Resize the conversation' })
  await expect(handle).toBeVisible()
  expect((await dock.boundingBox())?.width).toBeCloseTo(400, 0)

  const edge = await handle.boundingBox()
  const x = edge!.x + edge!.width / 2
  const y = edge!.y + edge!.height / 2
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x - 150, y, { steps: 5 })
  await page.mouse.up()
  expect((await dock.boundingBox())?.width).toBeCloseTo(550, -1)

  await page.reload()
  await expect(dock).toBeVisible()
  expect((await dock.boundingBox())?.width).toBeCloseTo(550, -1)

  await handle.dblclick()
  expect((await dock.boundingBox())?.width).toBeCloseTo(400, 0)
})
