// SC-231 — the sweep stops every preview past its expiry and lets go of the row
// only once the site has said it is stopped. Against the real preview rows;
// the site's answer to `preview.stop` is the stand-in.
//
// A running preview holds its container against every removal path on the
// site, and `preview.stop` is the only thing that gives the hold back — so a
// stop that was never acknowledged must not be forgotten.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { prisma } from '../../test/db'

vi.mock('wasp/server', async () => {
  const { prisma } = await import('../../test/db')
  return { prisma }
})

import { sweepOnce } from '../previewSweep'
import { listExpired, markStatus, _resetCache } from '../previewRegistry'

const past = () => new Date(Date.now() - 1000)

let seq = 0
function preview(siteId: string, data: Record<string, unknown> = {}) {
  seq++
  return prisma.previewSession.create({
    data: { token: `tok-${seq}`, agentId: 'a1', siteId, previewId: `pv-${seq}`, command: 'npm run dev', status: 'running', expiresAt: past(), ...data },
  })
}

const statusOf = async (id: string) => (await prisma.previewSession.findUniqueOrThrow({ where: { id } })).status

beforeEach(() => {
  _resetCache()
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => { vi.restoreAllMocks() })

describe('sweepOnce @SC-231', () => {
  it('asks the site holding each expired preview to stop it, and expires the row', async () => {
    const a = await preview('site-a')
    const b = await preview('site-b')
    const live = await preview('site-a', { expiresAt: new Date(Date.now() + 60_000) })
    const asked: string[] = []

    const n = await sweepOnce(new Date(), { listExpired, markStatus, stop: async (row) => { asked.push(`${row.siteId}/${row.previewId}`) } })

    expect(n).toBe(2)
    expect(asked.sort()).toEqual([`site-a/${a.previewId}`, `site-b/${b.previewId}`].sort())
    expect(await statusOf(a.id)).toBe('expired')
    expect(await statusOf(b.id)).toBe('expired')
    expect(await statusOf(live.id)).toBe('running')
  })

  it('keeps an unacknowledged stop retryable, and expires the row once a later sweep gets through', async () => {
    const row = await preview('site-a')
    let siteUp = false
    const stop = async () => { if (!siteUp) throw new Error('Execution Site site-a is not connected') }

    await expect(sweepOnce(new Date(), { listExpired, markStatus, stop })).resolves.toBe(1)
    expect(await statusOf(row.id)).toBe('stopping')

    siteUp = true
    await sweepOnce(new Date(), { listExpired, markStatus, stop })
    expect(await statusOf(row.id)).toBe('expired')
    expect(await listExpired(new Date())).toEqual([])
  })

  it('carries on to the next row when one site cannot be reached, naming that site and preview in the log', async () => {
    const down = await preview('site-a')
    const up = await preview('site-b')

    await sweepOnce(new Date(), {
      listExpired,
      markStatus,
      stop: async (row) => { if (row.siteId === 'site-a') throw new Error('timed out') },
    })

    expect(await statusOf(down.id)).toBe('stopping')
    expect(await statusOf(up.id)).toBe('expired')
    const logged = vi.mocked(console.warn).mock.calls.flat().join(' ')
    expect(logged).toMatch(new RegExp(down.previewId))
    expect(logged).toMatch(/site-a/)
    expect(logged).toMatch(/timed out/)
  })
})
