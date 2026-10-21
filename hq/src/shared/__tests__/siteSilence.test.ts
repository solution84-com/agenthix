import { describe, it, expect } from 'vitest'
import type { SiteSilence } from '@agenthix/core'
import { unansweredSitesCopy } from '../siteSilence'

const silence = (over: Partial<SiteSilence> = {}): SiteSilence => ({
  siteId: 'site-a',
  label: 'Laptop',
  reason: 'offline',
  detail: 'Not connected to hq, so it could not be asked.',
  ...over,
})

describe('what a person is told when a site could not be asked', () => {
  it('says nothing at all when every site answered', () => {
    expect(unansweredSitesCopy([], 'this list')).toBeNull()
  })

  it('reads as a sentence for one site', () => {
    const copy = unansweredSitesCopy([silence()], 'this list')!

    expect(copy.headline).toBe('One Execution Site could not be asked. What it holds is missing from this list.')
  })

  it('reads as a sentence for several', () => {
    const copy = unansweredSitesCopy(
      [silence(), silence({ siteId: 'site-b', label: 'Build box' })],
      'these run figures and agent costs',
    )!

    expect(copy.headline).toBe(
      '2 Execution Sites could not be asked. What they hold is missing from these run figures and agent costs.',
    )
  })

  it('never makes the subject the subject of a verb, so any noun phrase fits', () => {
    // The bug this shape exists to prevent: a caller passing a plural subject
    // into a singular verb, or the reverse — "This list exclude one site".
    for (const subject of ['this list', 'these run figures', 'the storage page']) {
      const copy = unansweredSitesCopy([silence()], subject)!
      expect(copy.headline.endsWith(`is missing from ${subject}.`)).toBe(true)
    }
  })

  it('names a site by its label and carries the sentence the server wrote', () => {
    const copy = unansweredSitesCopy([silence()], 'this list')!

    expect(copy.sites).toEqual([
      {
        siteId: 'site-a',
        heading: 'Laptop — asleep or unreachable',
        detail: 'Not connected to hq, so it could not be asked.',
      },
    ])
    // The id is carried for a render key, never spoken.
    expect(copy.headline).not.toContain('site-a')
    expect(copy.sites[0].heading).not.toContain('site-a')
  })

  // Each reason means a different thing to do, so each reads differently. A
  // view is hard to drive into three of these; the words are checked here.
  it('tells a slow site apart from a stopped one', () => {
    const copy = unansweredSitesCopy(
      [silence({ reason: 'timeout', detail: 'Did not answer within 4 seconds.' })],
      'this list',
    )!

    expect(copy.sites[0].heading).toBe('Laptop — too slow to answer')
    expect(copy.sites[0].detail).toBe('Did not answer within 4 seconds.')
  })

  it('calls an out-of-date site out of date, not broken', () => {
    const copy = unansweredSitesCopy(
      [silence({ reason: 'version', detail: 'Runs protocol 9.4; this read needs 10.0 or newer. Upgrade the site.' })],
      'this list',
    )!

    expect(copy.sites[0].heading).toBe('Laptop — out of date')
    expect(copy.sites[0].detail).toContain('Upgrade the site.')
  })

  it('says a failed read failed there', () => {
    const copy = unansweredSitesCopy(
      [silence({ reason: 'error', detail: 'The read failed on this site.' })],
      'this list',
    )!

    expect(copy.sites[0].heading).toBe('Laptop — failed this read')
  })

  it('keeps the order it was given, which is registration order', () => {
    const copy = unansweredSitesCopy(
      [silence({ siteId: 'a', label: 'First' }), silence({ siteId: 'b', label: 'Second' })],
      'this list',
    )!

    expect(copy.sites.map((s) => s.siteId)).toEqual(['a', 'b'])
  })
})

describe('a read that belongs to one site', () => {
  it('names the unreachable site in the words the server wrote', async () => {
    const { unreachableSiteCopy } = await import('../siteSilence')
    const error = Object.assign(new Error('Execution Site "Laptop" is unreachable'), { statusCode: 503 })
    const copy = unreachableSiteCopy(error, 'this folder')!

    expect(copy.headline).toBe('The Execution Site could not be asked. What it holds is missing from this folder.')
    expect(copy.sites[0].detail).toBe('Execution Site "Laptop" is unreachable')
  })

  it('says nothing for a failure that is not an unreachable site, or for no failure', async () => {
    const { unreachableSiteCopy } = await import('../siteSilence')
    expect(unreachableSiteCopy(Object.assign(new Error('bad path'), { statusCode: 400 }), 'this folder')).toBeNull()
    expect(unreachableSiteCopy(null, 'this folder')).toBeNull()
  })

  it('collects one silence per site from a listing’s rows', async () => {
    const { silencesOfRows } = await import('../siteSilence')
    const a = silence()
    const b = silence({ siteId: 'site-b', label: 'Build box' })

    expect(silencesOfRows([{ siteSilence: a }, { siteSilence: a }, {}, { siteSilence: null }, { siteSilence: b }])).toEqual([a, b])
  })
})
