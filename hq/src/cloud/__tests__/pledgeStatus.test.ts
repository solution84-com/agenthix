/** Whether a linked person signed the pledge, asked of the stand-in Cloud through the connection and kept a while. */
import { describe, expect, it } from 'vitest'
import { PledgeStatuses } from '../pledgeStatus'
import { connectedCloud } from './connectedCloud'

const ACCOUNT = 'acct_dana'

async function setUp(subject: string | null = ACCOUNT) {
  const c = await connectedCloud()
  c.cloud.accounts.linkAccount(c.clientId()!, ACCOUNT)
  const statuses = new PledgeStatuses({ connection: () => c.connection, subjectOf: async () => subject, now: c.now })
  const asked = () => c.cloud.requests.filter(r => r.path === '/connect/pledge/status').length
  return { ...c, statuses, asked }
}

describe('whether a linked person signed the pledge @SC-1125', () => {
  it('reads not signed, signed, and withdrawn', async () => {
    const h = await setUp()
    expect(await h.statuses.of('u-1')).toEqual({ kind: 'notSigned', withdrawn: false, currentVersion: 1 })
    h.cloud.accounts.pledges.set(ACCOUNT, { version: 1, signerId: 's_1' })
    h.advance(61 * 60_000)
    expect(await h.statuses.of('u-1')).toEqual({ kind: 'signed', version: 1, currentVersion: 1, signerId: 's_1' })
    h.cloud.accounts.pledges.set(ACCOUNT, 'withdrawn')
    h.advance(61 * 60_000)
    expect(await h.statuses.of('u-1')).toMatchObject({ kind: 'notSigned', withdrawn: true })
  })

  it('keeps an answer for an hour, asking Cloud once', async () => {
    const h = await setUp()
    await h.statuses.of('u-1')
    h.cloud.accounts.pledges.set(ACCOUNT, { version: 1, signerId: 's_1' })
    h.advance(59 * 60_000)
    expect((await h.statuses.of('u-1')).kind).toBe('notSigned')
    expect(h.asked()).toBe(1)
  })

  it('asks nothing for someone without a link, and knows nothing of an account Cloud has no link for', async () => {
    const none = await setUp(null)
    expect(await none.statuses.of('u-1')).toEqual({ kind: 'unknown' })
    expect(none.asked()).toBe(0)
    const other = await setUp('acct_someone_else')
    expect(await other.statuses.of('u-1')).toEqual({ kind: 'unknown' })
  })

  it('Cloud not answering is unknown, asked again after five minutes', async () => {
    const h = await setUp()
    h.cloud.answerNextWith('network')
    expect(await h.statuses.of('u-1')).toEqual({ kind: 'unknown' })
    h.advance(4 * 60_000)
    expect(await h.statuses.of('u-1')).toEqual({ kind: 'unknown' })
    h.advance(2 * 60_000)
    expect((await h.statuses.of('u-1')).kind).toBe('notSigned')
  })

  it('without a connection, asks nothing', async () => {
    const statuses = new PledgeStatuses({ connection: () => null, subjectOf: async () => { throw new Error('not read') } })
    expect(await statuses.of('u-1')).toEqual({ kind: 'unknown' })
  })
})
