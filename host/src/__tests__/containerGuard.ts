/**
 * What every `*.container.test.ts` runs Docker through, so that a test can never touch what it did not make. Each
 * file takes a namespace of its own for the run (`testNamespace`), records it in the state folder of any host service
 * it starts, so that host service names everything from it, and runs each docker command through `guardedDocker`,
 * which refuses — before running it — a command that would create, stop, enter or remove anything whose name does
 * not carry that namespace. A machine's real install, whatever its namespace, is then out of a test's reach.
 *
 * Reads (`ps`, `inspect`, `logs`, `volume ls` …) pass whatever they name. A command the guard does not know is refused.
 */
import { execFileSync, type ExecFileSyncOptions } from 'node:child_process'
import fs from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import { DEFAULT_INSTALL_NAMESPACE } from '@agenthix/core'
import { Docker, dockerCli } from '../docker/docker'
import { tableFor } from '../protections/rules'
import { namesFor, type InstallNames } from '../state/namespace'

const VALID = /^[a-z][a-z0-9-]{0,30}$/

/** `hte<tag><pid>`: one per test file and run, so two runs, or two files, never share a name. */
export function testNamespace(tag: string): string {
  if (!/^[a-z]+$/.test(tag)) throw new Error(`"${tag}" must be lowercase letters.`)
  const ns = `hte${tag}${process.pid}`
  if (!VALID.test(ns) || ns.startsWith(DEFAULT_INSTALL_NAMESPACE)) throw new Error(`"${ns}" cannot be a test's namespace.`)
  return ns
}

/**
 * Every name the host service derives from `ns`, checked to carry it: what a test that starts a host service under
 * this namespace may touch. Database names and labels live inside its own containers, so they are not checked.
 */
export function claimNames(ns: string): InstallNames {
  const names = namesFor(ns)
  for (const [key, value] of Object.entries(names)) {
    if (typeof value !== 'string' || key === 'namespace' || key.endsWith('Database')) continue
    if (!owned(ns, value)) throw new Error(`The host service would name its ${key} "${value}", outside the test's namespace ${ns}.`)
  }
  return names
}

/** Records `ns` in a state folder before the host service's first start, so it names everything from it. */
export function recordNamespace(stateDir: string, ns: string): void {
  fs.writeFileSync(path.join(stateDir, 'namespace.json'), JSON.stringify({ namespace: ns, recordedAt: new Date().toISOString() }))
}

const owned = (ns: string, name: string) => name.startsWith(`${ns}-`)
const BUILT_IN_NETWORKS = new Set(['host', 'bridge', 'none'])
const READS = new Set(['ps', 'inspect', 'logs', 'port', 'info', 'version'])
const GROUP_READS = new Set(['ls', 'inspect'])
const GROUPS = new Set(['container', 'volume', 'network', 'image'])
/** The flags that take a value, per command: their value is not one of the command's operands. */
const VALUED: Record<string, ReadonlySet<string>> = {
  stop: new Set(['-t', '--time', '-s', '--signal']),
  exec: new Set(['-e', '--env', '--env-file', '-u', '--user', '-w', '--workdir']),
  'volume create': new Set(['-d', '--driver', '--label', '-o', '--opt']),
  'network create': new Set(['-d', '--driver', '--subnet', '--gateway', '--ip-range', '--label', '-o', '--opt', '--ipam-driver']),
  'network connect': new Set(['--alias', '--ip', '--ip6', '--link']),
}
const NONE: ReadonlySet<string> = new Set()

function operands(args: readonly string[], valued: ReadonlySet<string> = NONE): string[] {
  const out: string[] = []
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!
    if (a.startsWith('-')) {
      if (valued.has(a)) i++
      continue
    }
    out.push(a)
  }
  return out
}

function each(ns: string, what: string, names: readonly string[]): string | null {
  const outside = names.filter(n => !owned(ns, n))
  return outside.length ? `would ${what} ${outside.join(', ')}, outside the test's namespace ${ns}` : null
}

function valueOf(args: readonly string[], flag: string): string[] {
  const found: string[] = []
  args.forEach((a, i) => {
    if (a === flag && args[i + 1] !== undefined) found.push(args[i + 1]!)
    else if (a.startsWith(`${flag}=`)) found.push(a.slice(flag.length + 1))
  })
  return found
}

