/**
 * One network per agent container, whose only other member is the site
 * (ADR-0066). Containers on a shared network can reach each other, and a
 * container is bound to one storage boundary (ADR-0057) — so anything an agent
 * starts that listens on every address would otherwise be reachable from a run
 * in another boundary. Traffic only ever goes from an agent to the site; the
 * site reaches a preview through `docker exec`, never over the network.
 *
 * Docker's default address pools run out after a few dozen networks, so each
 * network is given a /29 from AGENT_NETWORK_RANGE instead: three members
 * (gateway, site, container) fit with room to spare.
 *
 * A network is created with its container and swept once its container is
 * gone, rather than removed at every place a container is removed — there are
 * five of those, and a sweep that runs at boot and every minute cannot miss
 * one. `pending` covers the gap between creating a network and `docker run`
 * attaching a container to it, when the sweep would otherwise see an empty
 * network and take it.
 */
import { LIVE_PREVIEW_PART_BITS, livePreviewPartOf } from '@agenthix/core'
import { docker, dockerWithin, DOCKER_SWEEP_TIMEOUT_MS } from './containerLifecycle'
import { labelKey, resolveComposeProjectName, siteIdFilterArgs, siteIdLabelArgs } from './containerLabels'
import { Logger } from '../../server/utils/logger'

const logger = new Logger('containerNetwork')

/** The label every agent network carries, `<namespace>.network=agent`, that the sweep finds them by. */
export const agentNetworkLabel = () => labelKey('network')
const DEFAULT_RANGE = '10.213.0.0/16'
const BLOCK_BITS = 29
const BLOCK_SIZE = 2 ** (32 - BLOCK_BITS)
const CREATE_ATTEMPTS = 8

const pending = new Set<string>()
let queue: Promise<unknown> = Promise.resolve()

export function agentNetworkName(containerName: string): string {
  return `${containerName}-net`
}

function parseRange(range: string): { base: number; bits: number } {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\/(\d{1,2})$/.exec(range.trim())
  const octets = m ? m.slice(1, 5).map(Number) : []
  const bits = m ? Number(m[5]) : NaN
  if (!m || octets.some(o => o > 255) || bits > 32) {
    throw new Error(`AGENT_NETWORK_RANGE is not an IPv4 range like 10.213.0.0/16: "${range}"`)
  }
  if (bits > BLOCK_BITS) {
    throw new Error(`AGENT_NETWORK_RANGE ${range} is smaller than one /${BLOCK_BITS}; give it at least /${BLOCK_BITS}`)
  }
  const base = ((octets[0] << 24) >>> 0) + (octets[1] << 16) + (octets[2] << 8) + octets[3]
  return { base, bits }
}

