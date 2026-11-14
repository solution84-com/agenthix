/**
 * `agenthix hq upgrade`, `site upgrade` and `upgrades` (spec §11, §14; the CLI board's *agenthix status* and
 * *agenthix help*): an upgrade now, after asking, or scheduled with `--at`; whether fixes apply by themselves and
 * when; switching the host service to a new version (ADR-0118); and the lines `status` adds when an upgrade is ready.
 */
import type { ScheduledChange } from '@agenthix/core'
import { isPublishedVersion, SCHEDULED_CHANGE_PAUSE_LEAD_MS } from '@agenthix/core'
import { clockText, fromNow, whenText } from '../scheduled/time'
import { willBe } from '../scheduled/words'
import type { HostSwitchStarted, UpgradeCheckResult } from '../upgrades/operations'
import type { HostServiceReady } from '../upgrades/hostService'
import type { UpgradesStatus } from '../upgrades/status'
import { builtHostCommand } from './builtSwitch'
import { atTime, scheduledDone } from './scheduled'
import { cmd, nextStep, wrap } from './words'
import { partwayLines } from './partwayText'
import { IMAGE_TAG, builtText } from '../upgrades/builtUpgrade'
import type { UpgradeOutcome } from '../upgrades/upgrade'

export type UpgradeCommand =
  | { kind: 'upgrade'; target: 'hq' | 'site'; version?: string; at?: string; yes: boolean }
  /** A development build's upgrade to the images built here under `tag`, at once. */
  | { kind: 'upgradeBuilt'; target: 'hq' | 'site'; tag: string; yes: boolean }
  | { kind: 'upgrades'; auto?: boolean; window?: string }
  | { kind: 'upgradesHost'; launcher?: boolean; image?: string; yes: boolean }

type Usage = { kind: 'usage'; message: string }

export type Ask = <T>(request: unknown) => Promise<T>
export type UpgradeIo = { out: (text: string) => void; err: (text: string) => void; confirm: (question: string, yes: boolean) => Promise<boolean> }

const IN = '  '

function take(args: string[], name: string): { value?: string; rest: string[]; bad?: boolean } {
  const i = args.indexOf(name)
  if (i < 0) return { rest: args }
  const value = args[i + 1]
  if (value === undefined || value.startsWith('--')) return { rest: args, bad: true }
  return { value, rest: [...args.slice(0, i), ...args.slice(i + 2)] }
}

/** `hq upgrade [<version>] [--at <time>] [--yes]`, `hq upgrade --image-tag <tag> [--yes]`, and the same for the site. */
export function parseUpgrade(target: 'hq' | 'site', args: string[]): UpgradeCommand | Usage {
  const yes = args.includes('--yes')
  const tag = take(args.filter(a => a !== '--yes'), '--image-tag')
  if (tag.bad || (tag.value !== undefined && (tag.rest.length || !IMAGE_TAG.test(tag.value)))) {
    return { kind: 'usage', message: `${target} upgrade --image-tag takes one image tag, such as candidate, and nothing else but --yes.` }
  }
  if (tag.value !== undefined) return { kind: 'upgradeBuilt', target, tag: tag.value, yes }
  const at = take(args.filter(a => a !== '--yes'), '--at')
  if (at.bad) return { kind: 'usage', message: `Say when, in this machine's time: ${cmd(`${target} upgrade --at "Sun 18 Oct 04:00"`)}` }
  const [version, ...extra] = at.rest
  if (extra.length || (version !== undefined && !isPublishedVersion(version))) {
    return { kind: 'usage', message: `${target} upgrade takes a version such as 0.2.1, or none for the newest, and --at <time> to schedule it.` }
  }
  return { kind: 'upgrade', target, version, at: at.value, yes }
}

/** `upgrades host [--yes]`, `upgrades host --image <name or id> [--yes]`, `upgrades host --launcher on|off`. */
function parseUpgradesHost(args: string[]): UpgradeCommand | Usage {
  const yes = args.includes('--yes')
  const image = take(args.filter(a => a !== '--yes'), '--image')
  const launcher = take(image.rest, '--launcher')
  if (image.bad || launcher.bad || launcher.rest.length || (image.value !== undefined && launcher.value !== undefined)
    || (launcher.value !== undefined && launcher.value !== 'on' && launcher.value !== 'off')) {
    return { kind: 'usage', message: `upgrades host takes --yes, or --launcher on or --launcher off; on a development build, --image <name or id>.` }
  }
  return { kind: 'upgradesHost', yes, image: image.value, launcher: launcher.value === undefined ? undefined : launcher.value === 'on' }
}

