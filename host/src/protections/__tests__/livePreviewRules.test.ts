/**
 * The rules for the live-preview part of the agents' range (live preview spec section 6): a live preview reaches the
 * public internet and its own network, and no private address, nor the machine's public address once it is known.
 * Ordinary agents keep their private addresses.
 */
import { describe, expect, it } from 'vitest'
import { NOT_PUBLIC, dropSetFor, nftScript, rulesFor, type RuleSet } from '../rules'
import { dropsIn } from '../drops'
import { livePreviewPart } from '../machine'

const base: RuleSet = { table: 'agenthix_agents', range: { addr: '10.213.16.0', len: 20 }, machineAddresses: [] }
const lp: RuleSet = { ...base, livePreview: { part: { addr: '10.213.24.0', len: 21 }, publicAddresses: [] } }

describe('the live-preview part @SC-1758', () => {
  it('is the upper /21 of a larger slice, as the site reckons it, and none of one no larger', () => {
    expect(livePreviewPart('10.213.16.0/20')).toEqual({ addr: '10.213.24.0', len: 21 })
    expect(livePreviewPart('10.213.16.0/21')).toBeNull()
  })

  it('drops, and counts by address, anything from it to an address that is not public, except its own networks', () => {
    const script = nftScript(lp)
    expect(script).toContain(`set ${dropSetFor('private-addresses')} { type ipv4_addr; size 65535; flags dynamic; }`)
    expect(script).toContain(
      `ip saddr 10.213.24.0/21 ip daddr != 10.213.24.0/21 ip daddr { ${NOT_PUBLIC.join(', ')} } update @drops_private_addresses { ip saddr counter } drop comment "private-addresses"`,
    )
    expect(NOT_PUBLIC).toEqual(expect.arrayContaining(['10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16', '169.254.0.0/16', '100.64.0.0/10', '127.0.0.0/8']))
  })

  it('leaves ordinary agents their private addresses: only the part is closed', () => {
    expect(nftScript(lp)).not.toMatch(/ip saddr 10\.213\.16\.0\/20 ip daddr \{ 0\.0\.0\.0\/8/)
    expect(nftScript(base)).not.toContain('private-addresses')
  })

  it('writes the public address once one is known, and needs it only then', () => {
    expect(rulesFor(lp)).toEqual(['machine-ports', 'published-ports', 'metadata-address', 'private-addresses'])
    const known: RuleSet = { ...lp, livePreview: { ...lp.livePreview!, publicAddresses: ['203.0.113.7'] } }
    expect(rulesFor(known)).toContain('public-address')
    expect(nftScript(known)).toContain('ip saddr 10.213.24.0/21 ip daddr { 203.0.113.7 } update @drops_public_address { ip saddr counter } drop comment "public-address"')
  })

  it('refuses an address that is not one', () => {
    expect(() => nftScript({ ...lp, livePreview: { ...lp.livePreview!, publicAddresses: ['1.2.3.4; flush ruleset'] } })).toThrow()
  })

  it('reads the drops counted by address', () => {
    const listing = JSON.stringify({ nftables: [
      { set: { table: 'agenthix_agents', name: 'drops_private_addresses', elem: [{ elem: { val: '10.213.24.3', counter: { packets: 4, bytes: 240 } } }] } },
      { set: { table: 'other', name: 'drops_private_addresses', elem: [{ elem: { val: '10.213.24.9', counter: { packets: 1 } } }] } },
    ] })
    expect(dropsIn(listing, lp)).toEqual([{ rule: 'private-addresses', source: '10.213.24.3', dropped: 4 }])
  })
})
