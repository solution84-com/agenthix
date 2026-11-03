import { describe, expect, it } from 'vitest'
import { METADATA_ADDRESSES, nftScript, parseRange, rulesInPlace, tableFor, type RuleSet } from '../rules'
import { isDockerDesktop, machineRules, sharesMachineNetwork, type MachineFacts } from '../machine'
import { listing } from './nftListing'

/** The installation's agent slice, as `compose/agentSlice.ts` records it. */
const SLICE = '10.213.16.0/20'
const set: RuleSet = { table: 'agenthix_agents', range: { addr: '10.213.16.0', len: 20 }, machineAddresses: [] }
const desktop: RuleSet = { ...set, machineAddresses: ['192.168.65.254'] }
const PART = { part: { addr: '10.213.24.0', len: 21 }, publicAddresses: [] }

describe('the rules built @SC-824', () => {
  it('replaces one table of its own whole, in one transaction', () => {
    const script = nftScript(set)
    const lines = script.split('\n')
    expect(lines.slice(0, 3)).toEqual(['table inet agenthix_agents', 'delete table inet agenthix_agents', 'table inet agenthix_agents {'])
    expect(script.match(/^table|^delete/gm)).toHaveLength(3)
  })

  it('hooks before Docker’s own filter chains, accepting everything it does not drop', () => {
    const script = nftScript(set)
    expect(script).toContain('type filter hook input priority -10; policy accept;')
    expect(script).toContain('type filter hook forward priority -10; policy accept;')
    expect(script).not.toMatch(/policy drop|\baccept\b(?!;)/)
  })

  it('shuts the machine’s own ports to the agents’ range', () => {
    expect(nftScript(set)).toMatch(/chain input \{[^}]*ip saddr 10\.213\.16\.0\/20 drop comment "machine-ports"/)
  })

  it('shuts ports other containers publish: any connection Docker redirected', () => {
    expect(nftScript(set)).toContain('ip saddr 10.213.16.0/20 ct direction original ct status dnat drop comment "published-ports"')
  })

  it('shuts the cloud providers’ metadata addresses, every one on the list', () => {
    expect(METADATA_ADDRESSES).toEqual(['169.254.0.0/16', '168.63.129.16', '100.100.100.200'])
    expect(nftScript(set)).toContain(
      'ip saddr 10.213.16.0/20 ip daddr { 169.254.0.0/16, 168.63.129.16, 100.100.100.200 } drop comment "metadata-address"',
    )
  })

  it('on Docker Desktop also shuts the computer Docker runs on', () => {
    expect(nftScript(desktop)).toContain('ip saddr 10.213.16.0/20 ip daddr { 192.168.65.254 } drop comment "machine-ports"')
    expect(nftScript(set).match(/drop comment "machine-ports"/g)).toHaveLength(1)
  })

  it('touches nothing but traffic from the agents’ range, so ordinary internet access stays', () => {
    const rules = nftScript(desktop).split('\n').filter(l => /drop/.test(l))
    expect(rules).toHaveLength(4)
    for (const r of rules) expect(r).toMatch(/^\t\tip saddr 10\.213\.16\.0\/20 /)
  })

  it('refuses anything that is not an address, rather than writing it into the firewall', () => {
    expect(() => nftScript({ ...set, machineAddresses: ['1.2.3.4; flush ruleset'] })).toThrow()
    expect(() => parseRange('10.213.0.0/16; flush ruleset')).toThrow()
    expect(parseRange('10.213.0.0/16')).toEqual({ addr: '10.213.0.0', len: 16 })
  })

  it('names its table from the install’s namespace @SC-821', () => {
    expect(tableFor('agenthix')).toBe('agenthix_agents')
    expect(tableFor('acme-ai')).toBe('acme_ai_agents')
  })
})

