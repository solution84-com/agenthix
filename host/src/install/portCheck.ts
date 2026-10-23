/**
 * The check before anything is published on the machine (one port plan, Rule 4). Every operation that is about to
 * publish a port — HQ's, the Fleet Console's, the front door's 80 and 443, the remote-access port — asks it first,
 * before it fetches or writes anything, and is refused with every problem at once:
 *
 * - a port outside what may be chosen (`ports.ts`);
 * - a port this installation already publishes for another of its parts;
 * - another installation's port: any container of another namespace, running or stopped, whose `<namespace>.ports`
 *   label lists it;
 * - a port held now: a bind probe on the address it would be published on, or a running container Docker publishes
 *   it for. The holder is named from Docker's published ports, else it is a program outside Docker. On Docker Desktop
 *   the host service shares only Docker's virtual machine's network, where a bind probe cannot see a program on the
 *   computer itself, so there Docker is also asked to publish the port from a throwaway container
 *   (`docker/publishProbe.ts`), which it refuses where the computer's port is held.
 *
 * A port this installation's own containers hold already is not a problem: it is what a re-run or an in-place change
 * finds.
 */
import os from 'node:os'
import { FRONT_DOOR_PORTS } from '@agenthix/core'
import type { MachineContainer } from '../docker/machineContainers'
import type { Context } from '../service/context'
import { machinePortInUse, type PortInUse } from '../frontDoor/probes'
import { isDockerDesktop } from '../protections/machine'
import { readInstallation } from '../state/installation'
import { remoteAccessPort } from '../remoteAccess/state'
import { Refusal } from '../owner/results'
import { portRangeReason, rangeOf } from './ports'
import { listenerFor } from './address'

export type PortPart = 'hq' | 'console' | 'front-door' | 'remote-access'

export type PortAsk = {
  port: number
  part: PortPart
  /** The address it would be published on: `0.0.0.0`, or `127.0.0.1` for this machine only. */
  bind: string
  /** How the person chooses another, in a sentence; the flag that chooses this part's port when not given. */
  another?: string
}

export type PortProblem = {
  port: number
  part: PortPart
  /** Who holds it, in words; null when nothing does (a port out of range). */
  holder: string | null
  /** The problem in a sentence, without how to choose another. */
  what: string
  /** The problem and how to choose another. */
  text: string
}

export const PART_NAME: Record<PortPart, string> = {
  hq: 'HQ',
  console: 'the Fleet Console',
  'front-door': 'the front door',
  'remote-access': "the Fleet Console's remote access",
}

const ANOTHER: Record<PortPart, string> = {
  hq: 'Choose another with --hq-port.',
  console: 'Choose another with --console-port.',
  'front-door': 'Free it first.',
  'remote-access': 'Ask for remote access on another port.',
}

/** The Fleet Console is published on this machine's own address only (compose/console.ts). */
export const CONSOLE_BIND = '127.0.0.1'
/** The front door and remote access are published on every address. */
export const EVERY_ADDRESS = '0.0.0.0'

export const PROGRAM = 'a program on this machine, not by a container'

const isOurs = (c: MachineContainer, ns: string) => c.labels[`${ns}.managed-by`] === 'host'

/** The installation another host service labelled this container with, and the ports it publishes; null for none. */
export function otherInstallation(c: MachineContainer, ns: string): { namespace: string; ports: number[] } | null {
  for (const [key, value] of Object.entries(c.labels)) {
    if (!key.endsWith('.managed-by') || value !== 'host') continue
    const namespace = key.slice(0, -'.managed-by'.length)
    if (namespace === ns) return null
    const ports = (c.labels[`${namespace}.ports`] ?? '').split(',').map(Number).filter(p => Number.isInteger(p) && p > 0)
    return { namespace, ports }
  }
  return null
}

/** The ports this installation publishes now, by part: only for a part that is here. */
export function ownPorts(ctx: Context): Map<number, PortPart> {
  const own = new Map<number, PortPart>()
  const recorded = readInstallation(ctx.state)?.ports
  if (recorded?.hq != null && ctx.state.readJson('hq', 'settings.json')) own.set(recorded.hq, 'hq')
  if (recorded?.console != null && ctx.state.readJson('console', 'settings.json')) own.set(recorded.console, 'console')
  const door = ctx.state.readJson('front-door', 'settings.json') as { on?: unknown } | null
  if (door?.on === true) for (const p of FRONT_DOOR_PORTS) own.set(p, 'front-door')
  const remote = remoteAccessPort(ctx)
  if (remote !== null) own.set(remote, 'remote-access')
  return own
}

/** How a held port is found, and what is said when it cannot be told. */
export type PortProbe = {
  inUse: PortInUse
  /** Why the port could not be checked, after "could not be checked: ". */
  cannotTell: (port: number, bind: string) => string
}

