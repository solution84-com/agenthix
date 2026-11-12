/**
 * Another installation's HQ behind this one's front door. Only one front door can hold ports 80 and 443 on a machine,
 * so on a machine that carries two installations (ADR-0108's testing configuration; a demo beside another HQ,
 * adr-0186) the one whose front door runs serves the other's addresses too: `front-door add-installation <namespace>`.
 *
 * What it serves is read from the other installation's own hq-web — the addresses its host service gave it — never
 * from the person, and only from a container that host service labelled as its own. The front door joins that
 * installation's edge network, which holds only its hq-web, and reaches it by its container name. A demo's files host
 * gets every file as a download, as hq's relay already sends it (the live demo spec's *Deployment*).
 */
import { SERVICE_PORTS } from '@agenthix/core'
import type { Context } from '../service/context'
import { Refusal } from '../owner/results'
import { namesFor, VALID_NAMESPACE } from '../state/namespace'
import { hostNameProblem, hostOf } from './config'

/** Another installation's HQ, as its front door serves it. */
export type Neighbour = {
  namespace: string
  /** HQ's host, then its files host when it has one. */
  hosts: string[]
  filesHost: string | null
  /** A demo's files host serves every file as a download. */
  demo: boolean
  /** Its hq-web, by container name and port, on its edge network. */
  upstream: string
  edgeNetwork: string
}

/** The response headers that make every answer on a demo's files host a download the browser never draws. */
export const DOWNLOAD_ONLY_HEADERS = [
  '?Content-Disposition attachment',
  'Content-Disposition inline attachment',
  'X-Content-Type-Options nosniff',
  'defer',
] as const

const refuse = (message: string): never => {
  throw new Refusal('conflict', `${message} Nothing changed.`)
}

/** The installation `namespace` on this machine, read from its hq-web; refused in words when it cannot be served here. */
export async function findNeighbour(ctx: Context, namespace: string, ownHosts: string[]): Promise<Neighbour> {
  if (!VALID_NAMESPACE.test(namespace)) refuse(`"${namespace}" is not an installation's namespace.`)
  if (namespace === ctx.names.namespace) refuse('That is this installation: its front door already serves it.')
  const names = namesFor(namespace)
  const hqWeb = names.container('hq-web')
  const found = (await ctx.docker.machineContainers()).find(c => c.name === hqWeb)
  if (!found || found.labels[names.label('managed-by')] !== 'host') {
    refuse(`No installation ${namespace} runs HQ on ${ctx.machine.name}: there is no container ${hqWeb} its host service started.`)
  }
  const env = await ctx.docker.containerEnv(hqWeb)
  const address = env?.HQ_URL ?? ''
  if (!address.startsWith('https://')) refuse(`The installation ${namespace}'s HQ is not at an https address, so the front door cannot serve it.`)
  const host = hostOf(address)
  const filesHost = env?.FILES_ORIGIN ? hostOf(env.FILES_ORIGIN) : null
  const hosts = filesHost ? [host, filesHost] : [host]
  for (const h of hosts) {
    const problem = hostNameProblem(h)
    if (problem) refuse(`The installation ${namespace}'s ${h} cannot have a certificate: ${problem}.`)
    if (ownHosts.includes(h)) refuse(`${h} is this installation's own; two installations cannot share an address.`)
  }
  return {
    namespace, hosts, filesHost, demo: found!.labels[names.label('demo')] === 'true',
    upstream: `${hqWeb}:${SERVICE_PORTS.hq.web}`, edgeNetwork: names.edgeNetwork,
  }
}

/** Every installation the front door serves beside this one's, each read afresh. */
export async function findNeighbours(ctx: Context, namespaces: readonly string[], ownHosts: string[]): Promise<Neighbour[]> {
  const found: Neighbour[] = []
  for (const ns of namespaces) {
    const n = await findNeighbour(ctx, ns, [...ownHosts, ...found.flatMap(f => f.hosts)])
    found.push(n)
  }
  return found
}

/** The Caddyfile lines that make answers on `filesHost` downloads only, inside a block that serves it among other hosts. */
export function downloadOnlyLines(filesHost: string): string[] {
  return [
    `\t@files host ${filesHost}`,
    '\theader @files {',
    ...DOWNLOAD_ONLY_HEADERS.map(h => `\t\t${h}`),
    '\t}',
  ]
}

/** The Caddyfile block for another installation's HQ and its files host. */
export function neighbourBlock(n: Neighbour): string[] {
  return [
    `# The installation ${n.namespace}, served here (front-door add-installation).`,
    `${n.hosts.join(', ')} {`,
    ...(n.demo && n.filesHost ? downloadOnlyLines(n.filesHost) : []),
    `\treverse_proxy ${n.upstream}`,
    '}',
    '',
  ]
}
