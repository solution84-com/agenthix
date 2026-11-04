/**
 * How HQ's machine turns into the words on its page (board *HQ's site*, *hq's address and the front door*, *Moving
 * hq*, *Suspend, resume and erase*; spec §11, §13, §15).
 */
import { BRANDING, type FrontDoorFigures, type InstallFigures } from '@agenthix/core'
import type { PillTone } from '@agenthix/ui/primitives'
import type { NoticeTone } from '../../components'
import type { FleetHost } from '../dashboard/types'
import { whenIs } from '../dashboard/words'

/** How long an erased HQ can be restored (spec §15): the host service's default. */
export const GRACE_DAYS = 30
const DAY = 24 * 60 * 60 * 1000

/**
 * Where HQ listens on its own machine, which the machine's own web server points at (spec §6). The port is the
 * installation's own and the Fleet Console is not told it, so the words send the reader to where it is shown.
 */
export const HQ_LISTENS_ON = `127.0.0.1, on the port that \`${BRANDING.cliCommand} status\` shows`

const dateOf = (iso: string) => {
  const d = new Date(iso)
  return `${d.getDate()} ${d.toLocaleString('en-GB', { month: 'short' })}`
}

/** What was asked from this page and answered, or plainly under way when HQ stopped answering. */
export type LocalHqChange =
  | { kind: 'suspended'; at: string }
  | { kind: 'resumed'; at: string }
  | { kind: 'erased'; at: string; purgeAfter: string | null }

export type HqCondition =
  | { kind: 'running' }
  | { kind: 'unknown' }
  | { kind: 'suspended'; since: string }
  | { kind: 'erased'; since: string; keptUntil: string }

const keptUntil = (since: string) => new Date(Date.parse(since) + GRACE_DAYS * DAY).toISOString()

/** HQ suspended or erased, from the figures, or from what was asked here when that is newer. */
export function hqCondition(install: InstallFigures | undefined, local: LocalHqChange | null): HqCondition {
  if (local && (!install || Date.parse(local.at) > Date.parse(install.since))) {
    if (local.kind === 'resumed') return { kind: 'running' }
    return local.kind === 'suspended'
      ? { kind: 'suspended', since: local.at }
      : { kind: 'erased', since: local.at, keptUntil: local.purgeAfter ?? keptUntil(local.at) }
  }
  if (!install) return { kind: 'unknown' }
  if (install.state === 'suspended') return { kind: 'suspended', since: install.since }
  if (install.state === 'erased') return { kind: 'erased', since: install.since, keptUntil: keptUntil(install.since) }
  return { kind: 'running' }
}

export function hqHealth(install: InstallFigures | undefined, online: boolean, haveFigures = true): { label: string; tone: PillTone; sentence: string } {
  if (!online) return { label: 'Not answering', tone: 'neutral', sentence: "HQ's machine is not answering the Fleet Console." }
  if (!haveFigures) return { label: 'Waiting for figures', tone: 'neutral', sentence: "Waiting for the machine's first figures." }
  if (!install) return { label: 'Not installed', tone: 'neutral', sentence: 'HQ is not installed on this machine.' }
  if (!install.healthy) return { label: 'Needs attention', tone: 'danger', sentence: install.problem ?? `HQ is ${install.state}.` }
  return { label: 'Healthy', tone: 'healthy', sentence: 'Healthy — people can sign in' }
}

export function graceWords(c: Extract<HqCondition, { kind: 'erased' }>, now: Date): { pill: string; sentence: string } {
  const left = Math.max(0, Math.round((Date.parse(c.keptUntil) - now.getTime()) / DAY))
  return {
    pill: `HQ erased — restorable until ${dateOf(c.keptUntil)}`,
    sentence: `HQ was erased ${whenIs(c.since, now)}. Its final backup, and its copy in the backup location if one is set, are kept until ${dateOf(c.keptUntil)} — ${left} ${left === 1 ? 'day' : 'days'} left. Restoring brings it back as it was when erased.`,
  }
}

export function hostOf(address: string): string {
  try {
    return new URL(address).hostname
  } catch {
    return address
  }
}

