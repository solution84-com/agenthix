import { describe, expect, it } from 'vitest'
import { assertLoopbackListen, ConfigError, loadConfig } from '../config'
import { listen, otherNetworks } from '../console'

const env = { CONSOLE_HQ_ADDRESS: 'https://hq.example.com' }
const app = (_req: unknown, res: { end: () => void }) => res.end()

describe('the Fleet Console listens on 127.0.0.1 only @SC-861', () => {
  it.each(['0.0.0.0', '::', '::1', 'localhost', '192.168.1.20', '10.0.0.5', '127.0.0.2', ''])('refuses %j', host => {
    expect(() => assertLoopbackListen(host)).toThrow(ConfigError)
  })

  it('refuses a listen address from the environment that is not the loopback', async () => {
    await expect(loadConfig({ ...env, CONSOLE_LISTEN_HOST: '0.0.0.0' }, 'dev')).rejects.toThrow(/only on 127\.0\.0\.1/)
  })

  it('defaults to 127.0.0.1:4301 @SC-1254', async () => {
    const config = await loadConfig(env, 'dev')
    expect([config.listenHost, config.port]).toEqual(['127.0.0.1', 4301])
  })

  it('knows the port it is published on, the default outside an installation @SC-1254', async () => {
    expect((await loadConfig(env, 'dev')).publishedPort).toBe(7801)
    expect((await loadConfig({ ...env, CONSOLE_PUBLISHED_PORT: '9123' }, 'dev')).publishedPort).toBe(9123)
    await expect(loadConfig({ ...env, CONSOLE_PUBLISHED_PORT: 'x' }, 'dev')).rejects.toThrow(/CONSOLE_PUBLISHED_PORT/)
  })

  it('will not start a server anywhere else', async () => {
    await expect(listen(app as never, '0.0.0.0', 0)).rejects.toThrow(ConfigError)
  })

  it('serves on 127.0.0.1', async () => {
    const server = await listen(app as never, '127.0.0.1', 0)
    const address = server.address()
    expect(typeof address === 'object' && address?.address).toBe('127.0.0.1')
    await new Promise(r => server.close(r))
  })

  it('needs an hq address, and will not send secrets to one over plain http on the internet', async () => {
    await expect(loadConfig({}, 'dev')).rejects.toThrow(/CONSOLE_HQ_ADDRESS/)
    await expect(loadConfig({ CONSOLE_HQ_ADDRESS: 'http://hq.example.com' }, 'dev')).rejects.toThrow(/unencrypted/)
  })
})

describe('in its container, it listens on its own network only @SC-861', () => {
  // Its own network (eth0) carries the route out; HQ's link network (eth1) does not.
  const ROUTES = [
    'Iface\tDestination\tGateway \tFlags\tRefCnt\tUse\tMetric\tMask\t\tMTU\tWindow\tIRTT',
    'eth0\t00000000\t01001CAC\t0003\t0\t0\t0\t00000000\t0\t0\t0',
    'eth0\t00001CAC\t00000000\t0001\t0\t0\t0\t0000FFFF\t0\t0\t0',
    'eth1\t00001DAC\t00000000\t0001\t0\t0\t0\t0000FFFF\t0\t0\t0',
  ].join('\n')
  const nic = (address: string) => [{ address, netmask: '255.255.0.0', family: 'IPv4' as const, mac: '02:42:00:00:00:00', internal: false, cidr: null }]
  const network = (routes = ROUTES) => () => ({ routes, interfaces: { eth0: nic('172.28.0.2'), eth1: nic('172.29.0.3') } })
  const onHqMachine = { CONSOLE_HQ_ADDRESS: 'http://agenthix-hq-web:4100', HQ_CONSOLE_PAIRING_SECRET: 's'.repeat(64), CONSOLE_LISTEN_HOST: 'container' }
  const resolve = async (host: string) => (host === 'agenthix-hq-web' ? ['172.29.0.5'] : [])

  it('listens on its address on its own network, with that network’s gateway the one peer besides', async () => {
    const config = await loadConfig(onHqMachine, 'dev', { network: network(), resolve })
    expect([config.listenHost, config.containerGateway, config.port]).toEqual(['172.28.0.2', '172.28.0.1', 4301])
  })

  it('does not start when its route out is HQ’s link network', async () => {
    const throughLink = ROUTES.replace('eth0\t00000000\t01001CAC', 'eth1\t00000000\t01001DAC')
    await expect(loadConfig(onHqMachine, 'dev', { network: network(throughLink), resolve })).rejects.toThrow(/HQ is on the network/)
  })

  it('does not start outside a Linux container', async () => {
    const none = () => { throw new Error('ENOENT: /proc/net/route') }
    await expect(loadConfig({ ...env, CONSOLE_LISTEN_HOST: 'container' }, 'dev', { network: none })).rejects.toThrow(/not a Linux container/)
  })

  it('has no gateway to accept outside a container', async () => {
    expect((await loadConfig(env, 'dev')).containerGateway).toBeNull()
  })

  it('will not start a server on every address, or on any address but its own on that network', async () => {
    const peer = { address: '172.28.0.2', gateway: '172.28.0.1' }
    await expect(listen(app as never, '0.0.0.0', 0, peer)).rejects.toThrow(ConfigError)
    await expect(listen(app as never, '172.29.0.3', 0, peer)).rejects.toThrow(ConfigError)
    await expect(listen(app as never, '0.0.0.0', 0, { address: '0.0.0.0', gateway: '172.28.0.1' })).rejects.toThrow(ConfigError)
  })
})

describe('the networks it is on besides its own @SC-861', () => {
  const nic = (address: string, netmask = '255.255.0.0', internal = false) => [{ address, netmask, family: 'IPv4' as const, mac: '02:42:00:00:00:00', internal, cidr: null }]
  const own = { address: '172.28.0.2', gateway: '172.28.0.1' }

  it('lists HQ’s link network by its address and its gateway, the first address of its subnet', () => {
    const view = { routes: '', interfaces: { lo: nic('127.0.0.1', '255.0.0.0', true), eth0: nic('172.28.0.2'), eth1: nic('172.29.0.3') } }
    expect(otherNetworks(view, own)).toEqual([{ address: '172.29.0.3', gateway: '172.29.0.1' }])
  })

  it('lists nothing where the console is on its own network only', () => {
    expect(otherNetworks({ routes: '', interfaces: { eth0: nic('172.28.0.2') } }, own)).toEqual([])
  })

  it('will not start a server on an unspecified address as a further network', async () => {
    await expect(listen(app as never, '172.28.0.2', 0, { ...own, also: [{ address: '0.0.0.0', gateway: '10.0.0.1' }] })).rejects.toThrow(ConfigError)
  })
})
