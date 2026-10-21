// Over 300 lines on purpose: one algorithm, the cross-site page and its cursor, whose cases share the site stand-in below.
/**
 * The run feed read across sites, and the cursor that pages it.
 *
 * The sites here are stand-ins that hold rows and honour a `before` the way
 * the contract defines it — everything strictly below that position, in the
 * same `(runFeedKey, id)` order — so what these assert is the merge and the
 * cursor arithmetic: which rows a page shows, in what order across pages, and
 * where each site is left standing afterwards. Whether a real site's SQL
 * implements that contract is a different question, answered against a real
 * database in site's own `runListPage.integration.test.ts`; a double that
 * agrees with the contract cannot catch a query that does not.
 *
 * What a slow or absent site means belongs to `combinedRead`'s own suite; here
 * `askEverySite` is stubbed so a silence can be produced on demand.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  parseRunPageCursor,
  runFeedKey,
  runPageCursor,
  SITE_PROTOCOL_VERSION,
  type RunListPageParams,
  type RunListPageResult,
  type RunRow,
  type SiteAnswer,
  type SiteSilence,
} from '@agenthix/core'

const mockAskEverySite = vi.hoisted(() => vi.fn())

vi.mock('../../sites/combinedRead', () => ({ askEverySite: mockAskEverySite }))
vi.mock('../siteRuntimeStore', () => import('../../test/fakes/siteRuntimeStore'))

import {
  readMergedRunFeed,
  decodeFeedCursor,
  encodeFeedCursor,
  compareRunsNewestFirst,
} from '../mergedRunFeed'
import * as siteStore from '../../test/fakes/siteRuntimeStore'

type Site = { id: string; siteId: string; label: string; status: string; protocolVersion: string | null }

const site = (siteId: string): Site => ({ id: siteId, siteId, label: siteId, status: 'ACTIVE', protocolVersion: SITE_PROTOCOL_VERSION })

const day = (n: number) => `2026-01-${String(n).padStart(2, '0')}T00:00:00.000Z`

/** Only the fields the feed orders and identifies rows by; the rest never leaves the site. */
const run = (id: string, startedAt: string | null, createdAt = day(1)): RunRow =>
  ({ id, startedAt, createdAt, sessionId: `sess-${id}`, agentId: 'a1', status: 'COMPLETED' }) as unknown as RunRow

/** Held per site and served as `run.listPage` is contracted to: ordered, cursor-filtered, capped. */
const held = new Map<string, RunRow[]>()
/** Sites that answer with a silence instead of rows. */
const silent = new Map<string, SiteSilence>()

function serve(siteId: string, params: RunListPageParams): RunListPageResult {
  const cursor = parseRunPageCursor(params.before)
  const all = [...(held.get(siteId) ?? [])].sort(compareRunsNewestFirst)
  const from = cursor ? all.filter((r) => belowCursor(r, cursor)) : all
  const rows = from.slice(0, params.limit)
  const oldest = rows.at(-1)
  return { runs: rows, nextBefore: rows.length === params.limit && oldest ? runPageCursor(oldest) : null }
}

/** `before` is exclusive and compares the pair, exactly as the site's own WHERE does. */
function belowCursor(row: RunRow, cursor: { at: string; id: string }): boolean {
  const key = runFeedKey(row)
  if (key !== cursor.at) return key < cursor.at
  return row.id < cursor.id
}

function stubSites() {
  siteStore.listRunsPage.mockImplementation(async (siteId: string, params: RunListPageParams) => serve(siteId, params))
  mockAskEverySite.mockImplementation(async (call: (s: Site) => Promise<RunListPageResult>, _opts?: unknown) => {
    const answers: SiteAnswer<RunListPageResult>[] = []
    const unanswered: SiteSilence[] = []
    for (const siteId of held.keys()) {
      const silence = silent.get(siteId)
      if (silence) {
        unanswered.push(silence)
        continue
      }
      answers.push({ siteId, value: await call(site(siteId)) })
    }
    return { answers, unanswered }
  })
}

