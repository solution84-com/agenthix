/**
 * `agenthix status` in sentences (host-management spec §9, #305; the CLI board's *agenthix status*): one block for
 * HQ and one for the site, each a state in a sentence that ends in what to do next. Never an internal word.
 */
import { movingLines } from './hqAddressWords'
import type { MachineStatus, PartState } from '../status/machineStatus'
import type { BlockedPart } from '../status/portsBlocked'
import type { SiteCause } from '../status/siteControl'
import { hostContainer } from './hostContainer'
import type { BackupsStatus } from '../backups/status'
import { backupLines, fullDate } from './backupWords'
import { GRACE_DAYS } from '../lifecycle/bin'
import { cmd, nextStep, wrap } from './words'
import { scheduledLine } from './scheduled'
import { upgradeLines } from './upgrades'
import type { UpgradesStatus } from '../upgrades/status'
import type { LifecycleStatus } from '../lifecycle/status'
import { erasedLines, hqSuspendedLine, siteSuspendedLine } from './lifecycleWords'
import { managementLines, consoleHereLines } from './consoleWords'
import type { ManagementStatus } from '../link/status'

const IN = '  '

function people(n: number): string {
  if (n === 0) return 'No one has an account yet.'
  return n === 1 ? '1 person has an account.' : `${n} people have accounts.`
}

function peopleAndAgents(users: number, agents: number | null): string {
  if (agents === null) return people(users)
  return `${people(users).slice(0, -1)}; ${agents === 1 ? '1 agent is' : `${agents} agents are`} working.`
}

/** A part that is not running, in a sentence; null when it runs. */
function notRunning(state: PartState, logs: string): string | null {
  if (state === 'stopped' || state === 'missing') return nextStep('Stopped. Nothing is lost. To start it again:', cmd('install'), IN)
  if (state === 'starting') {
    return nextStep('Starting. Not every part of it runs yet. If that lasts more than a few minutes, see why:', cmd(logs), IN)
  }
  return null
}

/** ", unchanged since 0.2.1" after a version, when its image is the one an earlier release published. */
const since = (release: string | undefined) => (release ? `, unchanged since ${release}` : '')

function hqBlock(hq: NonNullable<MachineStatus['hq']>, suspended: boolean, blocked: string | undefined, unchanged?: string): string[] {
  const lines = [`HQ  ${hq.address}  ${hq.version}${since(unchanged)}`]
  const down = notRunning(hq.containers, 'hq logs')
  if (down && suspended) lines.push(hqSuspendedLine())
  else if (blocked) lines.push(wrap(blocked, IN))
  else if (down) lines.push(down)
  else if (!hq.answer) {
    lines.push(nextStep(
      'Starting. HQ runs, but does not answer yet. If it still does not after a few minutes, see why:',
      cmd('hq logs'), IN,
    ))
  } else if (hq.answer.users === 0) {
    lines.push(nextStep(`Running. ${people(0)} To make the link for the first one:`, cmd('hq invite-admin'), IN))
  } else {
    lines.push(wrap(`Running. ${peopleAndAgents(hq.answer.users, hq.answer.runningAgents)}`, IN))
  }
  return lines
}

/** A stopped site on a machine without HQ: `install` would put HQ here, so the way back is a fleet admin's. */
function stoppedSiteElsewhere(management: ManagementStatus | undefined): string {
  const by = management?.managedBy
  if (by && !by.local) {
    return nextStep('Not running. Nothing is lost. Ask a fleet admin to start it again in the Fleet Console, or, if it will not start, see why:', cmd('site logs'), IN)
  }
  return nextStep(
    'Not running. Nothing is lost. A fleet admin gives this machine a code in the Fleet Console (Add a site, on the Dashboard), and it comes back with:',
    cmd('console connect <hq address> <code>'), IN,
  )
}