/** A name of its own, not a network address: kept when HQ moves, and pointed at the new machine (spec §13). */
export function hasOwnDomain(address: string): boolean {
  const host = hostOf(address)
  return !(host === 'localhost' || host.startsWith('[') || /^\d{1,3}(\.\d{1,3}){3}$/.test(host))
}

/** Where uploaded files are served (spec §16): a host of their own, or none on a bare network address. */
export function uploadedFiles(address: string): string {
  if (address.startsWith('https://') && hasOwnDomain(address)) {
    return `files.${hostOf(address)}, unless another host was set for them on the machine — a host of their own, so HQ's address never serves a file someone uploaded.`
  }
  return 'No separate host on a bare network address — uploaded files are offered as downloads only, never shown in the page.'
}

export type FrontDoorLine = { title: string; text: string; pill: string; tone: PillTone }

export function frontDoorLine(door: FrontDoorFigures, address: string | null, now: Date): FrontDoorLine {
  if (!door.on) {
    return {
      title: 'Your own web server',
      text: `HQ listens on ${HQ_LISTENS_ON}. Point your web server or tunnel at it, passing WebSocket upgrades.`,
      pill: `Not checked by ${BRANDING.displayName}`,
      tone: 'neutral',
    }
  }
  const title = "The host service's front door"
  const expiry = door.certificateExpiresAt ? dateOf(door.certificateExpiresAt) : null
  if (door.renewalProblem) {
    return { title, tone: 'danger', pill: 'Renewal failing', text: `${door.renewalProblem.replace(/\.?$/, '.')}${expiry ? ` The certificate expires on ${expiry}.` : ''}` }
  }
  const hosts = address ? `${hostOf(address)} and its uploaded files` : "HQ's address and its uploaded files"
  return {
    title, tone: 'healthy', pill: expiry ? 'Certificates valid' : 'No certificate yet',
    text: `Holds ports 80 and 443 · certificates for ${hosts}${expiry ? ` · valid until ${expiry}, renewed by themselves before then` : ''}`,
  }
}

/** The address to send when what was typed is HQ's address, or its host name as the board asks; null otherwise. */
export function erasedAddress(typed: string, address: string): string | null {
  const t = typed.trim()
  if (!t) return null
  return t === address || t === hostOf(address) ? address : null
}

export type CommandRun =
  | { phase: 'idle' }
  | { phase: 'working' }
  | { phase: 'done'; result: unknown }
  /** The host service's own words, or why the command did not reach it. */
  | { phase: 'refused'; message: string }

export type HqAction = 'suspend' | 'suspendLater' | 'resume' | 'erase' | 'eraseLater' | 'frontDoor' | 'frontDoorOff' | 'address'

const WORDS: Record<HqAction, { working: [string, string]; done: string; refused: string }> = {
  suspend: { working: ['Suspending HQ…', 'Runs pause after their current step, then HQ stops.'], done: 'HQ is suspended.', refused: 'HQ was not suspended' },
  suspendLater: { working: ['Scheduling the suspend…', 'Members see a notice from the moment it is scheduled.'], done: 'Scheduled. Members see a notice from now.', refused: 'The suspend was not scheduled' },
  resume: { working: ['Resuming HQ…', 'HQ starts again as it was; sites reconnect when it answers.'], done: 'HQ is running again.', refused: 'HQ was not resumed' },
  erase: { working: ['Erasing HQ…', 'A final sealed backup is taken first; then its running data is removed.'], done: 'HQ is erased.', refused: 'HQ was not erased' },
  eraseLater: { working: ['Scheduling the erase…', 'Members see a notice from the moment it is scheduled.'], done: 'Scheduled. Members see a notice from now.', refused: 'The erase was not scheduled' },
  frontDoor: { working: ['Turning the front door on…', 'The host service checks the ports, then gets the certificates.'], done: 'The front door is on.', refused: 'The front door was not turned on' },
  frontDoorOff: { working: ['Turning the front door off…', `HQ goes back to listening on ${HQ_LISTENS_ON} for your own web server.`], done: 'The front door is off.', refused: 'The front door was not turned off' },
  address: { working: ["Changing HQ's address…", 'HQ restarts at its new address; connected sites and host services follow.'], done: "HQ's address is changed.", refused: "HQ's address was not changed" },
}

