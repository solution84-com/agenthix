import { beforeEach, describe, expect, it, vi } from 'vitest'
import { withFeature } from '@agenthix/core/testing'

process.env.HOST_NAMESPACE = 'svc-net-unit'
process.env.AGENT_NETWORK_RANGE = '10.211.0.0/20'

const calls = vi.hoisted(() => ({ docker: [] as string[][], existing: null as Record<string, unknown> | null, used: '10.211.8.0/29 ', manifest: '', manifestMs: 0 }))
vi.mock('node:dns/promises', () => ({ default: { lookup: async () => [{ address: '93.184.216.34', family: 4 }] } }))
vi.mock('../../../../agents/runtime/containerLifecycle', async importOriginal => {
  const real = await importOriginal<typeof import('../../../../agents/runtime/containerLifecycle')>()
  const docker = async (args: string[]) => {
    calls.docker.push(args)
    if (args[0] === 'network' && args[1] === 'inspect' && args[2] === 'room-svc') {
      if (!calls.existing) throw new Error('Error: No such network: room-svc')
      return { stdout: JSON.stringify([calls.existing]), stderr: '' }
    }
    if (args[0] === 'manifest') {
      if (calls.manifestMs) await new Promise(r => setTimeout(r, calls.manifestMs))
      return { stdout: calls.manifest, stderr: '' }
    }
    if (args[0] === 'network' && args[1] === 'ls') return { stdout: 'n1\n', stderr: '' }
    if (args[0] === 'network' && args[1] === 'inspect') return { stdout: calls.used, stderr: '' }
    return { stdout: '', stderr: '' }
  }
  return { ...real, docker, dockerWithin: docker }
})

import { cliServiceDocker, dockerArch, manifestLayerBytes, ServiceProblem, servicesNetworkHolds } from '../serviceDocker'

const created = () => calls.docker.filter(a => a[0] === 'network' && a[1] === 'create')
const subnetOf = (args: string[]) => args[args.indexOf('--subnet') + 1]

beforeEach(() => {
  calls.docker = []
  calls.existing = null
})

withFeature('livePreview', () => {
  describe('a live preview\'s services network @SC-1735', () => {
    it('is made internal, IPv4 only, on a free /28 of the live-preview part of the agent range, so the protections for live previews cover it', async () => {
      await cliServiceDocker.ensureNetwork('room-svc', { 'svc-net-unit.room': 'r1' })
      const [args] = created()
      expect(args).toContain('--internal')
      expect(args).toContain('--ipv6=false')
      // The live-preview part is the range's last /21; its first /29 is taken, so the first /28 (which holds it) is not free either.
      expect(subnetOf(args!)).toBe('10.211.8.16/28')
      expect(args).toContain('--label')
      expect(args!.at(-1)).toBe('room-svc')
    })

    it('reuses one the site made, inside the range and internal', async () => {
      calls.existing = { Internal: true, EnableIPv6: false, IPAM: { Config: [{ Subnet: '10.211.0.32/28' }] } }
      await cliServiceDocker.ensureNetwork('room-svc', {})
      expect(created()).toEqual([])
    })

    it('refuses one outside the agent range, or not internal, and makes none', async () => {
      calls.existing = { Internal: true, EnableIPv6: false, IPAM: { Config: [{ Subnet: '172.18.0.0/16' }] } }
      await expect(cliServiceDocker.ensureNetwork('room-svc', {})).rejects.toThrow(ServiceProblem)
      calls.existing = { Internal: false, EnableIPv6: false, IPAM: { Config: [{ Subnet: '10.211.0.32/28' }] } }
      await expect(cliServiceDocker.ensureNetwork('room-svc', {})).rejects.toThrow(ServiceProblem)
      expect(created()).toEqual([])
    })

    it('holds only with every subnet inside the range and no IPv6', () => {
      const net = (subnets: string[], v6 = false) => ({ Internal: true, EnableIPv6: v6, IPAM: { Config: subnets.map(Subnet => ({ Subnet })) } })
      expect(servicesNetworkHolds(net(['10.211.0.32/28']))).toBe(true)
      expect(servicesNetworkHolds(net([]))).toBe(false)
      expect(servicesNetworkHolds(net(['10.211.0.32/28'], true))).toBe(false)
      expect(servicesNetworkHolds(net(['10.211.0.32/28', 'fd00::/64']))).toBe(false)
      expect(servicesNetworkHolds(net(['10.0.0.0/8']))).toBe(false)
    })
  })

  const entry = (arch: string, sizes: number[], os = 'linux') => ({
    Descriptor: { platform: { os, architecture: arch } }, OCIManifest: { layers: sizes.map(size => ({ size })) },
  })

  describe('an image\'s size before it is pulled @SC-1742', () => {
    it('adds up the layers of this computer\'s manifest, from a list or a single one', () => {
      const list = [entry('amd64', [10, 20]), entry('unknown', [1], 'unknown'), entry('arm64', [30, 40])]
      expect(manifestLayerBytes(list, 'arm64')).toBe(70)
      expect(manifestLayerBytes(list, 'amd64')).toBe(30)
      expect(manifestLayerBytes(list, 's390x')).toBeNull()
      expect(manifestLayerBytes({ SchemaV2Manifest: { layers: [{ size: 5 }] } }, 'arm64')).toBe(5)
      expect(manifestLayerBytes({ SchemaV2Manifest: { layers: [{ size: -1 }] } }, 'arm64')).toBeNull()
      expect(manifestLayerBytes('nonsense', 'arm64')).toBeNull()
      expect(dockerArch('x64')).toBe('amd64')
    })

    it('refuses an image above the live preview\'s cap, or one whose size cannot be read, and pulls nothing', async () => {
      calls.manifest = JSON.stringify([entry(dockerArch(), [600, 600])])
      await expect(cliServiceDocker.pull('postgres:16', 1000)).rejects.toThrow(/above the live preview's 1000; it was not pulled/)
      calls.manifest = 'not json'
      await expect(cliServiceDocker.pull('postgres:16', 1000)).rejects.toThrow(/could not be read before pulling/)
      expect(calls.docker.filter(a => a[0] === 'pull')).toEqual([])
    })

    it('pulls one within the cap', async () => {
      calls.manifest = JSON.stringify([entry(dockerArch(), [100, 200])])
      await cliServiceDocker.pull('postgres:16', 1000)
      expect(calls.docker.filter(a => a[0] === 'pull')).toEqual([['pull', '--quiet', 'postgres:16']])
    })

    it('waits for a manifest list that takes a while to read, as one of many platforms does', async () => {
      // `docker manifest inspect --verbose` reads every platform's manifest in turn: 31 s for redis:7-alpine on the rig.
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
      try {
        calls.manifest = JSON.stringify([entry(dockerArch(), [100, 200])])
        calls.manifestMs = 31_000
        let done = false
        const pulled = cliServiceDocker.pull('redis:7-alpine', 1000).finally(() => { done = true })
        // A second at a time, letting the real file-system steps around it finish in between.
        for (let s = 0; s < 40 && !done; s++) {
          await new Promise(r => setImmediate(r))
          await vi.advanceTimersByTimeAsync(1_000)
        }
        await pulled
        expect(calls.docker.filter(a => a[0] === 'pull')).toEqual([['pull', '--quiet', 'redis:7-alpine']])
      } finally {
        calls.manifestMs = 0
        vi.useRealTimers()
      }
    })
  })
})
