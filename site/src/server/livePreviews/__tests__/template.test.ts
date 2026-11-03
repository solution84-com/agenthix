/**
 * The live preview's container (live preview spec section 6, *May not reach*): made from one template that binds its
 * copy alone, and checked against it, so a container with anything more is refused.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { withFeature } from '@agenthix/core/testing'
import { setKernelIpv6ForTests } from '../../../agents/runtime/ipv6Off'
import { templateDifferences } from '../container/inspect'
import { buildTemplate, createArgs, mountArg, type LivePreviewTemplate } from '../container/template'
import type { LivePreviewBudget } from '../container/budget'

process.env.HOST_NAMESPACE = 'lp-unit'
const BUDGET: LivePreviewBudget = { memoryBytes: 2 ** 31, cpus: 2, pids: 1024, diskBytes: 1280 * 2 ** 20, imageBytes: 8 * 2 ** 30, logBytes: 30 * 2 ** 20 }
const LP = { id: 'lp-1', workspaceId: 'w1', personId: 'p1', projectId: 'pr1' }
const COPY = { hostDir: '/site/projects/pr1/clones/c1', containerDir: '/projects/pr1/clones/c1' }
const IMAGE = `sha256:${'a'.repeat(64)}`

beforeEach(() => setKernelIpv6ForTests(true))
afterEach(() => setKernelIpv6ForTests(null))

type Inspect = { Mounts: unknown[]; HostConfig: Record<string, unknown>; NetworkSettings: { Networks: Record<string, unknown> } } & Record<string, unknown>

/** What `docker inspect` would say of a container made exactly from `t`. */
function inspectOf(t: LivePreviewTemplate): Inspect {
  return {
    Id: 'c'.repeat(64), Name: `/${t.name}`, Image: t.image,
    Config: { User: t.user, Cmd: t.command, Entrypoint: null, Labels: t.labels },
    Mounts: t.mounts.map(m => ({ Type: 'bind', Source: m.source, Destination: m.target, RW: !m.readOnly, Propagation: 'rprivate' })),
    NetworkSettings: { Networks: { [t.network]: {} } },
    HostConfig: {
      Binds: null, VolumesFrom: null, Tmpfs: t.tmpfs, CapAdd: null, CapDrop: t.capDrop, Privileged: false, SecurityOpt: t.securityOpt,
      ReadonlyRootfs: true, NetworkMode: t.network, PortBindings: {}, PublishAllPorts: false, ExtraHosts: null, Dns: [],
      PidMode: '', IpcMode: 'private', UsernsMode: '', UTSMode: '', Devices: [], DeviceRequests: null, DeviceCgroupRules: null,
      Init: true, Memory: t.budget.memoryBytes, MemorySwap: t.budget.memoryBytes, NanoCpus: t.budget.cpus * 1e9, PidsLimit: t.budget.pids,
      LogConfig: { Type: 'local' }, Sysctls: t.sysctls,
    },
  }
}

withFeature('livePreview', () => {
  describe("the live preview's container template @SC-1734", () => {
    const t = buildTemplate(LP, COPY, BUDGET, IMAGE)

    it('binds the copy alone: no workspace folder, other copy, storage, site data or Docker socket', () => {
      expect(t.mounts).toEqual([{ source: COPY.hostDir, target: COPY.containerDir, readOnly: false }])
      expect(createArgs(t).join(' ')).not.toMatch(/docker\.sock|workspaces\//)
    })

    it('has no capability, no new privileges, a read-only root, its own network, and IPv6 off', () => {
      expect(t.capDrop).toEqual(['ALL'])
      expect(t.capAdd).toEqual([])
      expect(t.securityOpt).toEqual(['no-new-privileges'])
      expect(t.readOnlyRoot).toBe(true)
      expect(t.network).toBe('lp-unit-live-preview-lp-1-net')
      expect(t.sysctls).toEqual({ 'net.ipv6.conf.all.disable_ipv6': '1', 'net.ipv6.conf.default.disable_ipv6': '1' })
      const args = createArgs(t)
      expect(args).not.toContain('--add-host')
      expect(args).not.toContain('--privileged')
      expect(args).not.toContain('-p')
      expect(args).toContain('--read-only')
    })

    it('refuses a mount path that could add options of its own', () => {
      expect(() => mountArg({ source: '/a,readonly=false', target: '/b', readOnly: false })).toThrow()
      expect(() => mountArg({ source: 'relative', target: '/b', readOnly: false })).toThrow()
    })

    it('finds nothing to differ in a container made from it', () => {
      expect(templateDifferences(t, inspectOf(t), IMAGE)).toEqual([])
    })

    it.each([
      ['a Docker socket bound in', (i: Inspect) => i.Mounts.push({ Type: 'bind', Source: '/var/run/docker.sock', Destination: '/var/run/docker.sock', RW: true, Propagation: 'rprivate' }), 'mounts'],
      ['the workspace folder bound in', (i: Inspect) => i.Mounts.push({ Type: 'bind', Source: '/site/projects/pr1/workspaces/w1', Destination: '/w', RW: false, Propagation: 'rprivate' }), 'mounts'],
      ['a capability added', (i: Inspect) => { i.HostConfig.CapAdd = ['NET_RAW'] }, 'capabilities'],
      ['privileged', (i: Inspect) => { i.HostConfig.Privileged = true }, 'capabilities'],
      ['on another network', (i: Inspect) => { i.NetworkSettings.Networks.bridge = {} }, 'network'],
      ['a published port', (i: Inspect) => { i.HostConfig.PortBindings = { '80/tcp': [{ HostPort: '80' }] } }, 'network'],
      ['an extra host', (i: Inspect) => { i.HostConfig.ExtraHosts = ['host.docker.internal:host-gateway'] }, 'network'],
      ['IPv6 on', (i: Inspect) => { i.HostConfig.Sysctls = {} }, 'sysctls'],
      ['the machine\'s processes', (i: Inspect) => { i.HostConfig.PidMode = 'host' }, 'namespaces'],
      ['a writable root', (i: Inspect) => { i.HostConfig.ReadonlyRootfs = false }, 'readOnlyRoot'],
    ])('finds %s', (_what, change, field) => {
      const i = inspectOf(t)
      change(i)
      expect(templateDifferences(t, i, IMAGE)).toContain(field)
    })

    it('finds another image', () => {
      expect(templateDifferences(t, inspectOf(t), `sha256:${'b'.repeat(64)}`)).toContain('image')
    })
  })
})