/** An action's answer in words: what did not happen, then the host service's own words. */
export function commandWords(action: HqAction, run: CommandRun): { tone: NoticeTone; title: string; text: string } | null {
  const w = WORDS[action]
  switch (run.phase) {
    case 'idle':
      return null
    case 'working':
      return { tone: 'neutral', title: w.working[0], text: w.working[1] }
    case 'refused':
      return { tone: 'danger', title: w.refused, text: run.message }
    case 'done': {
      const address = (run.result as { address?: unknown } | null)?.address
      return { tone: 'healthy', title: w.done, text: action === 'address' && typeof address === 'string' ? `HQ now answers at ${address}.` : '' }
    }
  }
}

export type Asked = { action: HqAction; at: string; wasOnline: boolean }

/** Of two things asked, the one asked later. */
export function newest(a: LocalHqChange | null, b: LocalHqChange | null): LocalHqChange | null {
  if (!a || !b) return a ?? b
  return Date.parse(b.at) > Date.parse(a.at) ? b : a
}

/**
 * What an action asked here has done, before the figures say so. The Fleet Console reaches HQ's machine through HQ, so
 * once HQ stops, the answer to suspending or erasing it cannot come back: the machine going quiet after it was asked,
 * having answered before, is that answer.
 */
export function localChange(asked: Asked | null, run: CommandRun, online: boolean): LocalHqChange | null {
  if (!asked) return null
  const wentQuiet = run.phase === 'working' && asked.wasOnline && !online
  if (asked.action === 'resume') return run.phase === 'done' ? { kind: 'resumed', at: asked.at } : null
  if (run.phase !== 'done' && !wentQuiet) return null
  if (asked.action === 'suspend') return { kind: 'suspended', at: asked.at }
  if (asked.action === 'erase') {
    const purgeAfter = run.phase === 'done' ? (run.result as { purgeAfter?: unknown } | null)?.purgeAfter : null
    return { kind: 'erased', at: asked.at, purgeAfter: typeof purgeAfter === 'string' ? purgeAfter : null }
  }
  return null
}

export type FollowRow = { name: string; text: string; pill?: string }

/**
 * What follows HQ when it moves (spec §13): its own machine's site, each other machine's site and host service, and
 * the Fleet Console. To a new address, connected ones are told it; offline ones need pointing by hand.
 */
export function whatFollows(hosts: FleetHost[], newAddress: string | null, fleetConsole: { machineName: string; here: string }, now: Date): FollowRow[] {
  const hqHost = hosts.find(h => h.hqMachine)
  const rows: FollowRow[] = []
  if (hqHost) {
    rows.push({
      name: `${hqHost.machineName} · HQ and its site`,
      text: newAddress ? 'Set to the new address by the host service during the restore.' : 'Restored on the new machine with HQ, at the same address.',
    })
  }
  for (const h of hosts) {
    if (h.hqMachine) continue
    const offline = !h.online || h.leftByItself
    if (!offline) {
      rows.push({
        name: h.siteName,
        text: newAddress
          ? 'Connected: HQ tells its site and its host service the new address before it stops; each switches once the new HQ proves it is the same one.'
          : 'Connected: its site and its host service reconnect to the same address once the domain points at the new machine.',
      })
      continue
    }
    const since = h.since ? `Offline since ${whenIs(h.since, now)}` : 'Offline'
    rows.push(newAddress
      ? { name: h.siteName, text: `${since}: it will keep trying the old address until it is pointed at the new one.`, pill: 'Will need pointing' }
      : { name: h.siteName, text: `${since}: it reconnects to the same address when it is back.` })
  }
  const consoleHere = hqHost !== undefined && fleetConsole.machineName === hqHost.machineName
  rows.push({
    name: 'The Fleet Console',
    text: consoleHere
      ? `It runs on ${hqHost.machineName}, so it is restored with HQ. Fleet admins carry on at ${fleetConsole.here} on the new machine.`
      : `It runs on ${fleetConsole.machineName} and stays put; it dials HQ's ${newAddress ? 'new ' : ''}address like a site.`,
  })
  return rows
}

/** The commands for a machine that was offline while HQ moved to a new address: its host service's first. */
export function pointingCommands(newAddress: string): string[] {
  return [`${BRANDING.cliCommand} console hq-address ${newAddress}`, `${BRANDING.cliCommand} site hq-address ${newAddress}`]
}
