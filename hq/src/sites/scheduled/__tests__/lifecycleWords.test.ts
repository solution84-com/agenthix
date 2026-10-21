import { describe, expect, it } from 'vitest'
import type { ChangeFacts } from '../noticeWords'
import { atOnce, lifecycleNoticeText, speaksOn } from '../lifecycleWords'

const at = new Date('2026-10-16T18:00:00Z')
const hqErase: ChangeFacts = { kind: 'erase', siteName: null, at, expectedMinutes: null, detail: null }
const siteErase: ChangeFacts = { ...hqErase, siteName: 'office-server' }

describe('what members read of an erase @SC-933', () => {
  it('shows everyone a countdown when HQ’s erase has a date', () => {
    expect(lifecycleNoticeText('scheduled', hqErase, [], 'UTC', false)).toEqual({
      title: 'HQ will be erased',
      body: 'This HQ will be erased on Fri 16 Oct at 18:00 by a fleet admin. Export what you need, or ask them to cancel.',
    })
    expect(lifecycleNoticeText('changed', hqErase, [], 'Europe/Berlin', false)?.body).toContain('on Fri 16 Oct at 20:00')
    expect(lifecycleNoticeText('cancelled', hqErase, [], 'UTC', false)).toEqual({ title: 'Erase cancelled', body: 'HQ will not be erased on Fri 16 Oct. Nothing changes.' })
  })

  it('tells no one ahead of an erase at once, of HQ or of a site', () => {
    expect(lifecycleNoticeText('scheduled', hqErase, [], 'UTC', true)).toBeNull()
    expect(lifecycleNoticeText('scheduled', siteErase, ['Docs site'], 'UTC', true)).toBeNull()
  })

  it('says a site has gone once its erase starts, with the reader’s projects there', () => {
    expect(speaksOn(siteErase, 'started')).toBe(true)
    expect(speaksOn(hqErase, 'started')).toBe(false)
    expect(lifecycleNoticeText('started', siteErase, ['Robot arm firmware', 'Docs site'], 'UTC', true)).toEqual({
      title: 'office-server has gone',
      body: 'office-server was erased from its machine, so nothing runs there now. Robot arm firmware and Docs site ran there, ' +
        'and do not run any more. If its work is needed, a fleet admin can bring it back within 30 days.',
    })
  })

  it('leaves a failed or missed erase to the general words', () => {
    expect(lifecycleNoticeText('failed', hqErase, [], 'UTC', false)).toBeUndefined()
    expect(lifecycleNoticeText('missed', siteErase, [], 'UTC', false)).toBeUndefined()
  })
})

describe('what members read of a suspension @SC-933', () => {
  it('says it lasts until it is resumed, not for a while', () => {
    const site: ChangeFacts = { kind: 'suspend', siteName: 'office-server', at, expectedMinutes: null, detail: null }
    expect(lifecycleNoticeText('scheduled', site, ['Docs site'], 'UTC', false)).toEqual({
      title: 'office-server will be suspended',
      body: 'office-server, where your work runs, will be suspended on Fri 16 Oct at 18:00: it stops, and nothing is lost. ' +
        'Docs site pauses from 17:55 until it is resumed. You don’t need to do anything.',
    })
    expect(lifecycleNoticeText('scheduled', { ...site, siteName: null }, [], 'UTC', true)?.title).toBe('HQ is suspended')
    expect(lifecycleNoticeText('scheduled', { ...site, siteName: null }, [], 'UTC', true)?.body)
      .toBe('HQ is suspended now: it stops, and nothing is lost. No new runs start, and agents already working pause until it is resumed. You don’t need to do anything.')
    expect(lifecycleNoticeText('scheduled', { ...site, kind: 'resume' }, [], 'UTC', false)?.body)
      .toBe('office-server starts again on Fri 16 Oct at 18:00. Runs that were paused carry on. You don’t need to do anything.')
  })

  it('takes a change set within a minute of being scheduled as one asked for now', () => {
    expect(atOnce(at, new Date(at.getTime() - 1000))).toBe(true)
    expect(atOnce(at, new Date(at.getTime() - 2 * 60_000))).toBe(false)
  })

  it('never uses the words it must not', () => {
    const all = JSON.stringify([
      lifecycleNoticeText('scheduled', hqErase, [], 'UTC', false), lifecycleNoticeText('started', siteErase, ['P'], 'UTC', true),
    ])
    expect(all).not.toMatch(/booking|operation/i)
  })
})
