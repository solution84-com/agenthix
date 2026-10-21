/**
 * `agenthix hq|site suspend|resume [--at <time>]`, `hq erase [--on <date>]`, `site erase` and `hq|site restore`
 * (host-management spec §15; the CLI board's *Warnings that ask before acting* and *agenthix help*). An erase says
 * what goes, what is kept and until when, then asks for HQ's address — or, for a site, its name — typed in; a
 * mistyped one erases nothing.
 */
import type { HostTarget, ScheduledChange } from '@agenthix/core'
import type { RestoreResult } from '../backups/restore'
import type { StatusWithBackups } from './statusText'
import type { Ask } from './backups'
import { atTime, scheduledDone } from './scheduled'
import {
  daysLeft, erasedHq, erasedSite, hqEraseOnWarning, hqEraseWarning, resumedText, scheduledErase, siteEraseWarning,
  suspendedText, type EraseFacts,
} from './lifecycleWords'
import { fullDate } from './backupWords'
import { cmd, wrap } from './words'

export type LifecycleCommand =
  | { kind: 'suspend' | 'resume'; target: HostTarget; at?: string }
  | { kind: 'erase'; target: HostTarget; on?: string }
  | { kind: 'restoreErased'; target: HostTarget }

type Usage = { kind: 'usage'; message: string }

export const LIFECYCLE_VERBS = ['suspend', 'resume', 'erase', 'restore'] as const

function timeOption(args: string[], name: string): { value?: string; bad: boolean } {
  if (args.length === 0) return { bad: false }
  if (args.length === 2 && args[0] === name && !args[1].startsWith('--')) return { value: args[1], bad: false }
  return { bad: true }
}

/** `hq|site <verb> …`, for the verbs this file owns. */
export function parseLifecycle(target: HostTarget, verb: typeof LIFECYCLE_VERBS[number], args: string[]): LifecycleCommand | Usage {
  if (verb === 'suspend' || verb === 'resume') {
    const at = timeOption(args, '--at')
    return at.bad ? { kind: 'usage', message: `${target} ${verb} takes --at <time>, or nothing to ${verb} now.` } : { kind: verb, target, at: at.value }
  }
  if (verb === 'erase') {
    if (target === 'site') return args.length ? { kind: 'usage', message: 'Erasing a site is at once; site erase takes nothing more.' } : { kind: 'erase', target }
    const on = timeOption(args, '--on')
    return on.bad ? { kind: 'usage', message: 'hq erase takes --on <date and time>, or nothing to erase at once.' } : { kind: 'erase', target, on: on.value }
  }
  return args.length ? { kind: 'usage', message: `${target} restore takes nothing more.` } : { kind: 'restoreErased', target }
}

export type LifecycleIo = {
  out: (text: string) => void
  err: (text: string) => void
  ask: (prompt: string) => Promise<string | null>
  confirm: (question: string) => Promise<boolean>
}

const NO_ONE = 'Nothing to ask with: run it in a terminal, where you can type the answer.'

async function eraseHq(call: Ask, io: LifecycleIo, on: string | undefined, now: Date): Promise<number> {
  const status = await call<StatusWithBackups>({ op: 'machine.status' })
  if (!status.hq) {
    io.err(wrap(`No HQ here: ${status.machine.name} runs no HQ, so there is no HQ to erase.`))
    return 1
  }
  const facts: EraseFacts = {
    address: status.hq.address, machine: status.machine.name, siteName: status.site?.name ?? status.machine.name,
    location: status.backups?.location?.path ?? null, people: status.hq.answer?.users ?? null,
  }
  let at: Date | null = null
  if (on) {
    const parsed = atTime(on, now)
    if ('problem' in parsed) {
      io.err(wrap(parsed.problem))
      return 2
    }
    at = new Date(parsed.at)
  }
  io.out(at ? hqEraseOnWarning(facts, at, now) : hqEraseWarning(facts))
  const typed = await io.ask("To confirm, type HQ's address: ")
  if (typed === null) {
    io.err(wrap(NO_ONE))
    return 1
  }
  const change = { op: 'erase', target: 'hq', confirmAddress: typed.trim() }
  if (at) {
    const r = await call<{ change: ScheduledChange }>({ op: 'schedule', at: at.toISOString(), change })
    io.out(scheduledErase(r.change.id, at, now))
    return 0
  }
  const r = await call<{ purgeAfter: string }>(change)
  io.out(erasedHq(r.purgeAfter))
  return 0
}

async function eraseSite(call: Ask, io: LifecycleIo): Promise<number> {
  const status = await call<StatusWithBackups>({ op: 'machine.status' })
  if (!status.site) {
    io.err(wrap(`No site runs on ${status.machine.name}, so there is no site to erase.`))
    return 1
  }
  if (status.hq) {
    io.err(wrap(`The site ${status.site.name} carries HQ here, so it is erased only with HQ: ${cmd('hq erase')}`))
    return 1
  }
  io.out(siteEraseWarning(status.site.name, status.machine.name))
  const typed = await io.ask("To confirm, type the site's name: ")
  if (typed === null) {
    io.err(wrap(NO_ONE))
    return 1
  }
  if (typed.trim() !== status.site.name) {
    io.err(wrap("Not erased: that is not the site's name. Nothing changed."))
    return 1
  }
  const r = await call<{ purgeAfter: string; hqTold: boolean | null }>({ op: 'erase', target: 'site' })
  io.out(erasedSite(status.site.name, r.purgeAfter, r.hqTold === true, null))
  return 0
}

async function restoreErased(call: Ask, io: LifecycleIo, target: HostTarget, now: Date): Promise<number> {
  const status = await call<StatusWithBackups>({ op: 'machine.status' })
  const entry = status.lifecycle?.erased.find(e => e.target === target)
  if (entry) {
    const what = target === 'hq' ? `HQ at ${entry.hqAddress}` : `The site ${entry.siteName}`
    const left = daysLeft(entry.purgeAfter, now)
    io.out(wrap(`${what} was erased on ${fullDate(new Date(entry.erasedAt))}. Its final backup is kept for ${left} more day${left === 1 ? '' : 's'}.`))
    if (!(await io.confirm(`Restore it on ${status.machine.name}?`))) return 1
  }
  const r = await call<RestoreResult>({ op: 'erased.restore', target })
  io.out(r.hqAddress
    ? wrap(`Restored. ${r.hqAnswers ? `HQ answers at ${r.hqAddress}` : `HQ is starting at ${r.hqAddress}`}. Its sites reconnect by themselves.`)
    : wrap(`Restored. The site ${r.siteName} reconnects to HQ by itself.`))
  return 0
}

export async function lifecycleCommand(command: LifecycleCommand, call: Ask, io: LifecycleIo, now: Date): Promise<number> {
  switch (command.kind) {
    case 'suspend':
    case 'resume': {
      const change = { op: command.kind, target: command.target }
      if (!command.at) {
        await call(change)
        io.out(command.kind === 'suspend' ? suspendedText(command.target) : resumedText(command.target))
        return 0
      }
      const at = atTime(command.at, now)
      if ('problem' in at) {
        io.err(wrap(at.problem))
        return 2
      }
      const r = await call<{ change: ScheduledChange }>({ op: 'schedule', at: at.at, change })
      io.out(scheduledDone(r.change, now))
      return 0
    }
    case 'erase':
      return command.target === 'hq' ? eraseHq(call, io, command.on, now) : eraseSite(call, io)
    case 'restoreErased':
      return restoreErased(call, io, command.target, now)
  }
}
