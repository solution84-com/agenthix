import { describe, expect, it } from 'vitest'
import { bannerText, heldMessage, noticeText, pausedReason, toldLine, type ChangeFacts } from '../noticeWords'
import { holding, OVERRUN_MS } from '../runHold'

const at = new Date('2026-10-18T02:00:00Z')
const site: ChangeFacts = { kind: 'upgrade', siteName: 'office-server', at, expectedMinutes: 20, detail: null }
const hq: ChangeFacts = { ...site, siteName: null }

describe('what members read of a scheduled change @SC-931', () => {
  it('names the site, the time in their own zone, how long, and which of their projects pause', () => {
    expect(noticeText('scheduled', site, ['Robot arm firmware', 'Vision pipeline'], 'UTC')).toEqual({
      title: 'Scheduled maintenance',
      body: 'office-server, where your work runs, is upgraded on Sun 18 Oct at 02:00, for about 20 minutes. ' +
        'Robot arm firmware and Vision pipeline pause from 01:55 and carry on afterwards. You don’t need to do anything.',
    })
    expect(noticeText('scheduled', site, ['Docs site'], 'Europe/Berlin')?.body).toContain('on Sun 18 Oct at 04:00, for about 20 minutes. Docs site pauses from 03:55')
  })

  it('tells everyone when the change is to HQ itself', () => {
    expect(noticeText('scheduled', hq, [], 'UTC')).toEqual({
      title: 'Scheduled maintenance: HQ will be unavailable',
      body: 'HQ is upgraded on Sun 18 Oct at 02:00, for about 20 minutes, so everyone is told. From 01:55 no new runs start, ' +
        'and agents already working pause and carry on afterwards. You don’t need to do anything.',
    })
  })

  it('says a change was moved, cancelled, failed or missed, and nothing for the steps they were told of', () => {
    expect(noticeText('changed', { ...site, at: new Date('2026-10-19T02:00:00Z') }, ['Robot arm firmware'], 'UTC')?.body)
      .toMatch(/^office-server's upgrade is now Mon 19 Oct at 02:00, for about 20 minutes\. Robot arm firmware pauses from 01:55/)
    expect(noticeText('cancelled', site, [], 'UTC')).toEqual({ title: 'Scheduled maintenance cancelled', body: "office-server's upgrade on Sun 18 Oct is off. Nothing pauses." })
    expect(noticeText('failed', hq, [], 'UTC')?.body).toBe("HQ's upgrade did not complete, and it was put back as it was. Runs carry on.")
    expect(noticeText('missed', { ...site, kind: 'resize' }, [], 'UTC')?.body).toBe("office-server's resize on Sun 18 Oct did not happen. Nothing changed, and runs carry on.")
    for (const update of ['pausing', 'started', 'completed'] as const) expect(noticeText(update, site, [], 'UTC')).toBeNull()
  })

  it('never names who scheduled it, nor uses the words it must not', () => {
    const all = (['scheduled', 'changed', 'cancelled', 'failed', 'missed'] as const).map(u => JSON.stringify(noticeText(u, site, ['P'], 'UTC'))).join(' ')
    expect(all).not.toMatch(/booking|operation|scheduled by/i)
  })

  it('calls the job maintenance, never a change, wherever a member reads it', () => {
    const updates = ['scheduled', 'changed', 'cancelled', 'failed', 'missed'] as const
    const read = [
      ...updates.flatMap(u => [noticeText(u, site, ['P'], 'UTC'), noticeText(u, hq, [], 'UTC')]),
      bannerText({ ...site, told: at, moved: null }, 'UTC'), bannerText({ ...hq, told: at, moved: null }, 'UTC'),
      pausedReason(site), heldMessage(site),
    ]
    for (const words of read) expect(JSON.stringify(words)).not.toMatch(/\bchanges?\b/i)
    expect(noticeText('scheduled', site, [], 'UTC')?.title).toBe('Scheduled maintenance')
    expect(noticeText('changed', site, [], 'UTC')?.title).toBe('Scheduled maintenance moved')
    expect(noticeText('failed', site, [], 'UTC')?.title).toBe('Scheduled maintenance did not complete')
    expect(noticeText('missed', site, [], 'UTC')?.title).toBe('Scheduled maintenance did not happen')
  })

  it('reads in a zone it does not know as UTC rather than failing', () => {
    expect(noticeText('cancelled', site, [], 'Not/AZone')?.body).toContain('Sun 18 Oct')
  })

  it('says why a task waits and why a message did not go @SC-932', () => {
    expect(pausedReason(site)).toBe('Paused for scheduled maintenance: the upgrade of office-server. It carries on by itself when that is done.')
    expect(heldMessage({ kind: 'resize', siteName: 'office-server' })).toBe(
      'Not sent: office-server is being resized in scheduled maintenance, so no new runs start there until it is done. Try again in a few minutes.')
  })
})

describe('when a scheduled change holds runs @SC-932', () => {
  const row = { at, expectedMinutes: 20, state: 'scheduled', pausedAt: null, resumedAt: null }
  const t = (iso: string) => new Date(iso)

  it('from its lead by hq’s own clock, or from when hq paused for it', () => {
    expect(holding(row, t('2026-10-18T01:54:00Z'))).toBe(false)
    expect(holding(row, t('2026-10-18T01:55:00Z'))).toBe(true)
    expect(holding({ ...row, pausedAt: t('2026-10-18T01:50:00Z') }, t('2026-10-18T01:50:00Z'))).toBe(true)
  })

  it('until it ends, is let go, or has overrun its time by far', () => {
    expect(holding({ ...row, state: 'done' }, t('2026-10-18T02:05:00Z'))).toBe(false)
    expect(holding({ ...row, resumedAt: t('2026-10-18T02:10:00Z') }, t('2026-10-18T02:11:00Z'))).toBe(false)
    expect(holding(row, new Date(at.getTime() + 20 * 60_000 + OVERRUN_MS + 1))).toBe(false)
  })
})

describe('the notice a member reads on a project, or on Home when hq itself changes @SC-931', () => {
  const told = new Date('2026-10-13T09:00:00Z')

  it('names the site where the project runs, when runs pause, and that nothing is asked', () => {
    expect(bannerText({ ...site, told, moved: null }, 'UTC')).toEqual({
      title: 'Scheduled maintenance will pause runs on Sun 18 Oct at 02:00, for about 20 minutes',
      body: 'office-server, where this project runs, is being upgraded. From 01:55 no new runs start here; ' +
        'agents already working finish their current step, pause, and carry on afterwards. You don’t need to do anything.',
    })
  })

  it('leads with the move when the time changed', () => {
    const moved = new Date('2026-10-15T15:10:00Z')
    expect(bannerText({ ...site, at: new Date('2026-10-19T02:00:00Z'), told, moved }, 'UTC').title)
      .toBe('Moved: maintenance is now Mon 19 Oct at 02:00, for about 20 minutes')
  })

  it('tells everyone on Home when the change is to HQ', () => {
    expect(bannerText({ ...hq, told, moved: null }, 'UTC')).toEqual({
      title: 'Scheduled maintenance: HQ will be unavailable on Sun 18 Oct at 02:00, for about 20 minutes',
      body: 'HQ’s machine is being upgraded, so everyone is told. From 01:55 no new runs start; ' +
        'agents already working finish their current step, pause, and carry on afterwards. You don’t need to do anything.',
    })
  })

  it('says when they were told, and when it moved', () => {
    expect(toldLine(told, null, new Date('2026-10-15T16:00:00Z'), 'UTC')).toBe('Told on 13 Oct')
    expect(toldLine(told, new Date('2026-10-15T15:10:00Z'), new Date('2026-10-15T16:00:00Z'), 'UTC')).toBe('Told on 13 Oct, moved today at 15:10')
    expect(toldLine(told, new Date('2026-10-14T15:10:00Z'), new Date('2026-10-15T16:00:00Z'), 'UTC')).toBe('Told on 13 Oct, moved on 14 Oct at 15:10')
  })
})
