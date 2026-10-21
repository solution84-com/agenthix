import { describe, expect, it } from 'vitest'
import { namesFor } from '../../state/namespace'
import { AGENT_NETWORK_RANGE } from '../projects'
import {
  chooseSubnets, INSTALL_NETWORK_RANGE, machineAddresses, overlaps, parseNetworkInspect, SubnetsExhausted, type DockerNetwork,
} from '../subnets'

const names = namesFor('agenthix')
const none: DockerNetwork[] = []

describe('the subnets an install’s networks are given @SC-1158', () => {
  it('gives each of the install’s networks its own /24 from the install range, never Docker’s default pool', () => {
    const s = chooseSubnets(names, none, [])
    expect(s).toEqual({
      [names.consoleNetwork]: '10.214.0.0/24',
      [names.hqNetwork]: '10.214.1.0/24',
      [names.siteNetwork]: '10.214.2.0/24',
      [names.edgeNetwork]: '10.214.3.0/24',
      [names.hqLinkNetwork]: '10.214.4.0/24',
    })
    for (const subnet of Object.values(s)) expect(overlaps(subnet, INSTALL_NETWORK_RANGE)).toBe(true)
  })

  it('never shares a range with the agents’ networks', () => {
    expect(overlaps(INSTALL_NETWORK_RANGE, AGENT_NETWORK_RANGE)).toBe(false)
  })

  it('skips a /24 another Docker network or one of the machine’s own addresses overlaps', () => {
    const existing = [
      { name: 'bridge', subnets: ['172.17.0.0/16'] },
      { name: 'other', subnets: ['10.214.0.0/23', 'fd00::/64'] },
      { name: 'wide', subnets: ['10.214.3.128/25'] },
    ]
    const s = chooseSubnets(names, existing, ['10.214.2.17/32', '192.168.0.13/24'])
    expect(s[names.consoleNetwork]).toBe('10.214.4.0/24')
    expect(s[names.hqNetwork]).toBe('10.214.5.0/24')
    expect(s[names.siteNetwork]).toBe('10.214.6.0/24')
    expect(s[names.edgeNetwork]).toBe('10.214.7.0/24')
    expect(s[names.hqLinkNetwork]).toBe('10.214.8.0/24')
  })

  it('keeps the subnet an existing network of the install already has, so compose never sees a changed network', () => {
    const first = chooseSubnets(names, none, [])
    // hq's project is up; its networks now exist, and something else took the /24s after them.
    const existing: DockerNetwork[] = [
      { name: names.hqNetwork, subnets: [first[names.hqNetwork]] },
      { name: names.edgeNetwork, subnets: [first[names.edgeNetwork]] },
      { name: names.hqLinkNetwork, subnets: [first[names.hqLinkNetwork]] },
      { name: 'someone-else', subnets: ['10.214.0.0/24'] },
    ]
    // The bridges of the install's own networks are among the machine's addresses, as the host service shares its network.
    const again = chooseSubnets(names, existing, ['10.214.1.1/24', '10.214.3.1/24', '10.214.4.1/24'])
    expect(again[names.hqNetwork]).toBe(first[names.hqNetwork])
    expect(again[names.edgeNetwork]).toBe(first[names.edgeNetwork])
    expect(again[names.hqLinkNetwork]).toBe(first[names.hqLinkNetwork])
    // The ones not yet made take the first /24s left, in the same order every time.
    expect(again[names.consoleNetwork]).toBe('10.214.2.0/24')
    expect(again[names.siteNetwork]).toBe('10.214.5.0/24')
  })

  it('gives the same answer to every project written before any of them is up, so none of them overlaps another', () => {
    expect(chooseSubnets(names, none, [])).toEqual(chooseSubnets(names, none, []))
  })

  it('never gives a second install on the machine a /24 the first one’s networks have', () => {
    const first = chooseSubnets(names, none, [])
    const existing = Object.entries(first).map(([name, subnet]) => ({ name, subnets: [subnet] }))
    const second = chooseSubnets(namesFor('hte1'), existing, [])
    const taken = new Set(Object.values(first))
    for (const subnet of Object.values(second)) expect(taken.has(subnet)).toBe(false)
    expect(new Set(Object.values(second)).size).toBe(5)
  })

  it('refuses in words, saying what to free, when the range has no /24 left', () => {
    const full = [{ name: 'greedy', subnets: ['10.214.0.0/17'] }, { name: 'greedier', subnets: ['10.214.128.0/18'] }]
    const almost = [...full, { name: 'last', subnets: ['10.214.192.0/19', '10.214.224.0/20', '10.214.240.0/21', '10.214.248.0/22'] }]
    // Four /24s are left (10.214.252–255), one short of the install's five networks.
    expect(() => chooseSubnets(names, almost, [])).toThrow(SubnetsExhausted)
    expect(() => chooseSubnets(names, almost, [])).toThrow(
      /agenthix-hq-link.*10\.214\.0\.0\/16.*docker network ls.*docker network rm/s,
    )
    const enough = [...full, { name: 'last', subnets: ['10.214.192.0/19', '10.214.224.0/20', '10.214.240.0/21', '10.214.248.0/23'] }]
    expect(Object.values(chooseSubnets(names, enough, []))).toEqual(
      ['10.214.250.0/24', '10.214.251.0/24', '10.214.252.0/24', '10.214.253.0/24', '10.214.254.0/24'],
    )
  })

  it('refuses when the machine’s own address covers the whole range', () => {
    expect(() => chooseSubnets(names, none, ['10.214.7.9/8'])).toThrow(SubnetsExhausted)
  })
})

describe('reading what is already on the machine @SC-1158', () => {
  it('reads each network’s name and IPv4 subnets from docker network inspect', () => {
    const out = 'bridge\t172.17.0.0/16 \nagenthix-hq-internal\t10.214.1.0/24 fd00:1::/64 \nnone\t\n'
    expect(parseNetworkInspect(out)).toEqual([
      { name: 'bridge', subnets: ['172.17.0.0/16'] },
      { name: 'agenthix-hq-internal', subnets: ['10.214.1.0/24'] },
      { name: 'none', subnets: [] },
    ])
  })

  it('takes the machine’s IPv4 addresses with their prefixes, skipping IPv6', () => {
    const interfaces = {
      lo: [{ address: '127.0.0.1', netmask: '255.0.0.0', family: 'IPv4', mac: '', internal: true, cidr: '127.0.0.1/8' }],
      en0: [
        { address: '192.168.0.13', netmask: '255.255.255.0', family: 'IPv4', mac: '', internal: false, cidr: '192.168.0.13/24' },
        { address: 'fe80::1', netmask: 'ffff:ffff:ffff:ffff::', family: 'IPv6', mac: '', internal: false, cidr: 'fe80::1/64', scopeid: 1 },
      ],
    } as const
    expect(machineAddresses(interfaces)).toEqual(['127.0.0.1/8', '192.168.0.13/24'])
  })
})