function toAddress(n: number): string {
  return [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.')
}

/**
 * Which part of the agents' range a network is made in: an agent's anywhere but the live-preview part, a live
 * preview's only there (`livePreviewPartOf`, where the host service closes the range off from private addresses).
 */
export type NetworkPart = 'agents' | 'livePreview'

export function agentRange(): string {
  return process.env.AGENT_NETWORK_RANGE || DEFAULT_RANGE
}

/**
 * The live-preview part of `range`: its upper /LIVE_PREVIEW_PART_BITS, only when the range is larger than that, so
 * agents keep the rest. Null when there is none, and then no live preview runs here.
 */
export function livePreviewPart(range: string = agentRange()): string | null {
  const { bits } = parseRange(range)
  return bits < LIVE_PREVIEW_PART_BITS ? livePreviewPartOf(range) : null
}

export function allocateSubnet(used: Set<string>, range: string = agentRange(), part: NetworkPart = 'agents'): string {
  const { base, bits } = parseRange(range)
  const lp = livePreviewPart(range)
  if (part === 'livePreview') {
    if (!lp) throw new Error(`AGENT_NETWORK_RANGE ${range} is too small to have a part for live previews`)
    const p = parseRange(lp)
    for (let i = 0; i < 2 ** (BLOCK_BITS - p.bits); i++) {
      const subnet = `${toAddress(p.base + i * BLOCK_SIZE)}/${BLOCK_BITS}`
      if (!used.has(subnet)) return subnet
    }
    throw new Error(`AGENT_NETWORK_RANGE ${range} has no free /${BLOCK_BITS} left for another live preview`)
  }
  const blocks = 2 ** (BLOCK_BITS - bits)
  const lpStart = lp ? parseRange(lp).base : Infinity
  for (let i = 0; i < blocks; i++) {
    const start = base + i * BLOCK_SIZE
    if (start >= lpStart) break
    const subnet = `${toAddress(start)}/${BLOCK_BITS}`
    if (!used.has(subnet)) return subnet
  }
  throw new Error(`AGENT_NETWORK_RANGE ${range} has no free /${BLOCK_BITS} left for another agent container`)
}

async function subnetsInUse(): Promise<Set<string>> {
  const { stdout } = await docker(['network', 'ls', '-q'])
  const ids = stdout.split('\n').map(s => s.trim()).filter(Boolean)
  if (ids.length === 0) return new Set()
  const out = await docker(['network', 'inspect', '--format', '{{range .IPAM.Config}}{{.Subnet}} {{end}}', ...ids])
  return new Set(out.stdout.split(/\s+/).filter(Boolean))
}

async function create(name: string, part: NetworkPart): Promise<void> {
  const used = await subnetsInUse()
  for (let attempt = 1; ; attempt++) {
    const subnet = allocateSubnet(used, agentRange(), part)
    try {
      await docker([
        'network', 'create', '--driver', 'bridge', '--subnet', subnet,
        // IPv4 only, even where the daemon's default-network-opts turn IPv6 on: the host service's agent
        // protections match the agents' IPv4 range, and an IPv6 address would be outside them.
        '--ipv6=false',
        '--label', `${agentNetworkLabel()}=agent`,
        '--label', `com.docker.compose.project=${resolveComposeProjectName()}`,
        ...siteIdLabelArgs(),
        name,
      ])
      return
    } catch (err) {
      // Another network on the machine — not necessarily ours — holds this block.
      if (!/overlap/i.test(String(err)) || attempt >= CREATE_ATTEMPTS) throw err
      used.add(subnet)
    }
  }
}

/**
 * The site joins an agent network below its own in gateway priority: Docker otherwise may make the agent network's
 * gateway the site's default route, and the site's own connections out (to HQ at its public address) would leave from
 * an agent address, where the agents' protections drop them. This holds on any machine whose agent rules drop the
 * site's own way out. An engine older than gateway priorities is connected without one.
 */
async function connectSite(network: string, self: string): Promise<void> {
  const tolerated = (err: unknown) => {
    if (!/already exists|already attached/i.test(String(err))) throw err
  }
  await docker(['network', 'connect', '--gw-priority', '-1', network, self]).catch(async err => {
    if (!/gw-priority|unknown flag/i.test(String(err))) return tolerated(err)
    await docker(['network', 'connect', network, self]).catch(tolerated)
  })
}

async function ensure(containerName: string, part: NetworkPart): Promise<string> {
  const name = agentNetworkName(containerName)
  pending.add(containerName)
  // A caller whose `ensureAgentNetwork` rejects never reaches `_start`'s
  // try/finally, so it never calls `releaseAgentNetwork` itself — that mark
  // would otherwise sit in `pending` for the life of the process, and
  // `sweepAgentNetworks` would skip this network forever even though nothing
  // is left pending to attach to it.
  try {
    const exists = await docker(['network', 'inspect', name]).then(() => true, () => false)
    if (!exists) await create(name, part)
    const self = process.env.SITE_CONTAINER_NAME
    if (self) {
      await connectSite(name, self)
    }
    return name
  } catch (err) {
    pending.delete(containerName)
    throw err
  }
}

function serialised<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn)
  queue = run.catch(() => {})
  return run
}

/** Serialised, so two containers starting together cannot pick the same block. */
export function ensureAgentNetwork(containerName: string, part: NetworkPart = 'agents'): Promise<string> {
  return serialised(() => ensure(containerName, part))
}

export function releaseAgentNetwork(containerName: string): void {
  pending.delete(containerName)
}