/** A firewall table deleted anywhere in the command (`nft delete table inet <name>`) must be the namespace's own. */
function nftRefusal(ns: string, args: readonly string[]): string | null {
  const at = args.findIndex((a, i) => a === 'delete' && args[i + 1] === 'table')
  if (at < 0) return null
  const table = args[at + 3]
  return table === tableFor(ns) ? null : `would delete the firewall table ${table ?? '(none named)'}, not the test's own ${tableFor(ns)}`
}

function runRefusal(ns: string, args: readonly string[]): string | null {
  const volumes = [...valueOf(args, '-v'), ...valueOf(args, '--volume')].map(v => v.split(':')[0]!).filter(v => !v.startsWith('/'))
  const mounts = [...valueOf(args, '--mount')].flatMap(m => m.split(',').filter(p => /^(src|source)=/.test(p)).map(p => p.split('=')[1]!))
    .filter(v => !v.startsWith('/'))
  const networks = valueOf(args, '--network').filter(n => !BUILT_IN_NETWORKS.has(n))
  return each(ns, 'name the container', valueOf(args, '--name'))
    ?? each(ns, 'mount the volume', [...volumes, ...mounts])
    ?? each(ns, 'join the network', networks)
    ?? nftRefusal(ns, args)
}

function execRefusal(ns: string, args: readonly string[]): string | null {
  let i = 0
  while (i < args.length && args[i]!.startsWith('-')) i += VALUED.exec!.has(args[i]!) ? 2 : 1
  const target = args[i]
  if (target === undefined) return 'names no container to run in'
  const into = each(ns, 'run a command in', [target])
  if (into) return into
  const rest = args.slice(i + 1)
  if (rest[0] === 'docker') return refusal(ns, rest.slice(1))
  return nftRefusal(ns, rest)
}

/** Why `docker <args>` must not run in a test under `ns`, or null when it may. */
export function refusal(ns: string, args: readonly string[]): string | null {
  const [command, sub, ...rest] = args
  if (command === undefined) return 'is no command'
  if (READS.has(command)) return null
  if (GROUPS.has(command)) {
    if (sub === undefined) return `docker ${command} names no action`
    if (GROUP_READS.has(sub)) return null
    if (sub === 'prune') return `would clear every unused ${command} on the machine`
    if (command === 'container' && sub === 'rm') return each(ns, 'remove', operands(rest))
    if (command === 'container' && sub === 'stop') return each(ns, 'stop', operands(rest, VALUED.stop))
    if (command === 'image' && sub === 'rm') return each(ns, 'remove the image', operands(rest))
    if (command === 'volume' && (sub === 'create' || sub === 'rm')) return each(ns, `${sub === 'rm' ? 'remove' : 'create'} the volume`, operands(rest, VALUED[`volume ${sub}`]))
    if (command === 'network' && ['create', 'rm', 'connect', 'disconnect'].includes(sub)) return each(ns, `${sub} the network`, operands(rest, VALUED[`network ${sub}`]))
    return `docker ${command} ${sub} is not a command the guard knows`
  }
  const tail = args.slice(1)
  switch (command) {
    case 'rm': return each(ns, 'remove', operands(tail))
    case 'stop': return each(ns, 'stop', operands(tail, VALUED.stop))
    case 'rmi': return each(ns, 'remove the image', operands(tail))
    case 'build': return each(ns, 'tag the image', [...valueOf(tail, '-t'), ...valueOf(tail, '--tag')])
    case 'run': return runRefusal(ns, tail)
    case 'exec': return execRefusal(ns, tail)
    case 'compose': {
      // Reports on compose itself, which act on no project.
      if (sub === 'version' || tail.includes('--version')) return null
      const projects = [...valueOf(tail, '-p'), ...valueOf(tail, '--project-name')]
      return projects.length ? each(ns, 'act on the compose project', projects) : 'names no compose project, so compose would choose one'
    }
    case 'system': return sub === 'prune' ? 'would clear the whole machine' : `docker system ${sub ?? ''} is not a command the guard knows`
    default: return `docker ${command} is not a command the guard knows`
  }
}

const refused = (args: readonly string[], why: string) => new Error(`Refused \`docker ${args.join(' ')}\`: it ${why}.`)

/** The host service's own way of running docker (`dockerCli`, `dockerStream`), checked the same way for a test. */
export function guarded<R extends unknown[], T>(ns: string, run: (args: string[], ...rest: R) => T): (args: string[], ...rest: R) => T {
  return (args, ...rest) => {
    const why = refusal(ns, args)
    if (why) throw refused(args, why)
    return run(args, ...rest)
  }
}