/** Every row the feed gives up, page by page, with the paging invariants checked as it goes. */
async function pageToExhaustion(limit: number, visible?: (runs: RunRow[]) => Promise<RunRow[]>): Promise<RunRow[]> {
  const seen: RunRow[] = []
  let cursor: string | undefined
  for (let page = 0; page < 20; page++) {
    const feed = await readMergedRunFeed({ limit, cursor, visible })
    for (const row of feed.runs) {
      const previous = seen.at(-1)
      // The order must hold ACROSS pages, not only within one — a later page
      // returning a row newer than an earlier page's is the defect this walk
      // exists to catch, and nothing repeats or skips while it happens.
      if (previous) expect(compareRunsNewestFirst(previous, row)).toBeLessThan(0)
      seen.push(row)
    }
    if (feed.nextCursor === null) return seen
    cursor = feed.nextCursor
  }
  throw new Error('the feed never reported itself exhausted')
}

beforeEach(() => {
  vi.clearAllMocks()
  held.clear()
  silent.clear()
  stubSites()
})

describe('readMergedRunFeed', () => {
  it('returns the newest rows across sites, in one order', async () => {
    held.set('site-a', [run('r5', day(5)), run('r3', day(3))])
    held.set('site-b', [run('r4', day(4)), run('r2', day(2))])

    const feed = await readMergedRunFeed({ limit: 4 })

    expect(feed.runs.map((r) => r.id)).toEqual(['r5', 'r4', 'r3', 'r2'])
  })

  it('orders a run that never started by when it was created', async () => {
    held.set('site-a', [run('ran-recently', day(9)), run('failed-before-launch', null, day(2))])
    held.set('site-b', [run('ran-then', day(5))])

    expect((await pageToExhaustion(10)).map((r) => r.id)).toEqual([
      'ran-recently', 'ran-then', 'failed-before-launch',
    ])
  })

  it('breaks a tie on the run id, so a shared key cannot repeat or skip a row', async () => {
    held.set('site-a', [run('r-b', day(5))])
    held.set('site-b', [run('r-a', day(5))])

    expect((await pageToExhaustion(1)).map((r) => r.id)).toEqual(['r-b', 'r-a'])
  })

  it('asks each site only for what it has not already returned', async () => {
    held.set('site-a', [run('r5', day(5)), run('r3', day(3))])
    held.set('site-b', [run('r4', day(4)), run('r2', day(2))])

    const first = await readMergedRunFeed({ limit: 2 })
    expect(first.runs.map((r) => r.id)).toEqual(['r5', 'r4'])

    siteStore.listRunsPage.mockClear()
    const second = await readMergedRunFeed({ limit: 2, cursor: first.nextCursor! })

    expect(siteStore.listRunsPage).toHaveBeenCalledWith('site-a', expect.objectContaining({ before: runPageCursor(run('r5', day(5))) }))
    expect(siteStore.listRunsPage).toHaveBeenCalledWith('site-b', expect.objectContaining({ before: runPageCursor(run('r4', day(4))) }))
    expect(second.runs.map((r) => r.id)).toEqual(['r3', 'r2'])
  })

  it("advances a site's cursor only past the rows this page took from it", async () => {
    // site-b returned two rows and only its newest made the page — the other
    // one belongs to the next page, not behind the cursor.
    held.set('site-a', [run('r5', day(5))])
    held.set('site-b', [run('r4', day(4)), run('r2', day(2))])

    const first = await readMergedRunFeed({ limit: 2 })
    expect(decodeFeedCursor(first.nextCursor!)['site-b']).toBe(runPageCursor(run('r4', day(4))))

    const second = await readMergedRunFeed({ limit: 2, cursor: first.nextCursor! })
    expect(second.runs.map((r) => r.id)).toEqual(['r2'])
  })

  it('leaves a site that contributed nothing exactly where it was', async () => {
    held.set('site-a', [run('r5', day(5)), run('r4', day(4))])
    held.set('site-b', [run('r1', day(1))])

    const first = await readMergedRunFeed({ limit: 2 })
    expect(first.runs.map((r) => r.id)).toEqual(['r5', 'r4'])
    expect(decodeFeedCursor(first.nextCursor!)['site-b']).toBeUndefined()

    const second = await readMergedRunFeed({ limit: 2, cursor: first.nextCursor! })
    expect(second.runs.map((r) => r.id)).toEqual(['r1'])
  })

  it("keeps a site's previous cursor when it did not answer, so the next page can pick it up", async () => {
    held.set('site-a', [run('r5', day(5)), run('r3', day(3))])
    held.set('site-b', [run('r4', day(4)), run('r2', day(2))])

    const first = await readMergedRunFeed({ limit: 2 })
    const carried = decodeFeedCursor(first.nextCursor!)['site-b']

    silent.set('site-b', { siteId: 'site-b', label: 'Laptop', reason: 'timeout', detail: 'Did not answer.' })
    const second = await readMergedRunFeed({ limit: 2, cursor: first.nextCursor! })

    expect(second.unanswered).toHaveLength(1)
    expect(decodeFeedCursor(second.nextCursor!)['site-b']).toBe(carried)
  })

  it('ends with a null cursor when every site is exhausted', async () => {
    held.set('site-a', [run('r5', day(5))])
    held.set('site-b', [run('r4', day(4))])

    const feed = await readMergedRunFeed({ limit: 10 })

    expect(feed.runs.map((r) => r.id)).toEqual(['r5', 'r4'])
    expect(feed.nextCursor).toBeNull()
  })

  it('does not claim the end while a site stayed silent', async () => {
    held.set('site-a', [run('r5', day(5))])
    held.set('site-b', [run('r4', day(4))])
    silent.set('site-b', { siteId: 'site-b', label: 'Laptop', reason: 'offline', detail: 'Not connected to hq.' })

    expect((await readMergedRunFeed({ limit: 10 })).nextCursor).not.toBeNull()
  })

  it('treats a malformed cursor as the first page rather than failing', async () => {
    held.set('site-a', [run('r5', day(5))])

    await expect(readMergedRunFeed({ limit: 2, cursor: 'not-base64!' })).resolves.toMatchObject({
      runs: [expect.objectContaining({ id: 'r5' })],
    })
    expect(siteStore.listRunsPage).toHaveBeenCalledWith('site-a', expect.objectContaining({ before: undefined }))
  })

  it('names a site the read could not use rather than paging it forever', async () => {
    held.set('site-a', [run('r5', day(5))])
    silent.set('site-a', {
      siteId: 'site-a', label: 'Old Site', reason: 'version',
      detail: 'Runs protocol 1.0, which does not serve this read yet. Upgrade the site.',
    })

    const feed = await readMergedRunFeed({ limit: 2 })

    expect(feed.unanswered[0]).toMatchObject({ reason: 'version', siteId: 'site-a' })
  })
})

