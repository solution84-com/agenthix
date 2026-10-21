/**
 * The email the day before a scheduled change: asked of the stand-in Cloud through the connection, with a bearer
 * token hq signed for, only when connected, and only for the updates that call for it.
 */
import { describe, expect, it } from 'vitest'
import { askCloudToEmail, downtimeNoticeFor, type DowntimeChange } from '../downtimeEmail'
import { connectedCloud } from './connectedCloud'

const change = (over: Partial<DowntimeChange> = {}): DowntimeChange => ({
  id: 'c0ffee-1', kind: 'upgrade', at: new Date('2026-01-03T10:00:00.000Z'), expectedMinutes: 20, siteId: null, lastUpdate: 'scheduled', ...over,
})

async function harness(options: { connect?: boolean } = {}) {
  const h = await connectedCloud(options)
  const asked: (string | null)[] = []
  const deps = {
    connection: () => h.connection,
    linkedAccountsAffected: async (siteId: string | null) => { asked.push(siteId); return ['acct_dana', 'acct_sam'] },
  }
  return { ...h, asked, ask: (c: DowntimeChange) => askCloudToEmail(c, deps) }
}

describe('the downtime email @SC-1096', () => {
  it('asks Cloud, with a token hq signed for, to email the linked members a booked change affects', async () => {
    const h = await harness()
    expect(await h.ask(change())).toBe(true)
    expect(h.cloud.accounts.notices).toEqual([{
      notice_id: 'c0ffee-1', kind: 'upgrade', at: '2026-01-03T10:00:00.000Z', expected_minutes: 20, affects: 'hq',
      recipients: ['acct_dana', 'acct_sam'], withdrawn: false, clientId: h.clientId(),
    }])
  })

  it('sends a new time again under the same id, and withdraws a change called off', async () => {
    const h = await harness()
    await h.ask(change({ siteId: 'site-1' }))
    await h.ask(change({ siteId: 'site-1', lastUpdate: 'changed', at: new Date('2026-01-04T10:00:00.000Z') }))
    await h.ask(change({ siteId: 'site-1', lastUpdate: 'cancelled' }))
    expect(h.cloud.accounts.notices.map(n => [n.notice_id, n.affects, n.at, n.withdrawn, n.recipients.length])).toEqual([
      ['c0ffee-1', 'site', '2026-01-03T10:00:00.000Z', false, 2],
      ['c0ffee-1', 'site', '2026-01-04T10:00:00.000Z', false, 2],
      ['c0ffee-1', 'site', '2026-01-03T10:00:00.000Z', true, 0],
    ])
    expect(h.asked).toEqual(['site-1', 'site-1'])
  })

  it('asks nothing for the other updates', async () => {
    const h = await harness()
    for (const lastUpdate of ['pausing', 'started', 'completed', 'failed', 'missed']) expect(await h.ask(change({ lastUpdate }))).toBe(false)
    expect(h.cloud.accounts.notices).toEqual([])
  })

  it('asks nothing, and reads nothing for it, while hq is not connected', async () => {
    const h = await harness({ connect: false })
    expect(await h.ask(change())).toBe(false)
    expect(h.cloud.requests).toEqual([])
    expect(h.asked).toEqual([])
  })

  it('signs for a fresh token when Cloud does not take the one held', async () => {
    const h = await harness()
    h.cloud.answerNextWith({ status: 401, body: { error: 'invalid_token' } })
    expect(await h.ask(change())).toBe(true)
    expect(h.cloud.accounts.notices).toHaveLength(1)
    expect(h.cloud.requests.map(r => r.path).slice(-3)).toEqual(['/connect/notices/downtime', '/connect/token', '/connect/notices/downtime'])
  })

  it('sends nothing when no affected member has linked an account', () => {
    expect(downtimeNoticeFor(change(), [])).toBeNull()
    expect(downtimeNoticeFor(change({ lastUpdate: 'cancelled' }), [])).toMatchObject({ withdrawn: true, recipients: [] })
  })

  it('names the kind from the closed list of scheduled changes, and sends nothing for any other @SC-1144', () => {
    expect(downtimeNoticeFor(change({ kind: 'resize' }), ['acct_dana'])?.kind).toBe('resize')
    expect(downtimeNoticeFor(change({ kind: 'reboot' }), ['acct_dana'])).toBeNull()
  })

  it('takes the notice only when Cloud answers it was accepted @SC-1144', async () => {
    const h = await harness()
    h.cloud.answerNextWith({ status: 200, body: {} })
    await expect(h.ask(change())).rejects.toThrow(/does not understand/)
  })
})
