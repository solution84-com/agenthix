import { test, expect, type Page } from '@playwright/test'
import { signIn, ADMIN, MEMBER } from './fixtures/auth'

// One place to write (the chat panel board's f5): Home shows the state of HQ with no box of its own, a floating box
// at its foot only while the chat is minimised; the Chat page is the list for working through conversations, its
// search and filters in its address; a task's page has Talk about this task in place of a box. Pure UI behaviour
// only the browser proves. Needs the seeded e2e accounts (e2e/README.md); the task test also needs E2E_TASK_KEY.

test.use({ viewport: { width: 1280, height: 800 } })

const state = (page: Page, name: string) => page.getByTestId('dock-state').getByRole('radio', { name }).click()

test.beforeEach(async ({ page }) => {
  await signIn(page, MEMBER)
})

test.describe('Home and the Chat page keep one box @SC-509', () => {
  test('Home shows how HQ is doing and floats a box at its foot only while the chat is minimised', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('region', { name: 'Needs you' })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Running now' })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Pinned projects' })).toBeVisible()
    await expect(page.getByTestId('dock')).toBeVisible()
    await expect(page.getByTestId('floating-composer')).toHaveCount(0)

    const before = await page.getByRole('region', { name: 'Needs you' }).boundingBox()
    await state(page, 'Minimised (⌘J)')
    await expect(page.getByTestId('floating-composer')).toBeVisible()
    await expect(page.getByTestId('floating-composer').getByRole('textbox', { name: 'Ask any agent…' })).toBeVisible()
    // The page's content does not move when the box appears.
    const after = await page.getByRole('region', { name: 'Needs you' }).boundingBox()
    expect(after!.y).toBe(before!.y)

    await state(page, 'Beside the page')
    await expect(page.getByTestId('floating-composer')).toHaveCount(0)
  })

  test('the Chat page searches and filters its list from its address, and never changes the chat’s state', async ({ page }) => {
    await page.goto('/chat?q=zzz-no-such-conversation')
    await expect(page.getByTestId('chat-list-header').getByRole('heading', { name: 'Chat' })).toBeVisible()
    await expect(page.getByText('No conversation matches.')).toBeVisible()
    await expect(page.getByRole('searchbox', { name: 'Search titles and messages' })).toHaveValue('zzz-no-such-conversation')

    await page.getByRole('searchbox', { name: 'Search titles and messages' }).fill('')
    await expect(page).not.toHaveURL(/q=/)
    await page.getByRole('button', { name: /^Unread/ }).click()
    await expect(page).toHaveURL(/unread=1/)
    await expect(page.getByRole('button', { name: 'Archived' })).toBeVisible()

    await state(page, 'Minimised (⌘J)')
    await expect(page.getByTestId('floating-composer')).toBeVisible()
    await page.getByRole('button', { name: 'Archived' }).click()
    await expect(page).toHaveURL(/archived=1/)
    await expect(page.getByTestId('dock')).toHaveAttribute('data-position', 'collapsed')
  })

  test('Open in Chat carries the bar’s search and filters to the Chat page', async ({ page }) => {
    await page.goto('/')
    await page.getByTestId('dock').getByRole('button', { name: /^Conversations/ }).click()
    await page.getByRole('searchbox', { name: 'Search conversations' }).fill('plan')
    await page.getByRole('link', { name: /Open in Chat/ }).click()
    await expect(page).toHaveURL(/\/chat\?.*q=plan/)
    await expect(page.getByRole('searchbox', { name: 'Search titles and messages' })).toHaveValue('plan')
  })
})

const TASK_KEY = process.env.E2E_TASK_KEY

test.describe('a task has no box of its own @SC-976', () => {
  test('Talk about this task puts the task’s conversation in the chat panel', async ({ page }) => {
    test.skip(!TASK_KEY, 'needs a task: set E2E_TASK_KEY (as taskDelete.spec.ts does)')
    // The seeded task belongs to a project the member is not in: the admin sees it.
    await signIn(page, ADMIN)
    await page.goto(`/tasks/${TASK_KEY}`)
    await expect(page.getByTestId('task-thread')).toHaveCount(0)
    const talk = page.getByRole('button', { name: 'Talk about this task' })
    await expect(talk).toBeVisible()
    if (await talk.isDisabled()) return // no agent on the task: the button says why on hover
    await talk.click()
    const dock = page.getByRole('complementary', { name: 'Conversation' })
    await expect(dock.getByRole('textbox').last()).toBeVisible()
  })
})