describe('how far down a page may reach', () => {
  // The horizon's visible effect is on the order ACROSS pages, which the walk
  // below is what actually detects; this case documents the boundary itself —
  // a row withheld because a site's window ended above it is not lost.
  it('withholds a row below a full window, and returns it on the next page in order', async () => {
    // site-a's window ends at day 4 and it has more below; site-b holds a row
    // at day 3. Emitting that row now would be a guess about what site-a holds
    // between day 4 and day 3.
    held.set('site-a', [run('a5', day(5)), run('a4', day(4)), run('a2', day(2))])
    held.set('site-b', [run('b3', day(3))])

    const first = await readMergedRunFeed({ limit: 2 })

    expect(first.runs.map((r) => r.id)).toEqual(['a5', 'a4'])
    // b3 is not lost by being withheld — it arrives on the next page, in order.
    expect((await pageToExhaustion(2)).map((r) => r.id)).toEqual(['a5', 'a4', 'b3', 'a2'])
  })

  it('keeps the whole feed in one order across pages, however the windows fall', async () => {
    // Deliberately uneven: a site whose newest rows are all invisible, another
    // with visible rows below that window, and page sizes that cut across both.
    held.set('site-a', [run('hidden-5', day(5)), run('hidden-4', day(4)), run('a-3', day(3)), run('a-1', day(1))])
    held.set('site-b', [run('b-45', day(6)), run('b-2', day(2))])
    const hideHidden = async (runs: RunRow[]) => runs.filter((r) => !r.id.startsWith('hidden'))

    const seen = await pageToExhaustion(2, hideHidden)

    expect(seen.map((r) => r.id)).toEqual(['b-45', 'a-3', 'b-2', 'a-1'])
  })

  it('a site that came back short imposes no limit on how far the page reaches', async () => {
    held.set('site-a', [run('a5', day(5))])
    held.set('site-b', [run('b4', day(4)), run('b3', day(3))])

    // site-a is exhausted, so nothing it holds can lie between b4 and b3.
    expect((await readMergedRunFeed({ limit: 3 })).runs.map((r) => r.id)).toEqual(['a5', 'b4', 'b3'])
  })
})

