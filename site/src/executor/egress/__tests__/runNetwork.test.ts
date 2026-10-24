import { beforeEach, describe, expect, it, vi } from 'vitest'

process.env.HOST_NAMESPACE = 'wf-unit'
process.env.AGENT_NETWORK_RANGE = '10.211.0.0/24'

const calls = vi.hoisted(() => ({ docker: [] as string[][], proxyStarts: [] as unknown[], failProxy: false, networks: [] as string[], proxies: [] as string[] }))
vi.mock('../../../agents/runtime/containerLifecycle', async importOriginal => {
  const real = await importOriginal<typeof import('../../../agents/runtime/containerLifecycle')>()
  const docker = async (args: string[]) => {
    calls.docker.push(args)
    if (args[0] === 'network' && args[1] === 'ls' && args.includes('-q')) return { stdout: 'n1\n', stderr: '' }
    if (args[0] === 'network' && args[1] === 'inspect') return { stdout: '10.211.0.0/29 ', stderr: '' }
    if (args[0] === 'network' && args[1] === 'ls') return { stdout: calls.networks.join('\n'), stderr: '' }
    if (args[0] === 'ps') return { stdout: calls.proxies.join('\n'), stderr: '' }
    return { stdout: '', stderr: '' }
  }
  return { ...real, docker, dockerWithin: docker }
})
vi.mock('../proxyContainer', async importOriginal => ({
  ...(await importOriginal<typeof import('../proxyContainer')>()),
  startProxyContainer: async (spec: unknown) => {
    calls.proxyStarts.push(spec)
    if (calls.failProxy) throw new Error('proxy failed')
    return { stop: async () => { calls.docker.push(['rm', '-f', 'proxy']) } }
  },
}))

import { RunNetworkRefused } from '../../seams'
import { proxyCreateArgs } from '../proxyContainer'
import { startRunNetwork, sweepEgress } from '../runNetwork'

const HOSTS = [{ host: 'registry.npmjs.org', port: 443 }, { host: 'staging.example.com', port: 22 }]
const created = () => calls.docker.filter(a => a[0] === 'network' && a[1] === 'create')
const removed = () => calls.docker.filter(a => a[0] === 'network' && a[1] === 'rm').map(a => a[2])

beforeEach(() => {
  calls.docker = []
  calls.proxyStarts = []
  calls.failProxy = false
  calls.networks = []
  calls.proxies = []
})

describe('a run\'s network', () => {
  it('has no network at all without hosts, and starts nothing', async () => {
    const n = await startRunNetwork('r1', [])
    expect(n.dockerArgs).toEqual(['--network', 'none'])
    expect(calls.docker).toEqual([])
  })

  it('refuses a host on DNS\'s port before anything is made', async () => {
    await expect(startRunNetwork('r1', [{ host: 'ns.example.com', port: 53 }])).rejects.toThrow(RunNetworkRefused)
    await expect(startRunNetwork('r1', [{ host: 'ns.example.com', port: 53 }])).rejects.toThrow(/ns\.example\.com:53.*Nothing was changed\.$/)
    expect(calls.docker).toEqual([])
  })

  it('puts the steps on an internal network of their own, with the proxy as their name server', async () => {
    const n = await startRunNetwork('r1', HOSTS)
    const [internal, egress] = created()
    expect(internal).toContain('--internal')
    expect(internal).toContain('--ipv6=false')
    expect(internal!.at(-1)).toBe('wf-unit-workflow-r1-net')
    expect(internal).toContain('wf-unit.network=workflow')
    expect(internal).toContain('wf-unit.workflow-run=r1')
    expect(internal![internal!.indexOf('--subnet') + 1]).toBe('10.211.0.8/29')
    expect(egress).not.toContain('--internal')
    expect(egress!.at(-1)).toBe('wf-unit-workflow-r1-egress')
    expect(calls.proxyStarts).toEqual([expect.objectContaining({
      name: 'wf-unit-workflow-r1-proxy', internalNetwork: 'wf-unit-workflow-r1-net', egressNetwork: 'wf-unit-workflow-r1-egress',
      config: { address: '10.211.0.10', dnsPort: 53, hosts: HOSTS },
    })])
    expect(n.dockerArgs).toEqual(['--network', 'wf-unit-workflow-r1-net', '--dns', '10.211.0.10', '--dns-search', '.'])
    await n.release()
    await n.release()
    expect(removed()).toEqual(['wf-unit-workflow-r1-net', 'wf-unit-workflow-r1-egress'])
  })

  it('removes what it made when the proxy can\'t start', async () => {
    calls.failProxy = true
    await expect(startRunNetwork('r1', HOSTS)).rejects.toThrow('proxy failed')
    expect(removed()).toEqual(['wf-unit-workflow-r1-net', 'wf-unit-workflow-r1-egress'])
  })

  it('never removes an egress network it was given', async () => {
    const n = await startRunNetwork('r1', HOSTS, { egressNetwork: 'given' })
    await n.release()
    expect(removed()).toEqual(['wf-unit-workflow-r1-net'])
  })

  it('sweeps every proxy and run network a crash left', async () => {
    calls.proxies = ['wf-unit-workflow-r9-proxy']
    calls.networks = ['wf-unit-workflow-r9-net', 'wf-unit-workflow-r9-egress']
    expect(await sweepEgress()).toBe(2)
    expect(calls.docker).toContainEqual(['rm', '-f', 'wf-unit-workflow-r9-proxy'])
    expect(removed()).toEqual(['wf-unit-workflow-r9-net', 'wf-unit-workflow-r9-egress'])
    const ls = calls.docker.find(a => a[0] === 'network' && a[1] === 'ls' && a.includes('--filter'))
    expect(ls).toContain('label=wf-unit.network=workflow')
  })
})

describe('the proxy\'s container', () => {
  it('is hardened as a step is, with no log and its program on standard input', () => {
    const args = proxyCreateArgs({
      runId: 'r1', name: 'p', internalNetwork: 'in', egressNetwork: 'out',
      config: { address: '10.211.0.10', dnsPort: 53, hosts: HOSTS },
    }, 'sha256:abc')
    for (const flag of [['--user', '1001:1001'], ['--cap-drop', 'ALL'], ['--security-opt', 'no-new-privileges'],
      ['--log-driver', 'none'], ['--network', 'in'], ['--ip', '10.211.0.10']]) {
      expect(args[args.indexOf(flag[0]!) + 1]).toBe(flag[1])
    }
    expect(args).toContain('--read-only')
    expect(args.slice(-4)).toEqual(['sha256:abc', 'node', '--input-type=module', '-'])
    expect(args).not.toContain('-v')
    expect(args.join(' ')).not.toContain('docker.sock')
  })
})
