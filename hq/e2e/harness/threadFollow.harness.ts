/**
 * How the thread moves while a reply is shown, measured on every frame in a real browser (jsdom lays nothing out).
 * Sending holds the person's message at the top with room under it. A typed reply is written there and the view never
 * follows it; a spoken one is followed a line at a time once it reaches the reading lines. The person's own scroll lets
 * go of the hold, ending voice moves nothing, and nothing moves when a reply ends. Each run's frame log is written to
 * the test's output folder (`frames.json`, and `measures.json` with what was read from it).
 */
import { writeFileSync } from 'node:fs'
import { expect, test, type Page, type TestInfo } from '@playwright/test'
import { measure, viewOf, type Frame, type Measures } from './frameLog'

/** Where the person's sent words are held: this far below the top of the view (`PIN_MARGIN`), give or take a pixel. */
const PIN_MARGIN = 16

async function open(page: Page, query: string) {
  await page.goto(`/?${query}`)
  await page.waitForFunction(() => document.querySelectorAll('[data-testid=reply-actions]').length > 0)
  await page.waitForTimeout(500)
}

/** The top of the person's newest words, from the top of the view. */
const wordsTop = (page: Page) => page.evaluate(() => {
  const box = document.querySelector<HTMLElement>('[data-testid=thread-messages]')!
  const words = [...box.querySelectorAll<HTMLElement>('[data-person-words]')].pop()!
  return words.getBoundingClientRect().top - box.getBoundingClientRect().top
})

async function send(page: Page): Promise<number> {
  return page.evaluate(() => { window.harness.frames.length = 0; window.harness.send(); return document.querySelectorAll('[data-testid=reply-actions]').length })
}

async function untilEnded(page: Page, info: TestInfo, before: number): Promise<{ frames: Frame[]; m: Measures }> {
  await page.waitForFunction((n) => ['ended', 'heard'].includes(window.harness.phase())
    && (window.harness.mode === 'typed' || window.harness.phase() === 'heard')
    && document.querySelectorAll('[data-testid=reply-actions]').length > n, before, { timeout: 100_000 })
  await page.waitForTimeout(1500)
  const frames = await page.evaluate(() => window.harness.frames)
  const m = measure(frames)
  writeFileSync(info.outputPath('frames.json'), JSON.stringify(frames))
  writeFileSync(info.outputPath('measures.json'), JSON.stringify(m, null, 2))
  return { frames, m }
}

/** How far the view moved over `frames`. */
const spread = (frames: Frame[]) => { const v = frames.map(viewOf); return Math.max(...v) - Math.min(...v) }

/** Nothing moves from the frame before the reply's buttons appear. */
function stillAtTheEnd(m: Measures) {
  expect(m.movedAtEnd, 'how far the view moved once the buttons appeared (px)').toBeLessThanOrEqual(1)
  expect(m.extentChangeAtEnd, 'how far the scroll’s extent changed once the buttons appeared (px)').toBeLessThanOrEqual(1)
}

test('a typed reply: the sent message is held at the top, and the view never follows the reply', async ({ page }, info) => {
  await open(page, 'mode=typed')
  const before = await send(page)
  await page.waitForTimeout(1200)
  expect(Math.abs((await wordsTop(page)) - PIN_MARGIN), 'the sent words, from where they are held (px)').toBeLessThanOrEqual(2)
  const heldAt = await page.evaluate(() => performance.now())
  const { frames, m } = await untilEnded(page, info, before)
  expect(spread(frames.filter((f) => f.t > heldAt)), 'how far the view moved while the reply was written (px)').toBeLessThanOrEqual(1)
  expect(m.maxBackStep, 'largest step back up (px)').toBeLessThanOrEqual(0.5)
  stillAtTheEnd(m)
})

test('a typed reply: scrolling lets go, and sending again holds the new message at the top', async ({ page }, info) => {
  await open(page, 'mode=typed')
  const before = await send(page)
  await page.waitForFunction(() => window.harness.phase() === 'streaming')
  await page.getByTestId('thread-messages').hover()
  await page.mouse.wheel(0, -400)
  const scrolledAt = await page.evaluate(() => performance.now())
  const { frames } = await untilEnded(page, info, before)
  // Once the wheel's own motion has settled, the view stays where the person left it, through the reply's end.
  const after = frames.filter((f) => f.t > scrolledAt + 600)
  expect(after.length).toBeGreaterThan(30)
  expect(spread(after), 'how far the view moved after the person scrolled (px)').toBeLessThanOrEqual(0.5)
  expect(await wordsTop(page)).toBeGreaterThan(PIN_MARGIN + 100)
  await send(page)
  await page.waitForTimeout(1200)
  expect(Math.abs((await wordsTop(page)) - PIN_MARGIN), 'the new words, from where they are held (px)').toBeLessThanOrEqual(2)
})

test('a typed reply out of sight: the jump button shows the typing dots, and keeps up once pressed', async ({ page }) => {
  await open(page, 'mode=typed&chars=4000')
  await send(page)
  await page.waitForFunction(() => window.harness.phase() === 'streaming' && !!document.querySelector('[data-testid=jump-writing]'), undefined, { timeout: 30_000 })
  await page.getByTestId('jump-to-latest').click()
  await page.waitForTimeout(800)
  const behind = await page.evaluate(() => { const box = document.querySelector<HTMLElement>('[data-testid=thread-messages]')!; return box.scrollHeight - box.clientHeight - box.scrollTop })
  expect(behind, 'how far from the end the view is, keeping up (px)').toBeLessThanOrEqual(30)
})

test('a spoken reply: the words are held at the top, the reply followed a line at a time, and nothing moves at its end', async ({ page }, info) => {
  await open(page, 'mode=voice&chars=1500&wordSecs=0.2')
  const before = await send(page)
  const { frames, m } = await untilEnded(page, info, before)
  expect(m.maxBackStep, 'largest step back up (px)').toBeLessThanOrEqual(0.5)
  // A line at a time: still most of the time, never a slow roll.
  const moving = frames.slice(1).filter((f, i) => Math.abs(viewOf(f) - viewOf(frames[i]!)) > 0.3).length
  expect(moving / frames.length, 'share of frames in which the view moved').toBeLessThan(0.4)
  stillAtTheEnd(m)
})

test('ending voice while a reply is spoken moves nothing', async ({ page }) => {
  await open(page, 'mode=voice&chars=1500&wordSecs=0.2')
  await send(page)
  await page.waitForTimeout(6000)
  const endedAt = await page.evaluate(() => { const t = performance.now(); window.harness.endVoice!(); return t })
  await page.waitForTimeout(1500)
  const frames = await page.evaluate(() => window.harness.frames)
  expect(spread(frames.filter((f) => f.t > endedAt - 50)), 'how far the view moved once voice ended (px)').toBeLessThanOrEqual(1)
})