function siteBlock(
  site: NonNullable<MachineStatus['site']>, suspended: LifecycleStatus['suspended'] = {}, management?: ManagementStatus, hasHq = true,
  unchanged?: string,
): string[] {
  const lines = [`Site ${site.name}  ${site.version}${since(unchanged)}${site.carriesHq ? '  HQ · site' : ''}`]
  const down = notRunning(site.containers, 'site logs')
  if (down) {
    const stopped = site.containers === 'stopped' || site.containers === 'missing'
    lines.push(suspended.site || suspended.hq
      ? siteSuspendedLine(!suspended.site)
      : stopped && !hasHq && !site.carriesHq ? stoppedSiteElsewhere(management) : down.replace('Stopped.', 'Not running.'))
    return lines
  }
  // HQ said a restore of this site onto another machine replaced this copy (adr-0119).
  if (site.replacedAt) {
    lines.push(replacedLine(site.replacedAt))
    return lines
  }
  // hq said it moves, and the new address has not passed the site's check yet (spec §13).
  if (site.moving) {
    lines.push(movingLines(site.moving.from, site.moving.to, site.moving.since, 'site'))
    return lines
  }
  switch (site.connection) {
    case 'connected':
      lines.push(wrap(site.carriesHq ? 'Connected to HQ, which this site carries.' : 'Connected to HQ.', IN))
      break
    case 'notConnected':
      lines.push(site.cause ? causeLine(site.cause, site.carriesHq) : nextStep(
        site.carriesHq
          ? 'Not connected. HQ has not seen this site connect. It reaches HQ over a private Docker network, ' +
            'so the address is not the cause. To see why:'
          : 'Not connected to HQ. To see why:',
        cmd('site logs'), IN,
      ))
      break
    case 'upgrade':
      lines.push(nextStep(
        'Not connected. HQ and this site run versions that do not work together, so HQ does not accept it. To see which:',
        cmd('site logs'), IN,
      ))
      break
    case 'unpaired':
      lines.push(nextStep(
        'Not connected. HQ holds no pairing secret, so it does not know this site. Run this again, which sets the same secret in both:',
        cmd('install'), IN,
      ))
      break
    case 'unknown':
      lines.push(site.cause && site.cause !== 'unreachable'
        ? causeLine(site.cause, site.carriesHq)
        : wrap('Running. Whether it is connected is not known while HQ does not answer.', IN))
      break
  }
  return lines
}

/** A copy of the site a restore onto another machine replaced: HQ refuses it, nothing here is touched, and the way out. */
function replacedLine(at: string): string {
  return nextStep(
    `Replaced. On ${fullDate(new Date(at))} this site was restored from its backup onto another machine, which runs it ` +
    'now. HQ refuses this copy, so it takes no runs, and it no longer tries to connect. Its data stays on this machine. ' +
    `To remove it from this machine, keeping a final backup for ${GRACE_DAYS} days:`,
    cmd('site erase'), IN,
  )
}

/** Why the site is not connected, in its own terms, and what to do; the board's *A site's status*. */
function causeLine(cause: SiteCause, carriesHq = true): string {
  const rewrite = 'To write HQ\'s and the site\'s settings again, with the same secret in both:'
  switch (cause) {
    case 'credentialRefused':
      if (!carriesHq) {
        return wrap('Not connected. HQ answered but refused this site\'s credential. A fleet admin removes the site in the Fleet Console and adds it again with a new code.', IN)
      }
      return nextStep(
        'Not connected. HQ refused it: its pairing secret is not the one HQ expects. The site reaches HQ over a ' +
        `private Docker network, so the address is not the cause. ${rewrite}`, cmd('install'), IN,
      )
    case 'secretTooShort':
      return nextStep(`Not connected. Its pairing secret is shorter than HQ accepts, so it did not try to connect. ${rewrite}`, cmd('install'), IN)
    case 'addressRefused':
      return nextStep(`Not connected. The site would not send its pairing secret to the address it was given for HQ. ${rewrite}`, cmd('install'), IN)
    case 'credentialStore':
      return nextStep(`Not connected. The site cannot keep its credential: its master key is missing or wrong. ${rewrite}`, cmd('install'), IN)
    case 'versionMismatch':
      return nextStep(
        'Not connected. HQ and this site run versions that do not work together, so HQ does not accept it. To see which:',
        cmd('site logs'), IN,
      )
    case 'unreachable':
      return nextStep(carriesHq
        ? 'Not connected. The site cannot reach HQ over the private Docker network they share. HQ may still be ' +
          'starting; the site reconnects by itself. If it lasts, see why:'
        : "Not connected. The site cannot reach HQ at HQ's address from this machine. HQ may be starting or off, or " +
          'the network between them is cut; the site reconnects by itself. If it lasts, see why:', cmd('site logs'), IN,
      )
  }
}

