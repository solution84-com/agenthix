/**
 * `agenthix scheduled`, `agenthix schedule change|cancel <id>` and `agenthix hq|site schedule <change> --at <time>`
 * (host-management spec §14; the CLI board's *agenthix scheduled* and *agenthix help*). Times are the machine's,
 * typed as a person writes them and said back in words. Each change is its own word: resize today; upgrade,
 * restore, move and erase as this version learns them.
 */
import type { HostCeilings, HostFigures, ScheduledChange } from '@agenthix/core'
import { SCHEDULED_CHANGE_PAUSE_LEAD_MS } from '@agenthix/core'
import { parseCapacity, type CapacityChange } from './capacity'
import { clockText, dayText, fromNow, parseTime, whenColumn, whenText } from '../scheduled/time'
import { changeName, scheduledByText, whoIsTold, willBe } from '../scheduled/words'
import { cmd, wrap } from './words'
import { parseUpgrade, type UpgradeCommand } from './upgrades'
import type { LifecycleCommand } from './lifecycle'
import type { MoveCommand } from './move'

export type ScheduledCommand =
  | { kind: 'scheduled' }
  | { kind: 'scheduleCancel'; id: string }
  | { kind: 'scheduleChange'; id: string; at: string }
  | { kind: 'schedule'; target: 'hq' | 'site'; change: { kind: 'resize'; capacity: CapacityChange }; at: string }

export type Usage = { kind: 'usage'; message: string }

// Clear of the nightly backup at 02:00, which a change at that time waits for.
const AT_EXAMPLE = '--at "Sun 18 Oct 04:00"'
const LATER = ['restore']

function takeAt(args: string[]): { at?: string; rest: string[] } {
  const i = args.indexOf('--at')
  if (i < 0 || args[i + 1] === undefined || args[i + 1].startsWith('--')) return { rest: args }
  return { at: args[i + 1], rest: [...args.slice(0, i), ...args.slice(i + 2)] }
}

/** `agenthix schedule …`: change or cancel one by its number. */
export function parseSchedule(args: string[]): ScheduledCommand | Usage {
  const [verb, id, ...rest] = args
  if (verb === 'cancel') {
    return id && rest.length === 0 && /^\d+$/.test(id) ? { kind: 'scheduleCancel', id } : { kind: 'usage', message: `Say which, by its number in ${cmd('scheduled')}: ${cmd('schedule cancel 7')}` }
  }
  if (verb === 'change') {
    const at = takeAt(rest)
    if (!id || !/^\d+$/.test(id) || !at.at || at.rest.length) {
      return { kind: 'usage', message: `Say which and when: ${cmd(`schedule change 7 ${AT_EXAMPLE}`)}` }
    }
    return { kind: 'scheduleChange', id, at: at.at }
  }
  return { kind: 'usage', message: `To schedule a change: ${cmd('site schedule resize --memory 6GB --at <time>')}. To see what is scheduled: ${cmd('scheduled')}` }
}

