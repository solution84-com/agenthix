/**
 * `agenthix console connect|disconnect|install|port|remove` and `agenthix hq console-code|fleet-admin` (host-management spec §6,
 * §7, §9). Each asks before it changes anything that cannot simply be taken back, and takes --yes from a script.
 */
import { normalizeJoinCode } from '@agenthix/core'
import type { StatusWithBackups } from './statusText'
import type { Ask } from './backups'
import type { ConnectResult, DisconnectResult } from '../link/manage'
import type { ConsoleInstallResult, ConsoleRemoveCheck, ConsoleRemoved } from '../install/console'
import type { ConsolePortResult } from '../install/consolePort'
import type { FleetAdminResult, ConsoleCodeResult } from '../owner/consoleOps'
import type { ManagementStatus } from '../link/status'
import { addressProblem } from '../install/address'
import {
  connected, disconnected, disconnectWarning, fleetAdminQuestion, fleetAdminRemoveQuestion, consoleCodeMade, consoleCodeQuestion, consoleInstalled,
  consoleInstallWarning, consoleRetiredHere, noMachinesMade, noMachinesQuestion,
} from './consoleWords'
import { consoleRemoved, consoleRemoveWarning } from './consoleRemoveWords'
import { wrap } from './words'
import { portOptions } from './portOptions'

export type ConsoleCommand =
  | { kind: 'consoleConnect'; address: string; code: string; hqPort?: number; consolePort?: number }
  | { kind: 'consoleDisconnect'; yes: boolean }
  | { kind: 'consoleInstall'; address: string; code: string; yes: boolean; consolePort?: number }
  | { kind: 'consoleRemove'; yes: boolean }
  | { kind: 'consolePort'; port: number }
  | { kind: 'consoleCode'; yes: boolean; noMachines?: true }
  | { kind: 'fleetAdmin'; user: string; yes: boolean; remove?: true }

type Usage = { kind: 'usage'; message: string }

function withYes(args: string[]): { yes: boolean; rest: string[] } {
  return { yes: args.includes('--yes'), rest: args.filter(a => a !== '--yes') }
}

function addressAndCode(verb: string, args: string[]): { address: string; code: string } | Usage {
  const usage: Usage = { kind: 'usage', message: `Give HQ's address and the code: console ${verb} <hq address> <code>` }
  if (args.length !== 2) return usage
  const [address, code] = args
  const problem = addressProblem(address)
  if (problem) return { kind: 'usage', message: `HQ cannot be at ${address}: ${problem}.` }
  if (!normalizeJoinCode(code)) return { kind: 'usage', message: `"${code}" is not a code: a code is twelve letters and digits, like 7KQ4-M2XD-46Q3.` }
  return { address, code }
}

/** `console <verb> …`. */
export function parseConsole(verb: string | undefined, args: string[]): ConsoleCommand | Usage {
  const { yes, rest } = withYes(args)
  if (verb === 'connect') {
    const ports = portOptions(args, ['--hq-port', '--console-port'])
    if ('problem' in ports) return { kind: 'usage', message: ports.problem }
    const r = addressAndCode('connect', ports.rest)
    return 'kind' in r ? r : { kind: 'consoleConnect', ...r, ...ports.ports }
  }
  if (verb === 'install') {
    const ports = portOptions(rest, ['--console-port'])
    if ('problem' in ports) return { kind: 'usage', message: ports.problem }
    const r = addressAndCode('install', ports.rest)
    return 'kind' in r ? r : { kind: 'consoleInstall', ...r, yes, ...ports.ports }
  }
  if (verb === 'port') {
    const port = args.length === 1 && /^\d{1,5}$/.test(args[0]) ? Number(args[0]) : NaN
    return Number.isInteger(port) && port >= 1 && port <= 65535
      ? { kind: 'consolePort', port }
      : { kind: 'usage', message: 'Give the port to move the Fleet Console to: console port <port>' }
  }
  if (verb === 'remove') return rest.length ? { kind: 'usage', message: 'console remove takes nothing more.' } : { kind: 'consoleRemove', yes }
  if (verb === 'disconnect') return rest.length ? { kind: 'usage', message: 'console disconnect takes nothing more.' } : { kind: 'consoleDisconnect', yes }
  return { kind: 'usage', message: `There is no command "console ${[verb, ...args].filter(Boolean).join(' ')}".` }
}