export type GuardedDocker = ((...args: string[]) => string) & {
  /** With text on stdin, or other options of `execFileSync`. */
  with: (options: ExecFileSyncOptions, ...args: string[]) => string
  /** The same, its failure ignored: for teardown, where it may already be gone. */
  quiet: (...args: string[]) => void
  readonly namespace: string
}

/** `docker` for a test under `ns`: each command checked by `refusal` before it runs, and refused with the reason. */
export function guardedDocker(ns: string, defaults: ExecFileSyncOptions = {}): GuardedDocker {
  const run = (options: ExecFileSyncOptions, args: string[]): string => {
    const why = refusal(ns, args)
    if (why) throw refused(args, why)
    return execFileSync('docker', args, { encoding: 'utf8', stdio: 'pipe', maxBuffer: 64 * 1024 * 1024, ...defaults, ...options }) as string
  }
  const docker = ((...args: string[]) => run({}, args)) as GuardedDocker
  docker.with = (options, ...args) => run(options, args)
  docker.quiet = (...args) => {
    // A refusal is never swallowed: only Docker's own failure, for what is already gone.
    const why = refusal(ns, args)
    if (why) throw refused(args, why)
    try { run({}, args) } catch { /* already gone */ }
  }
  Object.defineProperty(docker, 'namespace', { value: ns })
  return docker
}

/** Which of `ports` something on this machine already holds: one that answers on 127.0.0.1, or cannot be bound. */
export async function portsTaken(ports: readonly number[]): Promise<number[]> {
  const taken: number[] = []
  for (const port of ports) if (await answers(port) || !(await bindable(port))) taken.push(port)
  return taken
}

function answers(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const c = net.connect({ host: '127.0.0.1', port, timeout: 500 })
    c.once('connect', () => { c.destroy(); resolve(true) })
    c.once('timeout', () => { c.destroy(); resolve(false) })
    c.once('error', () => resolve(false))
  })
}

function bindable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const s = net.createServer()
    s.once('error', () => resolve(false))
    s.listen(port, '0.0.0.0', () => s.close(() => resolve(true)))
  })
}

/** Fails before the test touches anything when one of the fixed ports it publishes on is already held here. */
export async function requireFreePorts(ports: readonly number[]): Promise<void> {
  const taken = await portsTaken(ports)
  if (taken.length) {
    throw new Error(`This test publishes on port ${taken.join(', ')}, which something on this machine already holds. It touched nothing; free the port, or run it on another machine.`)
  }
}

/**
 * Fails before the test touches anything when the machine already has an HQ, under any namespace: a machine runs
 * one HQ, so the host service refuses to install a second, and the test cannot install its own.
 */
export async function requireNoHq(): Promise<void> {
  const hqs = await new Docker(dockerCli).hqContainers()
  if (hqs.length) {
    throw new Error(`This test installs an HQ, and this machine already has one (${hqs.join(', ')}); a machine runs one HQ. It touched nothing; run it on a machine without one.`)
  }
}

/**
 * Fails before the test touches anything when this machine's firewall already holds another install's agent
 * protections. Every install shuts the same agents' range, so that table refuses an agent network whatever the test's
 * own rules do, and a refusal the test sees would not be known to be its own. Listed from a container on the machine's
 * network, as the host service sees it.
 */
export function requireNoOtherProtections(docker: GuardedDocker, image: string): void {
  const listing = docker('run', '--rm', '--network', 'host', '--cap-add', 'NET_ADMIN', '--entrypoint', 'nft', image, 'list', 'tables')
  const others = otherProtectionTables(listing, docker.namespace)
  if (others.length) {
    throw new Error(`This test checks its own agent protections, and this machine's firewall already holds another install's (${others.join(', ')}), which refuses agent networks whatever the test's rules do. It touched nothing; run it on a machine with no other install.`)
  }
}

/** The agent protection tables in `nft list tables` other than the namespace's own. */
export function otherProtectionTables(listing: string, ns: string): string[] {
  return listing.split('\n').flatMap(line => {
    const m = /^table inet (\S+_agents)$/.exec(line.trim())
    return m && m[1] !== tableFor(ns) ? [m[1]!] : []
  })
}
