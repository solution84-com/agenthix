import { test, expect, type Page } from '@playwright/test'
import { signIn, MEMBER } from './fixtures/auth'

/**
 * The `/` picker in a conversation's message box (skills spec part 5, *Picking a skill*): `/` at the start opens the
 * agent's skills, choosing one shows a chip, the skill is sent beside the text and not in it, and a `/` elsewhere is
 * text. The list is answered here by the browser, since what it holds depends on what is installed; the query itself
 * is proved by the server's integration test. Uses the operator's own conversation from seed-e2e-knowledge.mjs.
 */
const CONVERSATION = process.env.E2E_PLACES_CONVERSATION_ID

const SKILLS = [
  { name: 'org-code-review', title: 'Code review', description: 'Review a change', source: 'every-agent', sourceName: 'Fernhill', detail: 'acme/code-review 1.3.0' },
  { name: 'person-notes', title: 'My review notes', description: 'Short, numbered', source: 'yours', sourceName: 'Yours', detail: 'notes 1' },
]

async function open(page: Page): Promise<void> {
  await page.route('**/operations/listConversationSkills', route =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify({ json: { skills: SKILLS } }) }))
  await signIn(page, MEMBER)
  await page.goto(`/chat/t/${CONVERSATION}`)
  await expect(page.getByRole('textbox').last()).toBeVisible({ timeout: 20_000 })
}

test.describe('the / picker', () => {
  test.skip(!CONVERSATION, "needs the operator's conversation: run seed-e2e-knowledge.mjs and set E2E_PLACES_CONVERSATION_ID")

  test('opens at the start of the message, narrows, and a choice stays in the message as highlighted text that editing un-picks @SC-1548', async ({ page }) => {
    await open(page)
    const field = page.getByRole('textbox').last()
    await field.click()
    await page.keyboard.type('/rev')
    const list = page.getByRole('listbox', { name: 'Skills' })
    await expect(list.getByRole('option')).toHaveCount(2)
    await page.keyboard.press('Enter')
    await expect(field).toHaveAttribute('data-picked-skill', /^\/.+/)
    await expect(page.getByTestId('skill-picker')).toHaveCount(0)
    await page.keyboard.press('Backspace')
    await page.keyboard.press('Backspace')
    await expect(field).not.toHaveAttribute('data-picked-skill', /.+/)
  })

  test('a / later in the message is text and opens nothing @SC-1548', async ({ page }) => {
    await open(page)
    const field = page.getByRole('textbox').last()
    await field.click()
    await page.keyboard.type('open src/')
    await expect(page.getByTestId('skill-picker')).toHaveCount(0)
  })
})