describe('which rules hold @SC-824', () => {
  it('all three, when the table is as applied', () => {
    expect(rulesInPlace(listing(set), set)).toEqual(['machine-ports', 'published-ports', 'metadata-address'])
    expect(rulesInPlace(listing(desktop), desktop)).toEqual(['machine-ports', 'published-ports', 'metadata-address'])
  })

  it('none, when the table is gone or nft says something else', () => {
    expect(rulesInPlace('{"nftables":[]}', set)).toEqual([])
    expect(rulesInPlace('not json', set)).toEqual([])
  })

  it('not one whose rule was removed', () => {
    expect(rulesInPlace(listing(set, { without: ['metadata-address'] }), set)).toEqual(['machine-ports', 'published-ports'])
    expect(rulesInPlace(listing(desktop, { without: ['machine-ports'] }), desktop)).toEqual(['published-ports', 'metadata-address'])
  })

  it('not one that covers another range, or that no longer drops', () => {
    const other = { ...set, range: { addr: '10.99.0.0', len: 16 } }
    expect(rulesInPlace(listing(other), set)).toEqual([])
    expect(rulesInPlace(listing(set).replace(/\{"drop":null\}/g, '{"accept":null}'), set)).toEqual([])
  })

  it('not the metadata rule, when it leaves out an address on the list', () => {
    expect(rulesInPlace(listing(set, { metadata: ['169.254.169.254', '168.63.129.16'] }), set)).toEqual(['machine-ports', 'published-ports'])
  })

  it('refuses the whole link-local range, not three addresses: 169.254.170.2 and 169.254.0.23 are inside it', () => {
    const script = nftScript(set)
    expect(script).toContain('ip daddr { 169.254.0.0/16,')
    expect(rulesInPlace(listing(set, { metadata: ['169.254.169.254/32', '168.63.129.16', '100.100.100.200'] }), set)).not.toContain('metadata-address')
    expect(rulesInPlace(listing(set), set)).toContain('metadata-address')
  })

  it('not the computer Docker runs on, when its rule names another address', () => {
    expect(rulesInPlace(listing({ ...desktop, machineAddresses: ['192.168.65.2'] }), desktop)).not.toContain('machine-ports')
  })

  it('not a chain that lost its hook', () => {
    expect(rulesInPlace(listing(set).replace('"hook":"forward"', '"hook":"output"'), set)).toEqual(['machine-ports'])
  })
})

describe('this machine @SC-824', () => {
  const facts = (over: Partial<MachineFacts> = {}): MachineFacts => ({
    interfaces: () => ['lo', 'eth0', 'docker0'], kernel: () => '6.8.0-45-generic', lookup: async () => [], ...over,
  })

  it('needs the machine’s network: Docker’s bridges are in no container’s', async () => {
    expect(sharesMachineNetwork(['lo', 'eth0'])).toBe(false)
    expect(sharesMachineNetwork(['lo', 'eth0', 'br-1a2b3c'])).toBe(true)
    const r = await machineRules('agenthix', () => SLICE, facts({ interfaces: () => ['lo', 'eth0'] }))()
    expect(r).toEqual({ problem: expect.stringContaining('--network host') })
  })

  it('on Linux, is the installation’s own agent slice and nothing else @SC-1247', async () => {
    expect(await machineRules('agenthix', () => SLICE, facts())()).toEqual({ ...set, livePreview: PART })
    const script = nftScript(set)
    expect(script).not.toContain('10.213.0.0/16')
    expect(script.match(/ip saddr (\S+)/g)!.every(m => m === `ip saddr ${SLICE}`)).toBe(true)
  })

  it('has no rules while the installation has no agent slice (no site here) @SC-1247', async () => {
    let asked = 0
    const rules = machineRules('agenthix', () => null, facts({ interfaces: () => { asked++; return [] } }))
    expect(await rules()).toBeNull()
    expect(asked).toBe(0)
  })

  it('reads the slice at every check, so a slice recorded later is covered at the next @SC-1247', async () => {
    let range: string | null = null
    const rules = machineRules('agenthix', () => range, facts())
    expect(await rules()).toBeNull()
    range = SLICE
    expect(await rules()).toEqual({ ...set, livePreview: PART })
  })

  it('on Docker Desktop, adds the computer Docker runs on', async () => {
    expect(isDockerDesktop('6.10.14-linuxkit')).toBe(true)
    const lookup = async (name: string) => (name === 'host.docker.internal' ? ['192.168.65.254'] : ['192.168.65.254', '127.0.0.1'])
    expect(await machineRules('agenthix', () => SLICE, facts({ kernel: () => '6.10.14-linuxkit', lookup }))()).toEqual({ ...desktop, livePreview: PART })
  })

  it('on Docker Desktop, does not hold without that address', async () => {
    const r = await machineRules('agenthix', () => SLICE, facts({ kernel: () => '6.10.14-linuxkit' }))()
    expect(r).toEqual({ problem: expect.stringContaining('Docker Desktop') })
  })
})
