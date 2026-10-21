/**
 * What the screens show of hq, asked over the link (core's hqFacts.ts): the organisation's name, the address people
 * open HQ at, and each site's runs. Words on a screen only — each answer is parsed field by field, and nothing here
 * decides anything. Kept for a while, so a screen read is not a call to hq each time; while one is out, the screen
 * gets the last answer, and waits briefly only for the first. An hq that does not answer, or is older than these
 * methods, leaves them out.
 */
import { parseHqAbout, parseSiteLoads, type HqAboutParsed, type SiteLoad } from '@agenthix/core'
import type { HqLink } from './link'

const ABOUT_FRESH_MS = 5 * 60_000
const LOADS_FRESH_MS = 10_000
const FIRST_WAIT_MS = 2_000
/** After hq refused or did not answer: asked again this soon, or at the next read after it. */
const RETRY_MS = 15_000

class Kept<T> {
  private kept: { value: T | null; at: number; answered: boolean } | null = null
  private asking: Promise<void> | null = null

  constructor(
    private readonly ask: () => Promise<T | null>,
    private readonly freshMs: number,
    private readonly now: () => number,
    private readonly firstWaitMs: number,
  ) {}

  async read(): Promise<T | null> {
    if (this.kept && this.now() - this.kept.at < (this.kept.answered ? this.freshMs : RETRY_MS)) return this.kept.value
    this.asking ??= this.ask()
      .then(value => { this.kept = { value, at: this.now(), answered: true } })
      // Refused, not answered, or an hq without the method: the last answer stands until hq is asked again.
      .catch(() => { this.kept = { value: this.kept?.value ?? null, at: this.now(), answered: false } })
      .finally(() => { this.asking = null })
    if (this.kept) return this.kept.value
    let timer: ReturnType<typeof setTimeout> | undefined
    await Promise.race([this.asking, new Promise<void>(r => { timer = setTimeout(r, this.firstWaitMs) })])
    clearTimeout(timer)
    return this.value()
  }

  private value(): T | null {
    return this.kept?.value ?? null
  }
}

export class HqFacts {
  private readonly about: Kept<HqAboutParsed>
  private readonly loads: Kept<SiteLoad[]>

  constructor(private readonly link: HqLink, now: () => number = Date.now, firstWaitMs = FIRST_WAIT_MS) {
    this.about = new Kept(async () => parseHqAbout(await link.call('hq.about', {})), ABOUT_FRESH_MS, now, firstWaitMs)
    this.loads = new Kept(async () => parseSiteLoads(await link.call('site.loads', {})), LOADS_FRESH_MS, now, firstWaitMs)
  }

  /** The organisation's name and HQ's address; the last answer while hq does not answer. */
  hq(): Promise<HqAboutParsed | null> {
    return this.about.read()
  }

  /** Each site's runs; none while hq does not answer, since a count from before is not today's. */
  async siteLoads(): Promise<SiteLoad[] | null> {
    return this.link.state === 'connected' ? this.loads.read() : null
  }
}
