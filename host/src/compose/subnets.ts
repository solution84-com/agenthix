/**
 * The address range each network an install makes is given. Left to itself, Docker takes a network's subnet from
 * its default pool, and once 172.17–31 are used, from 192.168.0.0/20 onwards — where a home or office network
 * usually is, so HQ could no longer reach a model on another computer there. Every network the host service makes
 * is therefore given one /24 from a range of its own, beside the agents' (`AGENT_NETWORK_RANGE`).
 *
 * The choice keeps what Docker already has: a network of the install that exists keeps its subnet, so a rewritten
 * compose file (a restart, an upgrade, a front door, the Fleet Console added) never shows compose a changed
 * network. Docker is the record; nothing is kept in the state folder that could disagree with it. The rest take the
 * first /24s that overlap no Docker network and none of the machine's own addresses (the host service shares the
 * machine's network), always in the same order, so projects written before any is up agree with each other, and a
 * second install on the machine skips the first one's networks.
 */
import { networkInterfaces } from 'node:os'
import type { InstallNames } from '../state/namespace'
import { Refusal } from '../owner/results'

export const INSTALL_NETWORK_RANGE = '10.214.0.0/16'
const BLOCK_BITS = 24

/** The install's networks, in the order the free /24s are handed out. */
const NETWORKS = ['consoleNetwork', 'hqNetwork', 'siteNetwork', 'edgeNetwork', 'hqLinkNetwork'] as const

/** A network's subnet, by its name on the machine. */
export type InstallSubnets = Record<string, string>
export type DockerNetwork = { name: string; subnets: string[] }

/** Refused as any operation is, so whichever writer meets it says the same sentence. */
export class SubnetsExhausted extends Refusal {
  constructor(message: string) {
    super('failed', message)
  }
}

type Block = { base: number; bits: number }

function parse(cidr: string): Block | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\/(\d{1,2})$/.exec(cidr.trim())
  if (!m) return null
  const octets = m.slice(1, 5).map(Number)
  const bits = Number(m[5])
  if (octets.some(o => o > 255) || bits > 32) return null
  const address = ((octets[0] << 24) >>> 0) + (octets[1] << 16) + (octets[2] << 8) + octets[3]
  return { base: bits === 0 ? 0 : (address & (~0 << (32 - bits))) >>> 0, bits }
}

const size = (b: Block) => 2 ** (32 - b.bits)
const toAddress = (n: number) => [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.')

/** Whether two IPv4 ranges share an address; false when either is not one. */
export function overlaps(a: string, b: string): boolean {
  const x = parse(a)
  const y = parse(b)
  return !!x && !!y && x.base < y.base + size(y) && y.base < x.base + size(x)
}

/**
 * `existing`: every Docker network on the machine, with its subnets. `machine`: the machine's own addresses with
 * their prefixes (`machineAddresses`). Throws `SubnetsExhausted`, in words a person reads, when a network has none.
 */
export function chooseSubnets(names: InstallNames, existing: DockerNetwork[], machine: string[]): InstallSubnets {
  const range = parse(INSTALL_NETWORK_RANGE) as Block
  const ipv4 = (n: DockerNetwork) => n.subnets.filter(s => parse(s) !== null)
  const chosen: InstallSubnets = {}
  for (const key of NETWORKS) {
    const kept = ipv4(existing.find(n => n.name === names[key]) ?? { name: '', subnets: [] })[0]
    if (kept) chosen[names[key]] = kept
  }
  const taken = [...existing.flatMap(ipv4), ...machine.filter(s => parse(s) !== null)]
  for (const key of NETWORKS) {
    const name = names[key]
    if (chosen[name]) continue
    const free = findFree(range, [...taken, ...Object.values(chosen)])
    if (!free) {
      throw new SubnetsExhausted(
        `No address range is left for the network ${name}: other Docker networks or this machine's own addresses use ` +
        `all of ${INSTALL_NETWORK_RANGE}, which this install's networks are given. Remove the Docker networks ` +
        'you no longer need (see them with docker network ls, and remove one with docker network rm), then try again.',
      )
    }
    chosen[name] = free
  }
  return chosen
}

function findFree(range: Block, taken: string[]): string | null {
  const step = 2 ** (32 - BLOCK_BITS)
  for (let base = range.base; base < range.base + size(range); base += step) {
    const candidate = `${toAddress(base)}/${BLOCK_BITS}`
    if (!taken.some(t => overlaps(candidate, t))) return candidate
  }
  return null
}

/** The output of `docker network inspect --format '{{.Name}}\t{{range .IPAM.Config}}{{.Subnet}} {{end}}'`, IPv4 only. */
export function parseNetworkInspect(out: string): DockerNetwork[] {
  return out.split('\n').filter(line => line.trim()).map(line => {
    const [name, subnets = ''] = line.split('\t')
    return { name: name.trim(), subnets: subnets.split(/\s+/).filter(s => parse(s) !== null) }
  })
}

type Interfaces = Record<string, readonly { family: string | number; cidr: string | null }[] | undefined>

/** The machine's IPv4 addresses with their prefixes; the host service shares the machine's network. */
export function machineAddresses(interfaces: Interfaces = networkInterfaces()): string[] {
  return Object.values(interfaces).flatMap(list => list ?? [])
    .filter(i => (i.family === 'IPv4' || i.family === 4) && i.cidr !== null)
    .map(i => i.cidr as string)
}

/**
 * The subnets for the install's networks now: what Docker has, and the machine's own addresses. Every writer of a
 * compose file asks this just before writing it.
 */
export async function installSubnets(ctx: {
  docker: { networks(): Promise<DockerNetwork[]> }; names: InstallNames; machineAddresses?: () => string[]
}): Promise<InstallSubnets> {
  return chooseSubnets(ctx.names, await ctx.docker.networks(), (ctx.machineAddresses ?? machineAddresses)())
}

/** A compose network's `ipam`, fixing its subnet to the one chosen for it. */
export function ipam(subnets: InstallSubnets, name: string) {
  const subnet = subnets[name]
  if (!subnet) throw new Error(`No subnet was chosen for the network ${name}.`)
  return { ipam: { config: [{ subnet }] } }
}
