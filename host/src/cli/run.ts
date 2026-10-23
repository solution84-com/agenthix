/**
 * Runs one CLI command against the owner socket and prints what a person reads. Every exit code means one
 * thing: 0 done, 1 refused or failed, 2 not a command, 3 the host service does not answer.
 */
import type { HostRefusal, LogLineFigure } from '@agenthix/core'
import type { Progress } from '../sockets/lineServer'
import type { MachineStatus } from '../status/machineStatus'
import type { HqLinkResult, InstallResult } from '../owner/results'
import { addressProblem, DEFAULT_ADDRESS, isLocalAddress } from '../install/address'
import type { Command } from './commands'
import {
  ADDRESS_QUESTION, INVITATION_QUESTION, helpText, installDone, linkMade, localAddressNote, userNotFound,
} from './messages'
import { hostContainer } from './hostContainer'
import { capacityChanged, capacityText, setCapacityFrom } from './capacity'
import type { HostFigures } from '@agenthix/core'
import type { FrontDoorCheck } from '../frontDoor/frontDoor'
import { frontDoorOffText, frontDoorOnText, frontDoorShow, frontDoorWarning, LEFT_OFF, NO_ONE_TO_ASK } from './frontDoorText'
import { statusText, type StatusWithBackups } from './statusText'
import { backupCommand } from './backups'
import { cmd, product, wrap } from './words'
import type { ScheduledChange } from '@agenthix/core'
import { atTime, resizeRequest, scheduleCancelled, scheduleChanged, scheduledDone, scheduledText } from './scheduled'
import { upgradeCommand } from './upgrades'
import { lifecycleCommand } from './lifecycle'
import { consoleCommand } from './console'
import { hqAddressCommand } from './hqAddress'
import { moveCommand, moveRecoverCommand } from './move'
import { cloudCommand } from './cloud'
import { providerCommand, type ProviderAnswer } from './provider'
import { uninstallCommand } from './uninstall'
import { joined, joinWaiting } from './consoleWords'

export type Io = {
  out: (text: string) => void
  /** Without a line end, for a step whose outcome follows on the same line. */
  write: (text: string) => void
  err: (text: string) => void
  /** A line from the person; null when there is no one to ask (no terminal, or input closed). */
  ask: (prompt: string) => Promise<string | null>
  /** As `ask`, not shown as it is typed: for a key. Without it, `ask` stands in (a test, or input piped in). */
  secret?: (prompt: string) => Promise<string | null>
}

export type Send = (request: unknown, onProgress: (p: Progress) => void) => Promise<Record<string, unknown>>

class Refused extends Error {
  constructor(readonly refusal: HostRefusal) {
    super(refusal.message)
  }
}

async function call<T>(send: Send, io: Io, request: unknown): Promise<T> {
  let open = false
  const answer = await send(request, p => {
    if (p.event === 'step') {
      io.write(`${p.step} ${'.'.repeat(Math.max(3, 52 - p.step.length))} `)
      open = true
    } else if (p.event === 'stepDone') {
      io.out(p.outcome)
      open = false
    } else if (p.event === 'join') io.out(joinWaiting(p.machine, p.fingerprint))
    else if (p.event === 'joined') io.out(joined(p.machine, p.consoleFingerprint, p.hqAddress))
    else io.out(p.text.includes('\n') ? p.text : wrap(p.text))
  })
  if (open) io.out('')
  if (answer.ok !== true) throw new Refused((answer.refusal as HostRefusal) ?? { code: 'failed', message: 'The host service refused.' })
  return answer.result as T
}

async function confirm(io: Io, question: string, yes: boolean): Promise<boolean> {
  if (yes) return true
  const answer = await io.ask(`${question} [y/N] `)
  if (answer === null) {
    io.err(wrap('Nothing to ask with: run it in a terminal, or add --yes.'))
    return false
  }
  return /^y(es)?$/i.test(answer.trim())
}

/** A confirmation whose "no" ends the command: it says so, since nothing else would. */
async function confirmOrLeave(io: Io, question: string, yes: boolean): Promise<boolean> {
  if (await confirm(io, question, yes)) return true
  io.out('Nothing was changed.')
  return false
}

async function chooseAddress(io: Io, command: Extract<Command, { kind: 'install' }>): Promise<string | null> {
  if (command.address) return command.address
  io.out(['One question. Press Enter to take the answer in brackets.', '', ...ADDRESS_QUESTION].join('\n'))
  for (;;) {
    const typed = command.yes ? '' : await io.ask(`[${DEFAULT_ADDRESS}] `)
    if (typed === null) {
      io.err(wrap('Nothing to ask with: run it in a terminal, or give the answer with --address <address>.'))
      return null
    }
    const address = typed.trim() || DEFAULT_ADDRESS
    const problem = addressProblem(address)
    if (!problem) return address
    io.err(wrap(`HQ cannot be at ${address}: ${problem}.`))
    if (command.yes) return null
  }
}