/** `hq console-code` and `hq fleet-admin <user>`. */
export function parseHqConsole(verb: 'console-code' | 'fleet-admin', args: string[]): ConsoleCommand | Usage {
  const { yes, rest } = withYes(args)
  if (verb === 'console-code') {
    const noMachines = rest.includes('--no-machines')
    const others = rest.filter(a => a !== '--no-machines')
    if (others.length) return { kind: 'usage', message: 'hq console-code takes nothing more but --no-machines.' }
    return noMachines ? { kind: 'consoleCode', yes, noMachines: true } : { kind: 'consoleCode', yes }
  }
  const remove = rest.includes('--remove')
  const names = rest.filter(a => a !== '--remove')
  if (names.length !== 1) return { kind: 'usage', message: 'Give the name the person types at sign-in: hq fleet-admin [--remove] <user>' }
  return remove ? { kind: 'fleetAdmin', user: names[0], yes, remove: true } : { kind: 'fleetAdmin', user: names[0], yes }
}

export type ConsoleIo = {
  out: (text: string) => void
  err: (text: string) => void
  confirm: (question: string, yes: boolean) => Promise<boolean>
}

type WithManagement = StatusWithBackups & { management?: ManagementStatus }

export async function consoleCommand(command: ConsoleCommand, call: Ask, io: ConsoleIo, now: Date): Promise<number> {
  switch (command.kind) {
    case 'consoleConnect': {
      // The waiting and the confirmation are printed as they happen (run.ts); what is left comes after.
      io.out(connected(await call<ConnectResult>({ op: 'console.connect', address: command.address, code: command.code, hqPort: command.hqPort, consolePort: command.consolePort })))
      return 0
    }
    case 'consoleDisconnect': {
      const status = await call<WithManagement>({ op: 'machine.status' })
      if (status.hq || !status.management?.managedBy) {
        await call({ op: 'console.disconnect' })
        return 0
      }
      io.out(disconnectWarning(status.machine.name, status.site?.name ?? null))
      if (!(await io.confirm('Disconnect?', command.yes))) return 1
      io.out(disconnected(await call<DisconnectResult>({ op: 'console.disconnect' })))
      return 0
    }
    case 'consoleInstall': {
      const status = await call<WithManagement>({ op: 'machine.status' })
      const here = status.management?.consoleHere?.address
      io.out(consoleInstallWarning(status.machine.name, command.consolePort ?? (here ? Number(new URL(here).port) : undefined)))
      if (!(await io.confirm('Start it here?', command.yes))) return 1
      io.out(consoleInstalled(await call<ConsoleInstallResult>({
        op: 'console.install', address: command.address, code: command.code,
        ...(command.consolePort === undefined ? {} : { consolePort: command.consolePort }),
      })))
      return 0
    }
    case 'consolePort': {
      const r = await call<ConsolePortResult>({ op: 'console.port', port: command.port })
      io.out(wrap(`The Fleet Console on ${r.machine} is now at ${r.address}, on this machine only${r.previous ? `, no longer at ${r.previous}` : ''}.`))
      return 0
    }
    case 'consoleRemove': {
      // The check refuses before anything is asked; the service checks again before it removes.
      const check = await call<ConsoleRemoveCheck>({ op: 'console.remove' })
      io.out(consoleRemoveWarning(check.machine, check.hq))
      if (!(await io.confirm('Take it away?', command.yes))) return 1
      io.out(consoleRemoved(await call<ConsoleRemoved>({ op: 'console.remove', confirmed: true })))
      return 0
    }
    case 'consoleCode': {
      if (command.noMachines) {
        const status = await call<WithManagement>({ op: 'machine.status' })
        io.out(noMachinesQuestion(status.machine.name))
        if (!(await io.confirm('Make a code that starts it with no machines?', command.yes))) return 1
        const made = await call<ConsoleCodeResult>({ op: 'hq.consoleCode', noMachines: true, confirmed: true })
        io.out(consoleCodeMade(made, now))
        io.out(noMachinesMade(made))
        return 0
      }
      const status = await call<WithManagement>({ op: 'machine.status' })
      if (status.hq) {
        const m = status.management
        const where = m?.consoleHere?.containers === 'running' ? 'here' : m?.managedBy && !m.managedBy.local ? 'elsewhere' : 'none'
        io.out(consoleCodeQuestion(status.machine.name, where))
        if (!(await io.confirm('Make a code?', command.yes))) return 1
      }
      const made = await call<ConsoleCodeResult>({ op: 'hq.consoleCode' })
      io.out(consoleCodeMade(made, now))
      io.out(consoleRetiredHere(made))
      return 0
    }
    case 'fleetAdmin': {
      const status = await call<WithManagement>({ op: 'machine.status' })
      if (status.hq) {
        io.out(command.remove ? fleetAdminRemoveQuestion(command.user) : fleetAdminQuestion(command.user))
        if (!(await io.confirm(command.remove ? 'Take the role away?' : 'Give the role?', command.yes))) return 1
      }
      const r = await call<FleetAdminResult>(command.remove
        ? { op: 'hq.fleetAdmin', user: command.user, remove: true }
        : { op: 'hq.fleetAdmin', user: command.user })
      io.out(wrap(r.text))
      return 0
    }
  }
}