const bindCannotTell = (port: number, bind: string) => `the host service cannot listen on ${bind}:${port} to see whether it is free`
const dockerCannotTell = (port: number, bind: string) => `Docker could not publish ${bind}:${port} from a test container to see whether it is free`

/**
 * The probe for this machine: the bind probe (the context's, in tests), and on Docker Desktop also Docker's own
 * publish, since there the bind probe sees only Docker's virtual machine (`kernel` names it).
 */
export function portProbe(ctx: Context, kernel: string = os.release()): PortProbe {
  const bind = ctx.portInUse ?? machinePortInUse
  if (!isDockerDesktop(kernel)) return { inUse: bind, cannotTell: bindCannotTell }
  return {
    inUse: async (port, host) => (await bind(port, host)) === true || ctx.docker.publishProbe(port, host, ctx.names.hostContainer),
    cannotTell: dockerCannotTell,
  }
}

/**
 * Who holds `port` on `bind` other than this installation: a container Docker publishes it for, else a program
 * outside Docker when the probe finds it taken. Null when it is free or this installation's own; undefined
 * when the probe cannot tell.
 */
export async function holderOf(
  ctx: Context, port: number, bind: string, containers: MachineContainer[], probe: PortProbe = portProbe(ctx),
): Promise<string | null | undefined> {
  const publisher = containers.find(c => c.running && c.published.some(p => p.port === port))
  if (publisher) return isOurs(publisher, ctx.names.namespace) ? null : `the container ${publisher.name}`
  const inUse = await probe.inUse(port, bind)
  if (inUse === null) return undefined
  return inUse ? PROGRAM : null
}

/** Every problem with publishing these ports; none when each can be published. */
export async function portProblems(ctx: Context, asks: PortAsk[], probe: PortProbe = portProbe(ctx)): Promise<PortProblem[]> {
  const ns = ctx.names.namespace
  const own = ownPorts(ctx)
  let listed: MachineContainer[] | null = null
  const containers = async () => (listed ??= await ctx.docker.machineContainers())
  const problems: PortProblem[] = []
  for (const ask of asks) {
    const { port, part } = ask
    const lead = `Port ${port}, for ${PART_NAME[part]},`
    const add = (holder: string | null, what: string, another = ask.another ?? ANOTHER[part]) =>
      problems.push({ port, part, holder, what, text: `${what} ${another}` })

    const chosen = part === 'hq' || part === 'console' ? part : null
    const range = chosen && portRangeReason(port, chosen)
    if (chosen && range) {
      add(null, `${lead} ${range}.`, ask.another ?? `${ANOTHER[chosen].replace(/\.$/, '')}, from ${rangeOf(chosen)}.`)
      continue
    }
    const sibling = asks.find(a => a !== ask && a.port === port && a.part !== part)?.part
      ?? (own.get(port) !== part ? own.get(port) : undefined)
    if (sibling) {
      add(null, `${lead} is ${PART_NAME[sibling]}'s own port in this installation.`)
      continue
    }
    const all = await containers()
    const theirs = all.map(c => ({ c, other: otherInstallation(c, ns) })).find(x => x.other?.ports.includes(port))
    if (theirs) {
      add(theirs.c.name, `${lead} is held by another installation on this machine, ${theirs.other!.namespace} (its container ${theirs.c.name}).`)
      continue
    }
    const holder = await holderOf(ctx, port, ask.bind, all, probe)
    if (holder === undefined) add(null, `${lead} could not be checked: ${probe.cannotTell(port, ask.bind)}.`)
    else if (holder) add(holder, `${lead} is held by ${holder}.`)
  }
  return problems
}

/** What a restore or a move received publishes: HQ at its address, and the Fleet Console when it comes with HQ. */
export function restoredPortAsks(address: string, ports: { hq: number | null; console: number | null }, withConsole: boolean): PortAsk[] {
  return [
    ...(ports.hq === null ? [] : [{ port: ports.hq, part: 'hq' as const, bind: listenerFor(address).bind }]),
    ...(withConsole && ports.console !== null ? [{ port: ports.console, part: 'console' as const, bind: CONSOLE_BIND }] : []),
  ]
}

/** The words of a refusal listing every problem, ending "Nothing was changed." */
export const refusalText = (problems: PortProblem[]) => `${problems.map(p => p.text).join(' ')} Nothing was changed.`

/** Refuses, naming every problem, unless each port can be published. Run before anything is fetched or written. */
export async function checkPorts(ctx: Context, asks: PortAsk[], probe?: PortProbe): Promise<void> {
  const problems = await portProblems(ctx, asks, probe)
  if (problems.length) throw new Refusal('conflict', refusalText(problems))
}