async function install(send: Send, io: Io, command: Extract<Command, { kind: 'install' }>): Promise<number> {
  const before = await call<MachineStatus>(send, io, { op: 'machine.status' })
  const machine = before.machine.name
  io.out(`${product} ${before.machine.hostServiceVersion} — installing on ${machine}.`)
  let address: string | null
  if (before.hq) {
    address = before.hq.address
    io.out(wrap(`HQ is already installed here, at ${address}. Nothing to ask: what is stopped starts again, and nothing that is set changes.`))
  } else {
    address = await chooseAddress(io, command)
    if (!address) return 1
    if (isLocalAddress(address)) io.out(localAddressNote(address, machine))
    io.out(wrap(`HQ always comes with a site, ${machine}, where agents work; nothing to ask.`))
  }
  io.out('')
  const result = await call<InstallResult>(send, io, { op: 'machine.install', address })
  io.out('')
  io.out(installDone(result, machine))
  return 0
}

async function inviteAdmin(send: Send, io: Io, yes: boolean): Promise<number> {
  const status = await call<MachineStatus>(send, io, { op: 'machine.status' })
  const people = status.hq?.answer?.users ?? 0
  if (status.hq?.answer && people > 0) {
    io.out(INVITATION_QUESTION(people))
    if (!(await confirmOrLeave(io, 'Make it?', yes))) return 1
  }
  const made = await call<HqLinkResult>(send, io, { op: 'hq.inviteAdmin' })
  io.out(linkMade(made, status.hq?.address ?? ''))
  return 0
}

async function frontDoor(send: Send, io: Io, command: Extract<Command, { kind: 'frontDoor' }>): Promise<number> {
  const status = await call<MachineStatus>(send, io, { op: 'machine.status' })
  const check = await call<FrontDoorCheck>(send, io, { op: 'frontDoor.check', filesHost: command.filesHost })
  if (command.action === 'show') {
    io.out(frontDoorShow(check, status.frontDoor?.hosts ?? []))
    return 0
  }
  if (command.action === 'off') {
    await call(send, io, { op: 'frontDoor.set', on: false })
    io.out(frontDoorOffText(check, check.on))
    return 0
  }
  // A refusal needs no question, so it comes first; the service makes the same checks again before it acts.
  if (check.refusal) throw new Refused(check.refusal)
  if (!check.on) {
    io.out(frontDoorWarning(check, status.machine.name))
    if (!command.takePorts) {
      const answer = await io.ask('Turn the front door on? [y/N] ')
      if (answer === null) {
        io.err(NO_ONE_TO_ASK)
        return 1
      }
      if (!/^y(es)?$/i.test(answer.trim())) {
        io.out(LEFT_OFF)
        return 1
      }
    }
  }
  await call(send, io, { op: 'frontDoor.set', on: true, confirmPorts: true, filesHost: command.filesHost })
  io.out(frontDoorOnText(check))
  return 0
}

function logLines(lines: LogLineFigure[]): string {
  if (lines.length === 0) return 'No log lines yet.'
  const width = Math.max(...lines.map(l => l.service.length))
  return lines.map(l => `${l.service.padEnd(width)}  ${l.at}  ${l.message}`).join('\n')
}

async function scheduled(command: Extract<Command, { kind: 'scheduled' | 'scheduleCancel' | 'scheduleChange' | 'schedule' }>, send: Send, io: Io, now: Date): Promise<number> {
  if (command.kind === 'scheduled') {
    const r = await call<{ machine: string; changes: ScheduledChange[] }>(send, io, { op: 'scheduled.list' })
    io.out(scheduledText(r.changes, r.machine, now))
    return 0
  }
  if (command.kind === 'scheduleCancel') {
    const r = await call<{ change: ScheduledChange }>(send, io, { op: 'schedule.cancel', changeId: command.id })
    io.out(scheduleCancelled(r.change, now))
    return 0
  }
  const at = atTime(command.at, now)
  if ('problem' in at) {
    io.err(wrap(at.problem))
    return 2
  }
  if (command.kind === 'scheduleChange') {
    const r = await call<{ change: ScheduledChange }>(send, io, { op: 'schedule.change', changeId: command.id, at: at.at })
    io.out(scheduleChanged(r.change, now))
    return 0
  }
  const figures = await call<HostFigures>(send, io, { op: 'figures.read' })
  const r = await call<{ change: ScheduledChange }>(send, io, resizeRequest(figures, command.change.capacity, at.at))
  io.out(scheduledDone(r.change, now))
  return 0
}