/** `agenthix hq|site schedule <change> --at <time> …`. */
export function parseScheduleChange(target: 'hq' | 'site', args: string[]): ScheduledCommand | UpgradeCommand | LifecycleCommand | MoveCommand | Usage {
  const [change, ...rest] = args
  const at = takeAt(rest)
  if (change === 'resize') {
    if (target === 'hq') return { kind: 'usage', message: `A resize is the site's: ${cmd('site schedule resize --memory 6GB --at <time>')}` }
    const capacity = parseCapacity(['set', ...at.rest])
    if (capacity.kind === 'usage') return { kind: 'usage', message: capacity.message.replace(/capacity set/g, 'site schedule resize') }
    if (capacity.kind !== 'capacitySet') return { kind: 'usage', message: 'Say what to resize to.' }
    if (!at.at) return { kind: 'usage', message: `Say when, in this machine's time: ${cmd(`site schedule resize --memory 6GB ${AT_EXAMPLE}`)}` }
    return { kind: 'schedule', target, change: { kind: 'resize', capacity: capacity.change }, at: at.at }
  }
  if (change === 'upgrade') {
    const upgrade = parseUpgrade(target, rest)
    if (upgrade.kind === 'upgrade' && !upgrade.at) return { kind: 'usage', message: `Say when, in this machine's time: ${cmd(`${target} schedule upgrade ${AT_EXAMPLE}`)}` }
    return upgrade.kind === 'usage' ? { kind: 'usage', message: upgrade.message.replace(`${target} upgrade`, `${target} schedule upgrade`) } : upgrade
  }
  if (change === 'suspend' || change === 'resume') {
    return at.at && at.rest.length === 0
      ? { kind: change, target, at: at.at }
      : { kind: 'usage', message: `Say when, in this machine's time: ${cmd(`${target} schedule ${change} ${AT_EXAMPLE}`)}` }
  }
  if (change === 'erase') {
    if (target === 'site') return { kind: 'usage', message: `Erasing a site is at once: ${cmd('site erase')}` }
    return at.at && at.rest.length === 0
      ? { kind: 'erase', target, on: at.at }
      : { kind: 'usage', message: `Say when, in this machine's time: ${cmd(`hq erase --on "Fri 16 Oct 18:00"`)}` }
  }
  if (change === 'move') {
    if (target === 'hq') {
      const i = at.rest.indexOf('--address')
      const address = i >= 0 ? at.rest[i + 1] : undefined
      const others = i >= 0 ? [...at.rest.slice(0, i), ...at.rest.slice(i + 2)] : at.rest
      if (!at.at || others.length || (i >= 0 && (!address || address.startsWith('--')))) {
        return { kind: 'usage', message: `Say when, in this machine's time, and HQ's new address if it changes: ${cmd(`hq schedule move ${AT_EXAMPLE} --address http://192.168.1.30:7800`)}` }
      }
      return { kind: 'moveCode', target: 'hq', at: at.at, ...(address ? { hqAddress: address } : {}) }
    }
    return at.at && at.rest.length === 0
      ? { kind: 'moveCode', at: at.at }
      : { kind: 'usage', message: `Say when, in this machine's time: ${cmd(`site schedule move ${AT_EXAMPLE}`)}` }
  }
  if (change && LATER.includes(change)) {
    return { kind: 'usage', message: `This version cannot schedule ${/^[aeiou]/.test(change) ? 'an' : 'a'} ${change} yet; it can schedule an upgrade, a suspend or resume, HQ's erase, or a resize of the site.` }
  }
  return { kind: 'usage', message: `Say which change, then when: ${cmd(`site schedule resize --memory 6GB ${AT_EXAMPLE}`)}` }
}

/** One line of the list: `  7   Fri 16 Oct 18:00   Erase HQ               scheduled by Sam Rivera`. */
export function scheduledLine(c: ScheduledChange, now: Date): string {
  const state = c.state === 'pausing' ? '  runs pausing now' : c.state === 'running' ? '  running now' : ''
  return `  ${c.id.padEnd(4)}${whenColumn(new Date(c.at), now).padEnd(19)}${changeName(c).padEnd(21)}  ${scheduledByText(c)}${state}`
}

export function scheduledText(changes: ScheduledChange[], machine: string, now: Date): string {
  if (changes.length === 0) {
    return `Nothing is scheduled on ${machine}.\n${wrap(`To schedule a change: ${cmd('site schedule resize --memory 6GB --at <time>')}`)}`
  }
  return changes.map(c => scheduledLine(c, now)).join('\n')
}

function pauseFrom(c: ScheduledChange): string {
  return clockText(new Date(Date.parse(c.at) - SCHEDULED_CHANGE_PAUSE_LEAD_MS))
}

export function scheduledDone(c: ScheduledChange, now: Date): string {
  const at = new Date(c.at)
  return [
    wrap(`Scheduled. ${willBe(c)} on ${whenText(at, now)}, ${fromNow(at, now)}. HQ tells ${whoIsTold(c)} now. ` +
      `From ${pauseFrom(c)} no new runs start ${c.target === 'hq' ? 'anywhere' : 'there'}; runs going then pause and carry on afterwards.`),
    `To change the time: ${cmd(`schedule change ${c.id} --at <time>`)}`,
    `To cancel before then: ${cmd(`schedule cancel ${c.id}`)}`,
  ].join('\n')
}

export function scheduleChanged(c: ScheduledChange, now: Date): string {
  const at = new Date(c.at)
  return wrap(`Changed. ${willBe(c).replace(' will be ', ' will now be ')} on ${whenText(at, now)}, ${fromNow(at, now)}. HQ tells ${whoIsTold(c)} the new time.`)
}

export function scheduleCancelled(c: ScheduledChange, now: Date): string {
  return wrap(`Cancelled. ${willBe(c, true)} on ${dayText(new Date(c.at), now)}. HQ tells ${whoIsTold(c)} that it is off.`)
}

/** The time `--at` names, or why it is not one. */
export function atTime(text: string, now: Date): { at: string } | { problem: string } {
  const parsed = parseTime(text, now)
  if (!parsed.ok) return { problem: parsed.problem }
  return { at: parsed.at.toISOString() }
}

/** The request `site schedule resize` sends: the machine's ceilings with the change applied, whole. */
export function resizeRequest(figures: HostFigures, change: CapacityChange, at: string): { op: 'schedule'; at: string; change: { op: 'capacity.set'; ceilings: HostCeilings } } {
  return { op: 'schedule', at, change: { op: 'capacity.set', ceilings: { ...figures.ceilings, ...change } } }
}
