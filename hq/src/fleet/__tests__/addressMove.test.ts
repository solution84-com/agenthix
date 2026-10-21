import { describe, it, expect, vi } from 'vitest'

vi.mock('wasp/server', () => ({ prisma: {} }))
vi.mock('../../sites/channel', () => ({ siteChannelRegistry: {} }))
vi.mock('../index', () => ({ relayHub: {} }))

import { addressMoveCommand, type AddressMoveDeps } from '../addressMove'

function deps(over: Partial<AddressMoveDeps> = {}) {
  const told: string[] = []
  const notices: { title: string; body: string }[] = []
  const d: AddressMoveDeps = {
    ownAddress: () => 'http://203.0.113.10:4100',
    tellSites: async address => { told.push(`sites:${address}`); return { told: 2, online: 2 } },
    tellRelay: address => { told.push(`relay:${address}`); return { hosts: 2, console: true } },
    totals: async () => ({ sites: 3, hosts: 3 }),
    tellPeople: async n => { notices.push(n); return 5 },
    ...over,
  }
  return { d, told, notices }
}

describe('address-move @SC-935', () => {
  it('tells the sites, the host services, the Fleet Console and everyone in HQ the new address', async () => {
    const { d, told, notices } = deps()
    const r = await addressMoveCommand(['http://198.51.100.24:4100'], d)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(told).toEqual(['sites:http://198.51.100.24:4100', 'relay:http://198.51.100.24:4100'])
    expect(r.data).toEqual({
      address: 'http://198.51.100.24:4100', cancelled: false,
      sites: { told: 2, online: 2, of: 3 }, hosts: { told: 2, of: 3 }, console: true, people: 5,
    })
    expect(r.text).toBe('2 of 3 sites and 2 of 3 host services were told HQ moves to http://198.51.100.24:4100, and the Fleet Console. Each switches once the new address passes its check.')
    expect(notices[0].body).toContain('http://198.51.100.24:4100')
  })

  it("calls a move off when given HQ's own address", async () => {
    const { d, notices } = deps()
    const r = await addressMoveCommand(['http://203.0.113.10:4100'], d)
    expect(r.ok && r.data).toMatchObject({ cancelled: true })
    expect(notices[0]).toEqual({ title: 'HQ did not move', body: 'HQ stays at http://203.0.113.10:4100. Nothing changed.' })
  })

  it('refuses what is not an address, telling no one', async () => {
    for (const args of [[], ['ftp://x'], ['http://x/path'], ['http://a', 'http://b'], ['http://x/']]) {
      const { d, told } = deps()
      expect(await addressMoveCommand(args, d)).toMatchObject({ ok: false, code: 'usage' })
      expect(told).toEqual([])
    }
  })
})