/** `upgrades`, `upgrades auto on|off`, `upgrades --window "<day> <from>-<to>"`, `upgrades host …`. */
export function parseUpgrades(args: string[]): UpgradeCommand | Usage {
  if (args[0] === 'host') return parseUpgradesHost(args.slice(1))
  const window = take(args, '--window')
  if (window.bad) return { kind: 'usage', message: `Say the window: ${cmd('upgrades --window "Sun 02:00-04:00"')}` }
  const [auto, onOff, ...extra] = window.rest
  if (auto === undefined) return { kind: 'upgrades', window: window.value }
  if (auto !== 'auto' || (onOff !== 'on' && onOff !== 'off') || extra.length) {
    return { kind: 'usage', message: `upgrades takes auto on or auto off, and --window "<day> <from>-<to>".` }
  }
  return { kind: 'upgrades', auto: onOff === 'on', window: window.value }
}

const kindOf = (r: NonNullable<UpgradesStatus['ready']>) => (r.fix ? 'a fix' : 'a new version')
const lineOf = (v: string) => v.split('.').slice(0, 2).join('.')

/** The lines `status` puts under HQ, or under the site on a machine without HQ; none while nothing is ready. */
export function upgradeLines(u: UpgradesStatus | null | undefined, target: 'hq' | 'site', now = new Date()): string[] {
  if (!u) return []
  const lines: string[] = u.partway?.target === target ? partwayLines(u.partway, now, IN) : []
  if (u.target !== target) return lines
  const r = u.ready
  const again = cmd(`${target} upgrade`)
  const back = u.rolledBackLately
  if (back) lines.push(nextStep(`The upgrade to ${back.version} on ${whenText(new Date(back.endedAt), now)} failed and was rolled back. ${back.reason} To see why:`, cmd(`${target} logs`), IN))
  if (r?.rolledBack && back?.version === r.version) {
    lines.push(nextStep(`It is not applied by itself again. To try it again:`, cmd(`${target} upgrade ${r.version}`), IN))
  } else if (r?.rolledBack) {
    lines.push(nextStep(`Upgrade ready: ${r.version}, ${kindOf(r)}. It was rolled back once, so it is not applied by itself again. To try it again:`, cmd(`${target} upgrade ${r.version}`), IN))
  } else if (r?.hostServiceFirst && u.launcher) {
    lines.push(nextStep(`Upgrade ready: ${r.version}, a new version. The host service moves to ${lineOf(r.version)} first, by itself. To upgrade:`, again, IN))
  } else if (r?.hostServiceFirst) {
    lines.push(nextStep(`Upgrade ready: ${r.version}, a new version. It needs the host service ${lineOf(r.version)} first. To see how:`, again, IN))
  } else if (r?.fix && u.auto) {
    lines.push(nextStep(`Upgrade ready: ${r.version}, a fix. It applies by itself in the maintenance window, ${u.window}, after a backup. To apply it sooner:`, again, IN))
  } else if (r?.fix) {
    lines.push(nextStep(`Upgrade ready: ${r.version}, a fix. Automatic fixes are off. To apply it:`, again, IN))
  } else if (r) {
    lines.push(nextStep(`Upgrade ready: ${r.version}, a new version, which applies only when asked for. To upgrade:`, again, IN))
  } else if (u.problem) {
    lines.push(wrap(u.problem, IN))
  }
  const failed = u.hostSwitchFailed
  if (failed) lines.push(wrap(`The host service did not move to ${failed.version} on ${whenText(new Date(failed.endedAt), now)}. ${failed.reason}`, IN))
  if (u.hostService) lines.push(nextStep(`Host service ${u.hostService} is published. ${u.launcher ? 'To switch to it:' : 'To see how to switch to it:'}`, cmd('upgrades host'), IN))
  return lines
}

