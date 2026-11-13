import { mkdirSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test, type Locator, type Page } from '@playwright/test'
import { signIn } from '../fixtures/auth'
import { screenshotNameOf } from './recipeName'

const here = dirname(fileURLToPath(import.meta.url))
export const CAPTURES_DIR = resolve(here, '.captures')

type Sample = {
  clock: { now: string; timezone: string; locale: string }
  password: string
  people: Record<string, { username: string }>
  invitation: { token: string; name: string; projects: string[] }
}
export const sample: Sample = JSON.parse(readFileSync(resolve(here, 'sample.json'), 'utf8'))

export type CaptureOptions = {
  /** The sample person to sign in as (a key of `people` in sample.json). Default `sam`; `null` for a screen shown before anyone has signed in. */
  as?: string | null
  /** Where to go, as hq's address (`/projects/WEB/tasks`). */
  path: string
  /** Runs after the page opens and before `ready`: clicks to get to a screen that has no address of its own. */
  before?: (page: Page) => Promise<void>
  /** Resolves when the screen has settled: an `expect(...)` for what the screenshot is about. */
  ready: (page: Page) => Promise<void>
  /** A taller window for a screen that does not fit in 900 pixels (the width stays 1440). */
  height?: number
  /** More parts of the screen to blank, beyond the server's clock text every capture blanks. */
  mask?: (page: Page) => Locator[]
  /** Blank the text hq writes from its own clock or machine (default). The Fleet Console's recipes turn it off: their text is the sample's. */
  maskServerText?: boolean
}

/**
 * Text the server writes from its own clock or machine, which the fixed browser date does not reach and which differs
 * from one run to the next: when health was checked, when the scheduler last ran, since when HQ has run, the disk a
 * machine has free. A capture covers each with a flat box rather than show a figure that is not part of the sample.
 */
/**
 * Text drawn from the server's own clock or machine, which the browser's fixed clock cannot hold still. Each match is
 * rewritten in place to the sample's value just before the picture, so a reader sees an ordinary screen and two runs
 * draw the same one. Only the matched words change, never the rest of the element.
 */
const SERVER_TEXT: [RegExp, string][] = [
  [/checked \d{1,2}:\d{2}/g, 'checked 09:30'],
  [/(scheduler (?:ran|failed)(?: at)?) \d{1,2}:\d{2}/g, '$1 09:25'],
  [/last report \d{1,2}:\d{2}/g, 'last report 09:29'],
  [/(Running since) [^·,]*?(?= ·|,|$)/g, '$1 12 Apr'],
  [/\d+(?:\.\d)? (GB|MB) free/g, '48 GB free'],
  // The Usage page opens on the server's current month, which the browser's fixed date does not reach.
  [/^(Usage · )?(?:January|February|March|April|May|June|July|August|September|October|November|December) \d{4}$/g, '$1April 2027'],
]

const MASK_COLOR = '#d9d9d9'

const saved = new Set<string>()

/**
 * Signs in, opens a screen, waits until it has settled and saves one screenshot as `.captures/<name>.png`,
 * named after the recipe file running it. Every capture is the same size, density, theme, date and timezone
 * (set by the `guide` projects in playwright.config.ts and the fixed clock below), with animations and the
 * text caret off.
 */
export async function capture(page: Page, options: CaptureOptions): Promise<string> {
  const file = test.info().file
  const name = screenshotNameOf(file)
  if (!name) throw new Error(`${file} is not a recipe: it must be named <words-joined-by-hyphens>.recipe.ts`)
  if (saved.has(name)) throw new Error(`recipe ${name} already saved its screenshot: one recipe saves one image`)

  await shipCloudOff(page)
  // A fixed time that still lets timers run, so the page loads normally and "2 days ago" never changes.
  await page.clock.setFixedTime(new Date(sample.clock.now))

  const as = options.as === undefined ? 'sam' : options.as
  if (as !== null) {
    const person = sample.people[as]
    if (!person) throw new Error(`no sample person "${as}" in sample.json`)
    await signIn(page, { username: person.username, password: sample.password })
  }

  if (options.height) await page.setViewportSize({ width: 1440, height: options.height })
  await page.goto(options.path)
  await options.before?.(page)
  await options.ready(page)
  // Live connections can keep the network from ever going quiet; the ready condition above is what counts.
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined)

  // Away from everything, so no row or button is drawn as hovered.
  await page.mouse.move(0, 0)
  mkdirSync(CAPTURES_DIR, { recursive: true })
  const path = resolve(CAPTURES_DIR, `${name}.png`)
  if (options.maskServerText !== false) await settleServerText(page)
  const mask = options.mask?.(page) ?? []
  await page.screenshot({ path, animations: 'disabled', caret: 'hide', scale: 'device', mask, maskColor: MASK_COLOR })
  saved.add(name)
  return path
}

/**
 * Agenthix Cloud is behind its flag at preview (adr-0189): off in every released build, on in the development hq a
 * capture runs against. A fresh HQ has no seeded switches, so the guide's screens are drawn as shipped here: the
 * features query answers Cloud off, and the sign-in pages' Cloud door answers as it does while off.
 */
async function shipCloudOff(page: Page): Promise<void> {
  await page.route('**/operations/get-features', async (route) => {
    const response = await route.fetch()
    const body = (await response.json()) as { json: { flags: Array<{ flag: string; on: boolean }> } }
    body.json.flags = body.json.flags.map((f) => (f.flag === 'cloud' ? { ...f, on: false } : f))
    await route.fulfill({ response, json: body })
  })
  await page.route('**/api/auth/cloud/status', (route) => route.fulfill({ status: 404, body: '' }))
}

async function settleServerText(page: Page): Promise<void> {
  const rules = SERVER_TEXT.map(([re, to]) => [re.source, re.flags, to] as const)
  await page.evaluate((list) => {
    // React may split one sentence into several text nodes ("checked ", "11:36"): an element whose children are all
    // text is rewritten as one string, so a pattern that spans them still matches.
    for (const el of Array.from(document.body.querySelectorAll('*'))) {
      const kids = Array.from(el.childNodes)
      if (kids.length === 0 || kids.some((k) => k.nodeType !== Node.TEXT_NODE)) continue
      const before = el.textContent ?? ''
      let text = before
      for (const [source, flags, to] of list) text = text.replace(new RegExp(source, flags), to)
      if (text !== before) el.textContent = text
    }
  }, rules)
}