describe('what a viewer may not see', () => {
  it('filters before the page is sliced, so a hidden row does not take a slot', async () => {
    // site-b is exhausted, so the complete region is three rows deep while the
    // page asks for two. Sliced first and filtered after, this page would be
    // the single row `shown-2`.
    held.set('site-a', [run('hidden', day(5)), run('shown-1', day(3))])
    held.set('site-b', [run('shown-2', day(4))])

    const feed = await readMergedRunFeed({
      limit: 2,
      visible: async (runs) => runs.filter((r) => r.id !== 'hidden'),
    })

    expect(feed.runs.map((r) => r.id)).toEqual(['shown-2', 'shown-1'])
  })

  it('advances past an entire page of rows the viewer cannot see, rather than stalling on them', async () => {
    // More hidden rows than the page asks for, so page one comes back empty
    // while rows remain. If the cursor did not move, page two would be
    // identical and the feed would never reach the visible row.
    held.set('site-a', [run('hidden-5', day(5)), run('hidden-4', day(4)), run('hidden-3', day(3))])
    held.set('site-b', [run('shown', day(1))])
    const hideHidden = async (runs: RunRow[]) => runs.filter((r) => !r.id.startsWith('hidden'))

    const first = await readMergedRunFeed({ limit: 2, visible: hideHidden })
    expect(first.runs).toEqual([])
    expect(first.nextCursor).not.toBeNull()
    expect(decodeFeedCursor(first.nextCursor!)['site-a']).toBe(runPageCursor(run('hidden-4', day(4))))

    expect((await pageToExhaustion(2, hideHidden)).map((r) => r.id)).toEqual(['shown'])
  })

  it('advances past rows nobody could see even when every site came back exhausted', async () => {
    // No site imposes a horizon here, so the advance falls to "everything that
    // came back" — the branch a page with no horizon and nothing to show takes.
    // The silent site is what keeps the cursor alive to be inspected.
    held.set('site-a', [run('hidden-5', day(5)), run('hidden-4', day(4))])
    held.set('site-b', [run('elsewhere', day(1))])
    silent.set('site-b', { siteId: 'site-b', label: 'Laptop', reason: 'offline', detail: 'Not connected to hq.' })

    const feed = await readMergedRunFeed({
      limit: 3,
      visible: async (runs) => runs.filter((r) => !r.id.startsWith('hidden')),
    })

    expect(feed.runs).toEqual([])
    expect(decodeFeedCursor(feed.nextCursor!)['site-a']).toBe(runPageCursor(run('hidden-4', day(4))))
  })
})

describe('the feed cursor', () => {
  it('round-trips the position of every site', () => {
    const per = { 'site-a': `${day(5)}|r5`, 'site-b': `${day(2)}|r2` }
    expect(decodeFeedCursor(encodeFeedCursor(per))).toEqual(per)
  })

  it('reads an absent, unparseable or wrongly-shaped cursor as the first page', () => {
    expect(decodeFeedCursor(undefined)).toEqual({})
    expect(decodeFeedCursor('not-base64!')).toEqual({})
    expect(decodeFeedCursor(Buffer.from('["site-a"]').toString('base64url'))).toEqual({})
    expect(decodeFeedCursor(Buffer.from('{"site-a":7}').toString('base64url'))).toEqual({})
  })
})