export function upgradesText(u: UpgradesStatus, now = new Date()): string {
  if (!u.auto) {
    return ['Automatic fixes  off', nextStep('Nothing is upgraded unless asked for. To turn them on:', cmd('upgrades auto on'), IN)].join('\n')
  }
  return [
    'Automatic fixes  on',
    wrap(`A fix — a new patch version of what runs here — applies by itself in the maintenance window, ${u.window}, after a backup, and the people it affects are told when it is scheduled. A new version applies only when asked for.`, IN),
    ...(u.target ? upgradeLines(u, u.target, now) : []),
    nextStep('To move the window:', cmd('upgrades --window "Sun 02:00-04:00"'), IN),
    nextStep('To turn them off:', cmd('upgrades auto off'), IN),
  ].join('\n')
}

function hostServiceText(h: HostServiceReady, why: string, then: string | null): string {
  return [
    wrap(`${why} Its image is signed by the publishing workflow and is now on this machine; nothing else was changed.`),
    wrap("Switch to it in this machine's own shell, not through this command, which runs inside the host service. HQ and the site keep running meanwhile, and everything is kept in the state folder:"),
    '',
    ...h.commands.map(c => `  ${c}`),
    ...(then ? ['', nextStep('Then:', then)] : []),
    ...(h.launcher || h.from === 'dev' ? [] : ['', nextStep('The launcher is off on this machine. To let the host service switch itself:', cmd('upgrades host --launcher on'))]),
  ].join('\n')
}

const ANSWER_MINUTES = 3

/** `upgrades host` with the launcher on: says what happens, asks, then starts it (ADR-0118). */
async function switchHost(call: Ask, io: UpgradeIo, h: HostServiceReady, yes: boolean): Promise<number> {
  io.out(wrap(`Switching the host service from ${h.from} to ${h.version}. Its image is signed by the publishing workflow and is now on this machine. ` +
    `HQ and the site keep running. The host service stops for a minute while the new one starts with the same settings and state folder, ` +
    `and if the new one does not answer within ${ANSWER_MINUTES} minutes, this one is started again as it was.`))
  if (!(await io.confirm('Go ahead?', yes))) return 1
  const started = await call<HostSwitchStarted>({ op: 'upgrades.hostSwitch', version: h.version })
  io.out(wrap(`The launcher is switching it to ${started.version} now; this command ends when the host service stops.`))
  io.out(nextStep('In a few minutes, to see it is on the new version:', cmd('status')))
  return 0
}

function launcherText(on: boolean): string {
  return on
    ? [wrap('The launcher is on: the host service switches itself to a new version, and is put back as it was if the new one does not answer. A new version of HQ or the site moves it first.'),
      nextStep('To switch it by hand instead:', cmd('upgrades host --launcher off'))].join('\n')
    : [wrap('The launcher is off: the host service is switched by hand, with the two commands upgrades host prints, and a new version of HQ or the site waits for that.'),
      nextStep('To let it switch itself:', cmd('upgrades host --launcher on'))].join('\n')
}

/**
 * An upgrade "now" is scheduled the scheduler's lead ahead, like any other, so HQ tells the people it affects and
 * their runs pause after their step before anything stops (spec §11, §14).
 */
async function upgradeSoon(call: Ask, io: UpgradeIo, c: Extract<UpgradeCommand, { kind: 'upgrade' }>, r: UpgradeCheckResult & { version: string }, now: Date): Promise<number> {
  const start = new Date(now.getTime() + SCHEDULED_CHANGE_PAUSE_LEAD_MS)
  const who = r.who.replace(/^The /, 'the ')
  const everyone = r.target === 'hq' ? 'everyone in HQ' : 'the people whose projects run there'
  const stops = r.target === 'hq' ? 'HQ and its site stop' : 'the site stops'
  io.out(wrap(`Upgrading ${who} from ${r.from} to ${r.version}, starting at ${clockText(start)}, ${fromNow(start, now)}. ` +
    `HQ tells ${everyone} now, and until then no new runs start and runs going pause after their current step. ` +
    `${r.hostServiceFirst ? `Then the host service moves to ${r.version} first, by itself, and ${stops}` : `Then ${stops}`} for a few minutes: ` +
    'a sealed backup is taken first, and if it does not come up healthy, everything is put back as it was.'))
  if (!(await io.confirm('Go ahead?', c.yes))) return 1
  const { change } = await call<{ change: ScheduledChange }>({ op: 'schedule', at: start.toISOString(), change: { op: 'upgrade', target: r.target, version: r.version } })
  io.out(wrap(`Scheduled as ${change.id}. ${willBe(change)} at ${clockText(new Date(change.at))}. To see how it went afterwards: ${cmd('status')}`))
  io.out(`To cancel before then: ${cmd(`schedule cancel ${change.id}`)}`)
  return 0
}