function frontDoorBlock(hq: NonNullable<MachineStatus['hq']>, door: MachineStatus['frontDoor']): string[] {
  if (door?.on) {
    return ['Front door  on', wrap(`Serves ${door.hosts.join(' and ')} on ports 80 and 443, with certificates it renews on its own.`, IN)]
  }
  const at = `${hq.listen.bind === '0.0.0.0' ? "this machine's address" : hq.listen.bind}${hq.listen.port === null ? '' : `:${hq.listen.port}`}`
  if (hq.address.startsWith('https://')) {
    return ['Front door  off', wrap(`Your own web server serves ${hq.address}: point it at ${at}.`, IN)]
  }
  const url = new URL(hq.address).hostname
  if (/^(localhost|127\.|\[::1\])/.test(url)) {
    return ['Front door  off', wrap(`HQ answers only on this machine, at ${hq.address}.`, IN)]
  }
  return ['Front door  off', wrap(`HQ answers on this machine's network at ${hq.address}, in plain http.`, IN)]
}

/** A part other than HQ that cannot start for a port another holds (Rule 4); nothing when none. */
function blockedLines(blocked: BlockedPart[], part: 'console' | 'front-door'): string[] {
  return blocked.filter(b => b.part === part).map(b => wrap(b.text, IN))
}

/** The agent protections: a fact while they hold, and why not when they do not (spec §8). No setting to offer. */
function protectionsBlock(p: NonNullable<MachineStatus['protections']>): string[] {
  if (p.holding) {
    return ['Protections  always on', wrap("Agents can't reach this machine, its other containers, or the cloud metadata address.", IN)]
  }
  return [
    'Protections  not in place',
    wrap(`${p.problem ?? 'They could not be confirmed.'} Until they are, the site here starts no agent. They are tried again every minute.`, IN),
    nextStep('To see what the host service says:', `docker logs ${hostContainer()}`, IN),
  ]
}

/** What is scheduled on the machine, soonest first (spec §14); nothing when nothing is. */
function scheduledBlock(changes: NonNullable<MachineStatus['scheduled']>, now: Date): string[] {
  if (changes.length === 0) return []
  return [`Scheduled  ${changes.length}`, ...changes.map(c => scheduledLine(c, now)), nextStep('To change or cancel one:', cmd('schedule change|cancel <id>'), IN)]
}

/** `machine.status` answers the machine's status with how its backups stand. */
export type StatusWithBackups = MachineStatus & {
  backups?: BackupsStatus | null; upgrades?: UpgradesStatus | null; lifecycle?: LifecycleStatus; management?: ManagementStatus
  /** Present on a demo (adr-0186): when it is next reset. */
  demo?: { nextResetAt: string }
}

export function statusText(s: StatusWithBackups, now = new Date()): string {
  const lines = [`${s.machine.name} · Self-hosted · host service ${s.machine.hostServiceVersion}`]
  if (s.lifecycle) lines.push(...erasedLines(s.lifecycle.erased))
  if (!s.hq && !s.site) {
    const by = s.management?.managedBy
    lines.push(by && !by.local
      ? wrap('No site runs here. If its install failed, or a move or a disconnect left this machine empty, a fleet admin adds a site here or tries the install again in the Fleet Console (Add a site, on the Dashboard).')
      : nextStep('Nothing runs here yet. To install HQ and its site on this machine:', cmd('install')))
    lines.push(...managementLines(s.management, false, false), ...consoleHereLines(s.management, false), ...blockedLines(s.blocked ?? [], 'console'))
    return lines.join('\n')
  }
  lines.push(...managementLines(s.management, !!s.hq, !!s.site, !!s.site?.replacedAt))
  const blocked = s.blocked ?? []
  if (s.demo) {
    lines.push(wrap(`A demo: no Fleet Console and no nightly backup, and everything visitors did is removed at each reset, the next at ` +
      `${s.demo.nextResetAt.slice(0, 16).replace('T', ' ')} UTC. To reset it now: ${cmd('demo reset')}`))
  }
  if (s.hq) lines.push(...hqBlock(s.hq, !!s.lifecycle?.suspended.hq, blocked.find(b => b.part === 'hq')?.text, s.unchangedSince?.hq), ...upgradeLines(s.upgrades, 'hq', now))
  if (s.site) lines.push(...siteBlock(s.site, s.lifecycle?.suspended, s.management, !!s.hq, s.unchangedSince?.site), ...upgradeLines(s.upgrades, 'site', now))
  if (s.site && s.backups && !s.demo) lines.push(...backupLines(s.backups, now))
  lines.push(...consoleHereLines(s.management, !!s.hq), ...blockedLines(blocked, 'console'))
  if (s.hq) lines.push(...frontDoorBlock(s.hq, s.frontDoor), ...blockedLines(blocked, 'front-door'))
  if (s.site && s.protections) lines.push(...protectionsBlock(s.protections))
  if (s.scheduled) lines.push(...scheduledBlock(s.scheduled, now))
  return lines.join('\n')
}
