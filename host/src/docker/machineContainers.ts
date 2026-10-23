/**
 * Every container on the machine as the port check reads it (one port plan, Rule 4): its name, its labels — which
 * say which installation it is and the ports that installation publishes — whether it runs, and the ports Docker has
 * published for it now. Read with `docker inspect`, whose labels are a map: `docker ps` joins them with commas, which
 * a ports label holds too.
 */

export type PublishedPort = { ip: string; port: number }

export type MachineContainer = {
  name: string
  labels: Record<string, string>
  running: boolean
  /** The machine's ports Docker publishes for it; none while it is not running. */
  published: PublishedPort[]
}

/** The format `inspect` prints each container in: one line of JSON values, separated by tabs. */
export const CONTAINER_FORMAT = '{{json .Name}}\t{{json .Config.Labels}}\t{{json .State.Running}}\t{{json .NetworkSettings.Ports}}'

type Bindings = Record<string, { HostIp?: unknown; HostPort?: unknown }[] | null> | null

function publishedOf(ports: Bindings): PublishedPort[] {
  const out: PublishedPort[] = []
  for (const bindings of Object.values(ports ?? {})) {
    for (const b of bindings ?? []) {
      const port = Number(b.HostPort)
      if (Number.isInteger(port) && port > 0) out.push({ ip: typeof b.HostIp === 'string' ? b.HostIp : '', port })
    }
  }
  return out
}

/** `inspect --format CONTAINER_FORMAT` read back; a line that is not one is left out. */
export function parseContainerInspect(out: string): MachineContainer[] {
  return out.split('\n').flatMap(line => {
    const fields = line.trim().split('\t')
    if (fields.length !== 4) return []
    try {
      const [name, labels, running, ports] = fields.map(f => JSON.parse(f) as unknown)
      if (typeof name !== 'string') return []
      const labelMap: Record<string, string> = {}
      for (const [k, v] of Object.entries((labels ?? {}) as Record<string, unknown>)) if (typeof v === 'string') labelMap[k] = v
      return [{ name: name.replace(/^\//, ''), labels: labelMap, running: running === true, published: publishedOf(ports as Bindings) }]
    } catch {
      return []
    }
  })
}
