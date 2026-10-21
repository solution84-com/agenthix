import type os from 'node:os'
import { describe, expect, it } from 'vitest'
import { defaultRoutes, listenInContainer, type NetworkView } from '../net/containerNetwork'

// A container on its own network (eth0, 172.28.0.0/16) and HQ's link network (eth1, 172.29.0.0/16), as on HQ's
// machine: the default route goes through its own network's gateway, 172.28.0.1.
const ROUTES = [
  'Iface\tDestination\tGateway \tFlags\tRefCnt\tUse\tMetric\tMask\t\tMTU\tWindow\tIRTT',
  'eth0\t00000000\t01001CAC\t0003\t0\t0\t0\t00000000\t0\t0\t0',
  'eth0\t00001CAC\t00000000\t0001\t0\t0\t0\t0000FFFF\t0\t0\t0',
  'eth1\t00001DAC\t00000000\t0001\t0\t0\t0\t0000FFFF\t0\t0\t0',
  '',
].join('\n')

const ipv4 = (address: string, netmask = '255.255.0.0', internal = false): os.NetworkInterfaceInfo => ({
  address, netmask, family: 'IPv4', mac: '02:42:ac:1c:00:02', internal, cidr: null,
})
const INTERFACES: NetworkView['interfaces'] = {
  lo: [ipv4('127.0.0.1', '255.0.0.0', true)],
  eth0: [ipv4('172.28.0.2')],
  eth1: [ipv4('172.29.0.3')],
}
const view = (over: Partial<NetworkView> = {}): NetworkView => ({ routes: ROUTES, interfaces: INTERFACES, ...over })

describe('the default route, read from /proc/net/route @SC-861', () => {
  it('finds the one route out and its gateway', () => {
    expect(defaultRoutes(ROUTES)).toEqual([{ iface: 'eth0', gateway: '172.28.0.1' }])
  })

  it('ignores a route that is down or has no gateway', () => {
    const down = ROUTES.replace('01001CAC\t0003', '01001CAC\t0002').replace('eth1\t00001DAC', 'eth1\t00000000')
    expect(defaultRoutes(down)).toEqual([])
  })
})

describe('where it listens in its container @SC-861', () => {
  it('listens on its own network’s address, and takes that network’s gateway as the one peer besides', () => {
    expect(listenInContainer(view(), [])).toEqual({ address: '172.28.0.2', gateway: '172.28.0.1', iface: 'eth0' })
  })

  it('refuses to listen on a network HQ is on: the link network must never be the one it answers on', () => {
    const throughLink = [
      'Iface\tDestination\tGateway \tFlags\tRefCnt\tUse\tMetric\tMask\t\tMTU\tWindow\tIRTT',
      'eth1\t00000000\t01001DAC\t0003\t0\t0\t0\t00000000\t0\t0\t0',
      'eth0\t00001CAC\t00000000\t0001\t0\t0\t0\t0000FFFF\t0\t0\t0',
      'eth1\t00001DAC\t00000000\t0001\t0\t0\t0\t0000FFFF\t0\t0\t0',
    ].join('\n')
    expect(listenInContainer(view({ routes: throughLink }), ['172.29.0.5'])).toMatch(/HQ is on the network/)
  })

  it('refuses when there is no default route, or more than one', () => {
    expect(listenInContainer(view({ routes: ROUTES.split('\n').filter(l => !l.includes('01001CAC')).join('\n') }), [])).toMatch(/no route out/)
    const twice = `${ROUTES}eth1\t00000000\t01001DAC\t0003\t0\t0\t0\t00000000\t0\t0\t0\n`
    expect(listenInContainer(view({ routes: twice }), [])).toMatch(/more than one route out/)
  })

  it('refuses an interface without exactly one IPv4 address, or a gateway outside its network', () => {
    expect(listenInContainer(view({ interfaces: { ...INTERFACES, eth0: [] } }), [])).toMatch(/no IPv4 address/)
    expect(listenInContainer(view({ interfaces: { ...INTERFACES, eth0: [ipv4('172.28.0.2'), ipv4('172.28.0.9')] } }), [])).toMatch(/more than one/)
    expect(listenInContainer(view({ interfaces: { ...INTERFACES, eth0: [ipv4('172.28.0.2', '255.255.255.255')] } }), [])).toMatch(/outside/)
    expect(listenInContainer(view({ interfaces: { ...INTERFACES, eth0: [ipv4('172.28.0.1')] } }), [])).toMatch(/outside|its own gateway/)
  })

  it('refuses the loopback as the way out', () => {
    const throughLo = ROUTES.replace('eth0\t00000000', 'lo\t00000000')
    expect(listenInContainer(view({ routes: throughLo }), [])).toMatch(/loopback/)
  })
})