/**
 * On the same queue as `ensureAgentNetwork`, so a sweep never runs between an
 * ensure creating or connecting a network and it marking that network pending.
 */
export function sweepAgentNetworks(): Promise<number> {
  return serialised(sweep)
}

async function sweep(): Promise<number> {
  const { stdout } = await dockerWithin([
    'network', 'ls',
    '--filter', `label=${agentNetworkLabel()}=agent`,
    '--filter', `label=com.docker.compose.project=${resolveComposeProjectName()}`,
    ...siteIdFilterArgs(),
    '--format', '{{.Name}}',
  ], DOCKER_SWEEP_TIMEOUT_MS)
  let removed = 0
  for (const name of stdout.split('\n').map(s => s.trim()).filter(Boolean)) {
    const containerName = name.replace(/-net$/, '')
    if (pending.has(containerName)) continue
    const alive = await dockerWithin(['container', 'inspect', containerName], DOCKER_SWEEP_TIMEOUT_MS).then(() => true, () => false)
    if (alive || pending.has(containerName)) continue
    const self = process.env.SITE_CONTAINER_NAME
    if (self) {
      await dockerWithin(['network', 'disconnect', '--force', name, self], DOCKER_SWEEP_TIMEOUT_MS).catch(err => {
        if (/is not connected/i.test(String(err))) return
        logger.warn(`could not disconnect ${self} from ${name}: ${String(err)}`)
      })
    }
    const ok = await dockerWithin(['network', 'rm', name], DOCKER_SWEEP_TIMEOUT_MS).then(() => true, err => {
      logger.warn(`could not remove ${name}: ${String(err)}`)
      return false
    })
    if (ok) removed++
  }
  return removed
}

function overlaps(a: { base: number; bits: number }, b: { base: number; bits: number }): boolean {
  const aEnd = a.base + 2 ** (32 - a.bits), bEnd = b.base + 2 ** (32 - b.bits)
  return a.base < bEnd && b.base < aEnd
}

/**
 * An internal network (no way out) of a /`bits` in the live-preview part of the agents' range: a live preview's
 * services' network, which its own container joins. Serialised with the agents' networks, so no two pick one block.
 */
export function createInternalPreviewNetwork(name: string, bits: number, labels: Record<string, string>): Promise<string> {
  return serialised(async () => {
    const lp = livePreviewPart()
    if (!lp) throw new Error(`AGENT_NETWORK_RANGE ${agentRange()} is too small to have a part for live previews`)
    const part = parseRange(lp)
    if (bits < part.bits || bits > 30) throw new Error(`A /${bits} does not fit the part for live previews`)
    const taken = [...await subnetsInUse()].flatMap(s => { try { return [parseRange(s)] } catch { return [] } })
    for (let attempt = 1; attempt <= CREATE_ATTEMPTS; attempt++) {
      let subnet: string | null = null
      for (let i = 0; i < 2 ** (bits - part.bits); i++) {
        const block = { base: part.base + i * 2 ** (32 - bits), bits }
        if (!taken.some(t => overlaps(t, block))) { subnet = `${toAddress(block.base)}/${bits}`; break }
      }
      if (!subnet) throw new Error(`The part for live previews has no free /${bits} left`)
      try {
        await docker([
          'network', 'create', '--driver', 'bridge', '--internal', '--subnet', subnet, '--ipv6=false',
          ...Object.entries(labels).flatMap(([k, v]) => ['--label', `${k}=${v}`]), name,
        ])
        return subnet
      } catch (err) {
        if (!/overlap/i.test(String(err))) throw err
        taken.push(parseRange(subnet))
      }
    }
    throw new Error(`Could not make the network ${name}: every block tried was taken`)
  })
}

/** True when every one of `subnets` lies inside the agents' range, and there is at least one. */
export function insideAgentRange(subnets: string[], range: string = agentRange()): boolean {
  const r = parseRange(range)
  return subnets.length > 0 && subnets.every(s => {
    try {
      const c = parseRange(s)
      return c.bits >= r.bits && overlaps(c, r)
    } catch {
      return false
    }
  })
}