/** A development build's upgrade to images built here: asked, then run at once, its steps shown as they go. */
async function upgradeBuilt(call: Ask, io: UpgradeIo, c: Extract<UpgradeCommand, { kind: 'upgradeBuilt' }>): Promise<number> {
  const stops = c.target === 'hq' ? 'HQ and its site stop' : 'The site stops'
  io.out(wrap(`Upgrading ${c.target === 'hq' ? 'HQ and its site' : 'the site'} to ${builtText(c.tag)}, built on this machine, now. ${stops} ` +
    'for a few minutes, and nobody in HQ is told first: a sealed backup is taken, and if it does not come up healthy, everything is put back as it was.'))
  if (!(await io.confirm('Go ahead?', c.yes))) return 1
  const outcome = await call<UpgradeOutcome>({ op: 'upgrades.built', target: c.target, tag: c.tag })
  if (outcome.rolledBack) {
    io.err(wrap(outcome.reason))
    return 1
  }
  io.out(wrap(`Upgraded to ${builtText(c.tag)}.`))
  return 0
}

export async function upgradeCommand(command: UpgradeCommand, call: Ask, io: UpgradeIo, now: Date): Promise<number> {
  if (command.kind === 'upgradeBuilt') return upgradeBuilt(call, io, command)
  if (command.kind === 'upgradesHost') {
    if (command.launcher !== undefined) {
      const u = await call<UpgradesStatus>({ op: 'upgrades.set', launcher: command.launcher })
      io.out(launcherText(u.launcher))
      return 0
    }
    if (command.image !== undefined) return builtHostCommand(call, io, command.image, command.yes)
    const h = await call<HostServiceReady>({ op: 'upgrades.hostService' })
    if (h.launcher) return switchHost(call, io, h, command.yes)
    io.out(hostServiceText(h, `The host service ${h.version} is published.`, null))
    return 0
  }
  if (command.kind === 'upgrades') {
    const set = command.auto !== undefined || command.window !== undefined
    const u = await call<UpgradesStatus>(set ? { op: 'upgrades.set', auto: command.auto, window: command.window } : { op: 'upgrades.status' })
    io.out(upgradesText(u, now))
    return 0
  }
  const at = command.at === undefined ? null : atTime(command.at, now)
  if (at && 'problem' in at) {
    io.err(wrap(at.problem))
    return 2
  }
  const r = await call<UpgradeCheckResult>({ op: 'upgrades.check', target: command.target, version: command.version })
  if (!r.version) {
    io.out(wrap(`${r.who} is on ${r.from}, the newest published version. Nothing to upgrade.`))
    return 0
  }
  if (r.hostServiceFirst && !r.launcher) {
    const h = await call<HostServiceReady>({ op: 'upgrades.hostService', version: r.version })
    const what = r.target === 'hq' ? 'HQ' : 'The site'
    io.out(hostServiceText(h, `${what} ${r.version} needs the host service ${h.version} first; this one is older.`, cmd(`${r.target} upgrade ${r.version}${command.at ? ` --at "${command.at}"` : ''}`)))
    return 1
  }
  if (at) {
    const { change } = await call<{ change: ScheduledChange }>({ op: 'schedule', at: at.at, change: { op: 'upgrade', target: r.target, version: r.version } })
    io.out(scheduledDone(change, now))
    if (r.hostServiceFirst) io.out(wrap(`At that time the host service moves to ${r.version} first, by itself, then the upgrade runs.`))
    return 0
  }
  return upgradeSoon(call, io, command, { ...r, version: r.version }, now)
}
