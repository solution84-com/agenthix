import { describe, expect, it, vi } from 'vitest'
import type { RunResult } from '../../docker/docker'
import { Firewall, type NftRunner } from '../firewall'
import { AgentProtections, removeTable } from '../protections'
import type { RuleSet } from '../rules'
import { listing } from './nftListing'

const set: RuleSet = { table: 'agenthix_agents', range: { addr: '10.213.16.0', len: 20 }, machineAddresses: [] }
const ok = (stdout = ''): RunResult => ({ code: 0, stdout, stderr: '' })

/** nft with one table: what was applied is what is listed, until something removes it. */
function fakeNft(over: { apply?: RunResult } = {}) {
  let table: string | null = null
  const calls: string[][] = []
  const run: NftRunner = async (args, input) => {
    calls.push(args)
    if (args[0] === '-f') {
      if (over.apply) return over.apply
      expect(input).toContain('table inet agenthix_agents {')
      table = listing(set)
      return ok()
    }
    if (args[0] === 'delete') {
      const was = table
      table = null
      return was ? ok() : { code: 1, stdout: '', stderr: 'Error: Could not process rule: No such file or directory' }
    }
    return table ? ok(table) : { code: 1, stdout: '', stderr: 'Error: No such file or directory' }
  }
  return { firewall: new Firewall(run), calls, remove: () => { table = null } }
}

const clock = () => new Date('2026-10-14T09:00:00Z')

describe('the agent protections @SC-825', () => {
  it('do not hold before their first check', () => {
    const p = new AgentProtections(fakeNft().firewall, async () => set, clock)
    expect(p.figures()).toMatchObject({ holding: false, rules: [], problem: expect.any(String) })
  })

  it('are applied when missing, and then hold', async () => {
    const nft = fakeNft()
    const p = new AgentProtections(nft.firewall, async () => set, clock)
    expect(await p.check()).toEqual({
      holding: true, rules: ['machine-ports', 'published-ports', 'metadata-address'], checkedAt: '2026-10-14T09:00:00.000Z', problem: null,
    })
    expect(nft.calls.map(c => c[0])).toEqual(['-j', '-f', '-j'])
  })

  it('are only checked while they hold, and put back when something removed them', async () => {
    const nft = fakeNft()
    const p = new AgentProtections(nft.firewall, async () => set, clock)
    await p.check()
    nft.calls.length = 0
    await p.check()
    expect(nft.calls.map(c => c[0])).toEqual(['-j'])
    nft.remove()
    expect((await p.check()).holding).toBe(true)
    expect(nft.calls.map(c => c[0])).toEqual(['-j', '-j', '-f', '-j'])
  })

  it('do not hold, and say why, without the right to change the firewall', async () => {
    const nft = fakeNft({ apply: { code: 1, stdout: '', stderr: 'Error: Could not process rule: Operation not permitted' } })
    const f = await new AgentProtections(nft.firewall, async () => set, clock).check()
    expect(f).toMatchObject({ holding: false, rules: [] })
    expect(f.problem).toContain('--cap-add NET_ADMIN')
  })

  it('do not hold without the firewall tool', async () => {
    const nft = fakeNft({ apply: { code: 127, stdout: '', stderr: 'spawn nft ENOENT' } })
    const f = await new AgentProtections(nft.firewall, async () => set, clock).check()
    expect(f.holding).toBe(false)
    expect(f.problem).toMatch(/no firewall tool/)
  })

  it('do not hold when the rules for this machine cannot be built, and touch nothing', async () => {
    const nft = fakeNft()
    const f = await new AgentProtections(nft.firewall, async () => ({ problem: 'Not on the machine’s network.' }), clock).check()
    expect(f).toMatchObject({ holding: false, problem: 'Not on the machine’s network.' })
    expect(nft.calls).toEqual([])
  })

  it('check at start and every minute, and say when that changes', async () => {
    vi.useFakeTimers()
    try {
      const nft = fakeNft()
      const log: string[] = []
      const stop = new AgentProtections(nft.firewall, async () => set, clock).start(60_000, l => log.push(l))
      await vi.advanceTimersByTimeAsync(0)
      expect(log).toEqual(['Agent protections hold.'])
      nft.calls.length = 0
      await vi.advanceTimersByTimeAsync(60_000)
      expect(nft.calls.length).toBeGreaterThan(0)
      expect(log).toHaveLength(1)
      stop()
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('the agent protections without an agent slice @SC-1247', () => {
  it('write nothing while the installation has no site, and say there is nothing to keep out', async () => {
    const nft = fakeNft()
    const f = await new AgentProtections(nft.firewall, async () => null, clock).check()
    expect(f).toEqual({ holding: true, rules: [], checkedAt: '2026-10-14T09:00:00.000Z', problem: null })
    expect(nft.calls).toEqual([])
  })

  it('do not hold from the moment a slice is recorded until its rules are in place', async () => {
    const nft = fakeNft()
    let source: RuleSet | null = null
    const p = new AgentProtections(nft.firewall, async () => source, clock)
    expect((await p.check()).holding).toBe(true)
    source = set
    p.rangeChanged()
    expect(p.figures()).toMatchObject({ holding: false, rules: [] })
    expect(await p.check()).toMatchObject({ holding: true, rules: ['machine-ports', 'published-ports', 'metadata-address'] })
    expect(nft.calls.some(c => c[0] === '-f')).toBe(true)
  })

  it('never keep a check begun before the slice was recorded', async () => {
    const nft = fakeNft()
    let release: (v: RuleSet | null) => void = () => {}
    let first = true
    const p = new AgentProtections(nft.firewall, () => first
      ? (first = false, new Promise<RuleSet | null>(r => { release = r }))
      : Promise.resolve(set), clock)
    const before = p.check()
    p.rangeChanged()
    const after = await p.check()
    release(null)
    await before
    expect(after.rules).toHaveLength(3)
    expect(p.figures()).toMatchObject({ holding: true, rules: ['machine-ports', 'published-ports', 'metadata-address'] })
  })
})

describe('removing the agent protections, for an uninstall @SC-1161', () => {
  it('deletes their table, and nothing puts it back', async () => {
    const nft = fakeNft()
    const p = new AgentProtections(nft.firewall, async () => set, clock)
    await p.check()
    expect(await p.remove('agenthix_agents')).toBe('removed')
    expect(nft.calls.at(-1)).toEqual(['delete', 'table', 'inet', 'agenthix_agents'])
    nft.calls.length = 0
    expect(await p.check()).toMatchObject({ holding: false, problem: 'The agent protections were removed: this machine is being uninstalled.' })
    expect(nft.calls).toEqual([])
  })

  it('finds nothing to fail on when the table is already gone', async () => {
    expect(await removeTable(fakeNft().firewall, 'agenthix_agents')).toBe('absent')
  })

  it('says why, when the firewall may not be changed', async () => {
    const run = async () => ({ code: 1, stdout: '', stderr: 'Error: Operation not permitted' })
    await expect(removeTable(new Firewall(run), 'agenthix_agents')).rejects.toThrow("The host service may not change this machine's firewall, so the firewall table agenthix_agents could not be removed.")
  })
})
