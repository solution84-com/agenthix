/**
 * A part of this installation that is not running because another program took its published port first — after a
 * reboot, most often, when Docker starts the containers again (one port plan, Rule 4). Said in `agenthix status`, in
 * HQ's figures (which the Fleet Console shows), and in the host service's log shortly after it starts.
 */
import { FRONT_DOOR_PORTS } from '@agenthix/core'
import type { MachineContainer } from '../docker/machineContainers'
import type { Context } from '../service/context'
import { readInstallation } from '../state/installation'
import { remoteAccessPort } from '../remoteAccess/state'
import { CONSOLE_BIND, EVERY_ADDRESS, holderOf, portProbe, type PortProbe } from '../install/portCheck'
import { cmd } from '../cli/words'

export type BlockedPart = {
  part: 'hq' | 'console' | 'front-door'
  port: number
  /** Who holds it, in words. */
  holder: string
  /** What `status` says of it, ending in what to do. */
  text: string
}

type Published = { part: BlockedPart['part']; container: string; ports: { port: number; bind: string }[] }

function publishedParts(ctx: Context): Published[] {
  const recorded = readInstallation(ctx.state)?.ports
  const hq = ctx.state.readJson('hq', 'settings.json') as { bind?: unknown } | null
  const out: Published[] = []
  if (hq && recorded?.hq != null) {
    out.push({ part: 'hq', container: ctx.names.container('hq-web'), ports: [{ port: recorded.hq, bind: typeof hq.bind === 'string' ? hq.bind : EVERY_ADDRESS }] })
  }
  if (ctx.state.readJson('console', 'settings.json') && recorded?.console != null) {
    const remote = remoteAccessPort(ctx)
    out.push({
      part: 'console', container: ctx.names.consoleContainer,
      ports: [{ port: recorded.console, bind: CONSOLE_BIND }, ...(remote === null ? [] : [{ port: remote, bind: EVERY_ADDRESS }])],
    })
  }
  if ((ctx.state.readJson('front-door', 'settings.json') as { on?: unknown } | null)?.on === true) {
    out.push({ part: 'front-door', container: ctx.names.container('front-door'), ports: FRONT_DOOR_PORTS.map(port => ({ port, bind: EVERY_ADDRESS })) })
  }
  return out
}

function words(part: BlockedPart['part'], port: number, holder: string): string {
  const held = `port ${port} is held by ${holder}`
  if (part === 'hq') return `HQ cannot start: ${held}. Free it, or move HQ to another port with ${cmd('hq address <address>')}.`
  if (part === 'console') return `The Fleet Console cannot start: ${held}. Free it, or move the Fleet Console with ${cmd('console port <port>')}.`
  return `The front door cannot start: ${held}. Free it, or turn the front door off with ${cmd('front-door off')}.`
}

/**
 * Each part that is not running while another holds one of its ports; none when Docker cannot be asked. On Docker
 * Desktop a program on the computer is found by Docker's own publish, as the check before publishing finds it.
 */
export async function blockedParts(ctx: Context, probe: PortProbe = portProbe(ctx)): Promise<BlockedPart[]> {
  const parts = publishedParts(ctx)
  if (!parts.length) return []
  let containers: MachineContainer[]
  try {
    containers = await ctx.docker.machineContainers()
  } catch {
    return []
  }
  const blocked: BlockedPart[] = []
  for (const p of parts) {
    const container = containers.find(c => c.name === p.container)
    if (!container || container.running) continue
    for (const { port, bind } of p.ports) {
      const holder = await holderOf(ctx, port, bind, containers, probe)
      if (holder) blocked.push({ part: p.part, port, holder, text: words(p.part, port, holder) })
    }
  }
  return blocked
}

/**
 * Once, a while after the host service starts — when Docker has had time to start the containers after a reboot —
 * says in its log which part could not start for a taken port. Returns the stop function.
 */
export function reportBlockedAfterStart(ctx: Context, log: (line: string) => void, delayMs = 90_000): () => void {
  const timer = setTimeout(() => {
    blockedParts(ctx).then(parts => { for (const p of parts) log(p.text) }, () => {})
  }, delayMs)
  timer.unref?.()
  return () => clearTimeout(timer)
}
