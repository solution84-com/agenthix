/** A service container as `docker inspect` says it is set up, read field by field for the guard's look. */
export type ServiceInspected = {
  id: string
  name: string
  image: string
  labels: Record<string, string>
  user: string
  mounts: { source: string; target: string; readOnly: boolean; type: string; name?: string }[]
  networks: string[]
  networkMode: string
  readOnlyRoot: boolean
  capAdd: string[]
  capDrop: string[]
  securityOpt: string[]
  sysctls: Record<string, string> | null
  privileged: boolean
  devices: number
  pidMode: string
  ipcMode: string
  memoryBytes: number
  nanoCpus: number
  pidsLimit: number
}

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {})
const str = (v: unknown): string => (typeof v === 'string' ? v : '')
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
const strs = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])

function sysctlsOf(v: unknown): Record<string, string> | null {
  if (v === null || v === undefined) return {}
  if (typeof v !== 'object' || Array.isArray(v)) return null
  const entries = Object.entries(v as Record<string, unknown>)
  return entries.every(([, x]) => typeof x === 'string') ? Object.fromEntries(entries) as Record<string, string> : null
}

export function readServiceInspected(raw: unknown): ServiceInspected | null {
  const c = obj(raw)
  const id = str(c.Id)
  if (!id) return null
  const config = obj(c.Config)
  const host = obj(c.HostConfig)
  const labels: Record<string, string> = {}
  for (const [k, v] of Object.entries(obj(config.Labels))) if (typeof v === 'string') labels[k] = v
  return {
    id,
    name: str(c.Name).replace(/^\//, ''),
    image: str(c.Image),
    labels,
    user: str(config.User),
    mounts: (Array.isArray(c.Mounts) ? c.Mounts : []).map(obj).map(m => ({
      source: str(m.Source), target: str(m.Destination), readOnly: m.RW === false, type: str(m.Type), name: str(m.Name),
    })),
    networks: Object.keys(obj(obj(c.NetworkSettings).Networks)).sort(),
    networkMode: str(host.NetworkMode),
    readOnlyRoot: host.ReadonlyRootfs === true,
    capAdd: strs(host.CapAdd),
    capDrop: strs(host.CapDrop),
    securityOpt: strs(host.SecurityOpt),
    sysctls: sysctlsOf(host.Sysctls),
    privileged: host.Privileged === true,
    devices: (Array.isArray(host.Devices) ? host.Devices.length : 0) + (Array.isArray(host.DeviceRequests) ? host.DeviceRequests.length : 0),
    pidMode: str(host.PidMode),
    ipcMode: str(host.IpcMode),
    memoryBytes: num(host.Memory),
    nanoCpus: num(host.NanoCpus),
    pidsLimit: num(host.PidsLimit),
  }
}
