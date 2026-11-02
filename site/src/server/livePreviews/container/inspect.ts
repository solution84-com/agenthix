/**
 * Whether a container is what its live preview's template says (the guard's *offTemplate*): what `docker inspect`
 * reports, field by field, against the template it was made from. Anything the template does not state is held to
 * Docker's defaults for a container made with it: no extra mount, device, port, privilege, namespace, host, resolver
 * or label of the site's own. Pure, and fails closed: a field missing or of the wrong shape is a difference.
 */
import { siteNamespace } from '../../../agents/runtime/containerLabels'
import { sysctlsMatch } from '../../../agents/runtime/ipv6Off'
import type { LivePreviewTemplate } from './template'

type Json = Record<string, unknown>

const obj = (v: unknown): Json | null => (typeof v === 'object' && v !== null && !Array.isArray(v) ? v as Json : null)
const list = (v: unknown): unknown[] | null => (v === null || v === undefined ? [] : Array.isArray(v) ? v : null)
const emptyish = (v: unknown): boolean =>
  v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0) || (obj(v) !== null && Object.keys(v as Json).length === 0)

function sameSet(actual: unknown, expected: string[]): boolean {
  const a = list(actual)
  if (!a || a.some(x => typeof x !== 'string')) return false
  const s = new Set(a as string[])
  return s.size === new Set(expected).size && expected.every(e => s.has(e))
}

function sameList(actual: unknown, expected: string[]): boolean {
  const a = list(actual)
  return !!a && a.length === expected.length && a.every((x, i) => x === expected[i])
}

/** On its own network, and on no other but those its template allows. */
export function onNetworks(actual: string[], t: Pick<LivePreviewTemplate, 'network' | 'extraNetworks'>): boolean {
  const allowed = new Set([t.network, ...(t.extraNetworks ?? [])])
  return actual.includes(t.network) && actual.every(n => allowed.has(n))
}

function mountsMatch(actual: unknown, t: LivePreviewTemplate): boolean {
  const a = list(actual)
  if (!a || a.length !== t.mounts.length) return false
  const key = (type: unknown, src: unknown, dst: unknown, rw: unknown) => JSON.stringify([type, src, dst, rw])
  const want = new Set(t.mounts.map(m => key('bind', m.source, m.target, !m.readOnly)))
  return a.every(m => {
    const o = obj(m)
    return !!o && want.has(key(o.Type, o.Source, o.Destination, o.RW)) && (o.Propagation === 'rprivate' || o.Propagation === '')
  })
}

function labelsMatch(actual: unknown, t: LivePreviewTemplate): boolean {
  const labels = obj(actual)
  if (!labels) return false
  if (Object.entries(t.labels).some(([k, v]) => labels[k] !== v)) return false
  const own = `${siteNamespace()}.`
  return Object.keys(labels).every(k => !k.startsWith(own) || k in t.labels)
}

/** The fields of `inspect` (one element of `docker inspect`'s answer) that differ from `t`; `imageId` is what it ran. */
export function templateDifferences(t: LivePreviewTemplate, inspect: unknown, imageId: string): string[] {
  const top = obj(inspect)
  const config = obj(top?.Config)
  const host = obj(top?.HostConfig)
  if (!top || !config || !host) return ['inspect']
  const networks = obj(obj(top.NetworkSettings)?.Networks)
  const log = obj(host.LogConfig)
  const tmpfs = obj(host.Tmpfs)
  const checks: [string, boolean][] = [
    ['name', top.Name === `/${t.name}`],
    ['image', typeof top.Image === 'string' && top.Image === imageId],
    ['user', config.User === t.user],
    ['command', sameList(config.Cmd, t.command) && (emptyish(config.Entrypoint) || sameList(config.Entrypoint, ['']))],
    ['labels', labelsMatch(config.Labels, t)],
    ['mounts', mountsMatch(top.Mounts, t) && emptyish(host.Binds) && emptyish(host.VolumesFrom)],
    ['tmpfs', !!tmpfs && sameSet(Object.keys(tmpfs), Object.keys(t.tmpfs)) && Object.entries(t.tmpfs).every(([p, o]) => tmpfs[p] === o)],
    ['capabilities', sameSet(host.CapAdd, t.capAdd) && sameSet(host.CapDrop, t.capDrop) && host.Privileged === false],
    ['securityOpt', sameSet(host.SecurityOpt, t.securityOpt)],
    ['readOnlyRoot', host.ReadonlyRootfs === t.readOnlyRoot],
    ['network', host.NetworkMode === t.network && !!networks && onNetworks(Object.keys(networks), t)
      && emptyish(host.PortBindings) && host.PublishAllPorts === false && emptyish(host.ExtraHosts) && emptyish(host.Dns)],
    ['namespaces', emptyish(host.PidMode) && host.IpcMode === 'private' && emptyish(host.UsernsMode) && emptyish(host.UTSMode)],
    ['devices', emptyish(host.Devices) && emptyish(host.DeviceRequests) && emptyish(host.DeviceCgroupRules)],
    ['init', host.Init === true],
    ['budget', host.Memory === t.budget.memoryBytes && host.MemorySwap === t.budget.memoryBytes
      && host.NanoCpus === Math.round(t.budget.cpus * 1e9) && host.PidsLimit === t.budget.pids],
    ['logs', !!log && log.Type === 'local'],
    ['sysctls', sysctlsMatch(host.Sysctls, t.sysctls)],
  ]
  return checks.filter(([, ok]) => !ok).map(([field]) => field)
}
