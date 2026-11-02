/**
 * Whether a service container is what its template says (spec part 4; S33, X7). `createdDifferences` reads the whole
 * of `docker inspect` before the container starts, and the site removes it unstarted on any difference;
 * `runningDifferences` is the guard's look while it runs, over what the guard reads of every live preview container. Both are
 * pure and fail closed: a field missing or of the wrong shape is a difference.
 */
import type { ServiceInspected as InspectedContainer } from './serviceInspected'
import { siteNamespace } from '../../../agents/runtime/containerLabels'
import { healthShellCommand, type ServiceTemplate } from './serviceTemplate'
import { sysctlsMatch } from '../../../agents/runtime/ipv6Off'

type Json = Record<string, unknown>
const obj = (v: unknown): Json | null => (typeof v === 'object' && v !== null && !Array.isArray(v) ? v as Json : null)
const list = (v: unknown): unknown[] | null => (v === null || v === undefined ? [] : Array.isArray(v) ? v : null)
const emptyish = (v: unknown): boolean => v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0)
  || (obj(v) !== null && Object.keys(v as Json).length === 0)

function sameSet(actual: unknown, expected: string[]): boolean {
  const a = list(actual)
  if (!a || a.some(x => typeof x !== 'string')) return false
  const s = new Set(a as string[])
  return s.size === new Set(expected).size && expected.every(e => s.has(e))
}

function sameList(actual: unknown, expected: string[] | null): boolean {
  const a = list(actual)
  const e = expected ?? []
  return !!a && a.length === e.length && a.every((x, i) => x === e[i])
}

function labelsMatch(actual: unknown, t: ServiceTemplate): boolean {
  const labels = obj(actual)
  if (!labels || Object.entries(t.labels).some(([k, v]) => labels[k] !== v)) return false
  const own = `${siteNamespace()}.`
  return Object.keys(labels).every(k => !k.startsWith(own) || k in t.labels)
}

function mountsMatch(actual: unknown, t: ServiceTemplate): boolean {
  const a = list(actual)
  if (!a) return false
  if (!t.volume) return a.length === 0
  const m = obj(a[0])
  return a.length === 1 && !!m && m.Type === 'volume' && m.Name === t.volume.name && m.Destination === t.volume.target
    && m.RW === !t.volume.readOnly && (m.Driver === 'local' || m.Driver === undefined)
}

function healthMatches(actual: unknown, t: ServiceTemplate): boolean {
  const h = obj(actual)
  if (t.healthcheck) {
    const ns = (ms: number) => (ms > 0 ? ms * 1e6 : 0)
    return !!h && sameList(h.Test, ['CMD-SHELL', healthShellCommand(t.healthcheck.test)])
      && (h.Interval ?? 0) === ns(t.healthcheck.intervalMs) && (h.Timeout ?? 0) === ns(t.healthcheck.timeoutMs)
      && (h.StartPeriod ?? 0) === ns(t.healthcheck.startPeriodMs) && (h.Retries ?? 0) === t.healthcheck.retries
  }
  return t.imageHealthcheck ? !!h && sameList(h.Test, t.imageHealthcheck) : emptyish(h)
}