export async function runCommand(command: Command, send: Send, io: Io, version: string, now: () => Date = () => new Date()): Promise<number> {
  try {
    switch (command.kind) {
      case 'help':
        io.out(helpText(version, command.topic))
        return 0
      case 'usage':
        io.err(`${wrap(command.message)}\n${cmd('help')} lists every command.`)
        return 2
      case 'status':
        io.out(statusText(await call<StatusWithBackups>(send, io, { op: 'machine.status' })))
        return 0
      case 'install':
        return await install(send, io, command)
      case 'inviteAdmin':
        return await inviteAdmin(send, io, command.yes)
      case 'resetPassword': {
        const status = await call<MachineStatus>(send, io, { op: 'machine.status' })
        const made = await call<HqLinkResult>(send, io, { op: 'hq.resetPassword', user: command.user })
        io.out(linkMade(made, status.hq?.address ?? '', command.user))
        return 0
      }
      case 'capacity': {
        const figures = await call<HostFigures>(send, io, { op: 'figures.read' })
        io.out(capacityText(figures.machine.name, figures.ceilings))
        return 0
      }
      case 'capacitySet':
        io.out(capacityChanged(await setCapacityFrom(request => call(send, io, request), command.change)))
        return 0
      case 'frontDoor':
        return await frontDoor(send, io, command)
      case 'backupNow':
      case 'backupExport':
      case 'backupLocation':
      case 'restore':
        return await backupCommand(command, request => call(send, io, request), { ...io, confirm: q => confirm(io, q, false) })
      case 'scheduled':
      case 'scheduleCancel':
      case 'scheduleChange':
      case 'schedule':
        return await scheduled(command, send, io, now())
      case 'upgrade':
      case 'upgrades':
      case 'upgradesHost':
        return await upgradeCommand(command, request => call(send, io, request), { ...io, confirm: (q, yes) => confirmOrLeave(io, q, yes) }, now())
      case 'suspend':
      case 'resume':
      case 'erase':
      case 'restoreErased':
        return await lifecycleCommand(command, request => call(send, io, request), { ...io, confirm: q => confirmOrLeave(io, q, false) }, now())
      case 'consoleConnect':
      case 'consoleDisconnect':
      case 'consoleInstall':
      case 'consoleRemove':
      case 'consoleCode':
      case 'fleetAdmin':
        return await consoleCommand(command, request => call(send, io, request), { ...io, confirm: (q, yes) => confirmOrLeave(io, q, yes) }, now())
      case 'hqAddress':
      case 'siteHqAddress':
      case 'consoleHqAddress':
        return await hqAddressCommand(command, request => call(send, io, request), { ...io, confirm: (q, yes) => confirmOrLeave(io, q, yes) })
      case 'moveCode':
        return await moveCommand(command, request => call(send, io, request), io, now())
      case 'moveRecover':
        return await moveRecoverCommand(command, request => call(send, io, request), { ...io, confirm: (q, yes) => confirmOrLeave(io, q, yes) })
      case 'cloudConnect':
      case 'cloudDisconnect':
      case 'remoteOn':
      case 'remoteOff':
      case 'resetCode':
        return await cloudCommand(command, request => call(send, io, request), { ...io, confirm: (q, yes) => confirmOrLeave(io, q, yes) })
      case 'providerAdd':
      case 'providerList':
      case 'providerRemove':
        return await providerCommand(command, request => call<ProviderAnswer>(send, io, request), {
          ...io, secret: io.secret ?? io.ask, confirm: (q, yes) => confirmOrLeave(io, q, yes),
        })
      case 'uninstall':
        return await uninstallCommand(command, request => call(send, io, request), { ...io, confirm: (q, yes) => confirmOrLeave(io, q, yes) })
      case 'logs': {
        const r = await call<{ lines: LogLineFigure[] }>(send, io, { op: 'logs.read', target: command.target, service: command.service, limit: command.lines })
        io.out(logLines(r.lines))
        return 0
      }
    }
  } catch (err) {
    if (err instanceof Refused) {
      const user = command.kind === 'resetPassword' || command.kind === 'fleetAdmin' ? command.user : null
      io.err(user !== null && err.refusal.code === 'not_found' ? userNotFound(user) : wrap(err.refusal.message))
      return 1
    }
    io.err(wrap(`The host service is not answering inside its container. Restart it with: docker restart ${hostContainer()}`))
    return 3
  }
}