/** The fields of one element of `docker inspect`'s answer that differ from `t`, before the container starts. */
export function createdDifferences(t: ServiceTemplate, inspect: unknown): string[] {
  const top = obj(inspect)
  const config = obj(top?.Config)
  const host = obj(top?.HostConfig)
  if (!top || !config || !host) return ['inspect']
  const networks = obj(obj(top.NetworkSettings)?.Networks)
  const log = obj(host.LogConfig)
  const restart = obj(host.RestartPolicy)
  const tmpfs = obj(host.Tmpfs)
  const checks: [string, boolean][] = [
    ['name', top.Name === `/${t.name}`],
    ['image', top.Image === t.image && config.Image === t.image],
    ['user', config.User === t.user],
    ['command', sameList(config.Cmd, t.cmd) && sameList(config.Entrypoint, t.entrypoint)],
    ['environment', sameSet(config.Env, t.env)],
    ['healthcheck', healthMatches(config.Healthcheck, t)],
    ['labels', labelsMatch(config.Labels, t)],
    ['mounts', mountsMatch(top.Mounts, t) && emptyish(host.Binds) && emptyish(host.VolumesFrom)],
    ['tmpfs', !!tmpfs && sameSet(Object.keys(tmpfs), Object.keys(t.tmpfs)) && Object.entries(t.tmpfs).every(([p, o]) => tmpfs[p] === o)],
    ['capabilities', sameSet(host.CapAdd, t.capAdd) && sameSet(host.CapDrop, ['ALL']) && host.Privileged === false],
    ['securityOpt', sameSet(host.SecurityOpt, ['no-new-privileges'])],
    ['readOnlyRoot', host.ReadonlyRootfs === true],
    ['network', host.NetworkMode === t.network && !!networks && sameSet(Object.keys(networks), [t.network])
      && emptyish(host.PortBindings) && host.PublishAllPorts === false && emptyish(host.ExtraHosts)
      && emptyish(host.Dns) && emptyish(host.Links)],
    ['namespaces', emptyish(host.PidMode) && host.IpcMode === 'private' && emptyish(host.UsernsMode) && emptyish(host.UTSMode) && emptyish(host.CgroupParent)],
    ['devices', emptyish(host.Devices) && emptyish(host.DeviceRequests) && emptyish(host.DeviceCgroupRules)],
    ['runtime', emptyish(host.Runtime) || host.Runtime === 'runc'],
    ['restart', !!restart && (restart.Name === 'no' || restart.Name === '')],
    ['budget', host.Memory === t.budget.memoryBytes && host.MemorySwap === t.budget.memoryBytes
      && host.NanoCpus === Math.round(t.budget.cpus * 1e9) && host.PidsLimit === t.budget.pids],
    ['logs', !!log && log.Type === 'local'],
    ['sysctls', sysctlsMatch(host.Sysctls, t.sysctls)],
  ]
  return checks.filter(([, ok]) => !ok).map(([field]) => field)
}

const capability = (c: string) => c.toUpperCase().replace(/^CAP_/, '')
const securityOption = (o: string) => o.replace(/[:=]true$/, '').trim().toLowerCase()

/** What the guard sees of a running service container that differs from `t`, in phrases a person reads. */
export function runningDifferences(t: ServiceTemplate, c: InspectedContainer): string[] {
  const out: string[] = []
  if (c.image !== t.image) out.push('it runs another image')
  if (Object.entries(t.labels).some(([k, v]) => c.labels[k] !== v)) out.push('its labels differ')
  if (c.user !== t.user) out.push(`it runs as ${c.user || 'root'}`)
  const mounts = c.mounts.filter(m => m.type !== 'tmpfs')
  const volumeOk = t.volume
    ? mounts.length === 1 && mounts[0].type === 'volume' && mounts[0].name === t.volume.name && mounts[0].target === t.volume.target
      && mounts[0].readOnly === t.volume.readOnly
    : mounts.length === 0
  if (!volumeOk) out.push('its folders differ from its template')
  if (c.networks.length !== 1 || c.networks[0] !== t.network || c.networkMode !== t.network) out.push('it is on another network')
  if (!c.readOnlyRoot) out.push('its root folder is writable')
  const added = c.capAdd.map(capability)
  if (added.length !== t.capAdd.length || t.capAdd.some(x => !added.includes(capability(x)))) out.push('it was given capabilities')
  if (c.capDrop.map(capability).join() !== 'ALL') out.push('its dropped capabilities differ')
  if (c.securityOpt.map(securityOption).join() !== 'no-new-privileges') out.push('its security options differ')
  if (c.sysctls === null || !sysctlsMatch(c.sysctls, t.sysctls)) out.push('its kernel settings differ: IPv6 must be off')
  if (c.privileged) out.push('it is privileged')
  if (c.devices > 0) out.push('it was given devices')
  if (c.pidMode === 'host') out.push("it sees the machine's processes")
  if (c.ipcMode !== 'private') out.push("it shares another's memory")
  if (c.memoryBytes !== t.budget.memoryBytes) out.push('its memory limit differs')
  if (Math.round(c.nanoCpus) !== Math.round(t.budget.cpus * 1e9)) out.push('its processor limit differs')
  if (c.pidsLimit !== t.budget.pids) out.push('its process limit differs')
  return out
}
