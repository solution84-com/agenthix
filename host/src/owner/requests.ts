/**
 * What the owner socket takes (host-management spec §6, §9): every operation of the closed set a controller may
 * ask (`HostRequest`, checked by core's `parseHostRequest`), plus the few that stay on the machine and are never
 * offered to a controller — installing from the command line, the machine's status in full, and HQ's commands
 * through its control socket. Anything else is refused, and what is accepted is rebuilt field by field.
 */
import { parseHostRequest } from '@agenthix/core'
import type { HostRefusal, HostRequest, HostTarget } from '@agenthix/core'
import { parseBackupMachineRequest, type BackupMachineRequest } from '../backups/operations'
import { parseUpgradesRequest, type UpgradesMachineRequest } from '../upgrades/operations'
import type { CloudCliRequest } from './cloudCliOps'
import { portFields, type PortChoice } from '../install/ports'
import { parseProviderCliRequest, type ProviderCliRequest } from './providerCliOps'

export type MachineRequest =
  | { op: 'machine.status' }
  /**
   * `hqPort`, `consolePort`: the machine admin's choice, from `install --hq-port` and `--console-port`. `demo`: from
   * `install --demo` (adr-0186), absent otherwise. `filesHost`: from `install --files <host>`.
   */
  | ({ op: 'machine.install'; address: string; demo?: true; filesHost?: string } & PortChoice)
  /** `hq files-address <host>`: uploaded files served from a host of the person's choosing (install/filesAddress.ts). */
  | { op: 'hq.filesAddress'; host: string }
  /** `front-door add-installation | remove-installation <namespace>`: another installation's HQ behind this front door. */
  | { op: 'frontDoor.installation'; namespace: string; remove?: true }
  /** `agenthix demo reset`: without `confirmed`, which the CLI sets once the person agreed, it only checks. */
  | { op: 'demo.reset'; confirmed?: true }
  | { op: 'hq.inviteAdmin' }
  | { op: 'hq.resetPassword'; user: string }
  /** What turning the front door on would serve and what stands in its way, read before the person is asked. */
  | { op: 'frontDoor.check'; filesHost?: string }
  | BackupMachineRequest
  | UpgradesMachineRequest
  /** `agenthix cloud …`, `console remote off`, `console reset-code` (cloudCliOps.ts). */
  | CloudCliRequest
  /** `agenthix provider …` (providerCliOps.ts). */
  | ProviderCliRequest
  /** The changes scheduled on this machine. A controller hears of them by their notices, not by asking. */
  | { op: 'scheduled.list' }
  /** Brings back an erased HQ or site from the bin, within its grace period (spec §15). */
  | { op: 'erased.restore'; target: HostTarget }
  /** The host service's version: how the launcher knows a new host service answers (ADR-0118). */
  | { op: 'host.version' }
  /** Connecting this machine to a Fleet Console, and leaving it (spec §6). Never a controller's to ask. */
  /** The ports: where HQ and its Fleet Console are published here should HQ move in (one port plan, Rule 3). */
  | { op: 'console.connect'; address: string; code: string; hqPort?: number; consolePort?: number }
  | { op: 'console.disconnect' }
  /** The Fleet Console on this machine instead of HQ's, from a code HQ's machine made (spec §7). */
  | { op: 'console.install'; address: string; code: string; consolePort?: number }
  /** `console port <port>`: the Fleet Console here moved to another port of this machine, after the port check. */
  | { op: 'console.port'; port: number }
  /** Takes away the Fleet Console here, keys and all; without `confirmed`, which the CLI sets once the person agreed, it only checks. */
  | { op: 'console.remove'; confirmed?: true }
  /**
   * `noMachines`: hq's own code even though this machine answers a Fleet Console elsewhere — for when that one is lost.
   * Every machine then connects again; refused unless `confirmed`, which the CLI sets only once the person agreed.
   */
  | { op: 'hq.consoleCode'; noMachines?: true; confirmed?: true }
  | { op: 'hq.fleetAdmin'; user: string; remove?: boolean }
  /** Points this machine, and a Fleet Console it runs, at HQ's new address once it passes the move check (spec §13). */
  | { op: 'console.hqAddress'; address: string }
  /** `site schedule move --at`: a move's code from the Fleet Console, for the site here (spec §13). */
  | { op: 'site.moveCode'; at: string }
  /** `hq schedule move --at`: a code from the Fleet Console that moves hq here to a new machine (spec §13). */
  | { op: 'hq.moveCode'; at: string; hqAddress?: string }
  /**
   * `hq move recover`: hq started here again after its move ended on neither machine (spec §13). The check changes
   * nothing; the recovery is refused unless `confirmed`, which the CLI sets only once the person agreed.
   */
  | { op: 'hq.moveRecoverCheck' }
  | { op: 'hq.moveRecover'; confirmed?: true }
  /**
   * `agenthix uninstall`: the check lists what would go and changes nothing. The uninstall is refused unless
   * `confirmed`, which the CLI sets only once the person agreed; `purge` is what they typed for each erased HQ or site
   * still in the bin.
   */
  | { op: 'machine.uninstallCheck' }
  | { op: 'machine.uninstall'; confirmed?: true; purge: string[] }

export type OwnerRequest = MachineRequest | HostRequest

export type ParsedOwnerRequest = { ok: true; request: OwnerRequest } | { ok: false; refusal: HostRefusal }

const MAX_ADDRESS = 512
const MAX_USER = 128
const MAX_CODE = 32
const CONTROL = /[\u0000-\u001f\u007f]/

const malformed = (what: string): ParsedOwnerRequest =>
  ({ ok: false, refusal: { code: 'malformed', message: `The request's ${what} is missing or not valid.` } })

function text(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t && t.length <= max && !CONTROL.test(t) ? t : null
}

export function parseOwnerRequest(data: unknown): ParsedOwnerRequest {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { ok: false, refusal: { code: 'malformed', message: 'The request is not one the host service reads.' } }
  }
  const r = data as Record<string, unknown>
  switch (r.op) {
    case 'machine.status':
    case 'hq.inviteAdmin':
    case 'scheduled.list':
    case 'host.version':
    case 'console.disconnect':
    case 'hq.moveRecoverCheck':
    case 'console.remoteOff':
    case 'machine.uninstallCheck':
      return { ok: true, request: { op: r.op } }
    case 'machine.uninstall': {
      if (r.confirmed !== undefined && r.confirmed !== true) return malformed('confirmation')
      const raw = r.purge ?? []
      if (!Array.isArray(raw) || raw.length > 2) return malformed('names to purge')
      const purge = raw.map(v => text(v, MAX_ADDRESS))
      if (!purge.every((v): v is string => v !== null)) return malformed('names to purge')
      return { ok: true, request: { op: 'machine.uninstall', ...(r.confirmed ? { confirmed: true } : {}), purge } }
    }
    case 'hq.cloudConnection':
      return r.action === 'connect' || r.action === 'state' || r.action === 'disconnect'
        ? { ok: true, request: { op: 'hq.cloudConnection', action: r.action } }
        : malformed('action')
    case 'hq.provider': {
      const parsed = parseProviderCliRequest(r)
      return parsed.ok ? { ok: true, request: parsed.request } : malformed(parsed.field)
    }
    case 'console.resetCode': {
      const user = text(r.user, MAX_USER)
      return user ? { ok: true, request: { op: 'console.resetCode', user } } : malformed('user name')
    }
    case 'hq.moveRecover':
    case 'console.remove':
    case 'demo.reset':
      if (r.confirmed !== undefined && r.confirmed !== true) return malformed('confirmation')
      return { ok: true, request: { op: r.op, ...(r.confirmed ? { confirmed: true } : {}) } }
    case 'hq.consoleCode': {
      if (r.noMachines !== undefined && r.noMachines !== true) return malformed('choice of no machines')
      if (r.confirmed !== undefined && r.confirmed !== true) return malformed('confirmation')
      return { ok: true, request: { op: 'hq.consoleCode', ...(r.noMachines ? { noMachines: true } : {}), ...(r.confirmed ? { confirmed: true } : {}) } }
    }
    case 'console.connect':
    case 'console.install': {
      const address = text(r.address, MAX_ADDRESS)
      const code = text(r.code, MAX_CODE)
      if (!address) return malformed('address')
      if (!code) return malformed('code')
      const ports = portFields(r, r.op === 'console.connect' ? ['hqPort', 'consolePort'] : ['consolePort'])
      return ports ? { ok: true, request: { op: r.op, address, code, ...ports } } : malformed('port')
    }
    case 'console.port': {
      const ports = portFields({ consolePort: r.port }, ['consolePort'])
      return ports?.consolePort !== undefined ? { ok: true, request: { op: 'console.port', port: ports.consolePort } } : malformed('port')
    }
    case 'hq.fleetAdmin': {
      const user = text(r.user, MAX_USER)
      if (!user) return malformed('user name')
      return { ok: true, request: r.remove === true ? { op: 'hq.fleetAdmin', user, remove: true } : { op: 'hq.fleetAdmin', user } }
    }
    case 'site.moveCode': {
      const at = text(r.at, 40)
      return at && !Number.isNaN(Date.parse(at)) ? { ok: true, request: { op: 'site.moveCode', at } } : malformed('time')
    }
    case 'hq.moveCode': {
      const at = text(r.at, 40)
      if (!at || Number.isNaN(Date.parse(at))) return malformed('time')
      if (r.hqAddress === undefined) return { ok: true, request: { op: 'hq.moveCode', at } }
      const hqAddress = text(r.hqAddress, MAX_ADDRESS)
      return hqAddress ? { ok: true, request: { op: 'hq.moveCode', at, hqAddress } } : malformed('address')
    }
    case 'machine.install': {
      const address = text(r.address, MAX_ADDRESS)
      if (!address) return malformed('address')
      const ports = portFields(r, ['hqPort', 'consolePort'])
      if (r.demo !== undefined && r.demo !== true) return malformed('choice of a demo')
      const filesHost = r.filesHost === undefined ? undefined : text(r.filesHost, 253)
      if (filesHost === null) return malformed('files host')
      return ports ? { ok: true, request: { op: 'machine.install', address, ...ports, ...(r.demo ? { demo: true } : {}), ...(filesHost ? { filesHost } : {}) } } : malformed('port')
    }
    case 'hq.filesAddress': {
      const host = text(r.host, 253)
      return host ? { ok: true, request: { op: 'hq.filesAddress', host } } : malformed('files host')
    }
    case 'console.hqAddress': {
      const address = text(r.address, MAX_ADDRESS)
      return address ? { ok: true, request: { op: 'console.hqAddress', address } } : malformed('address')
    }
    case 'hq.resetPassword': {
      const user = text(r.user, MAX_USER)
      return user ? { ok: true, request: { op: 'hq.resetPassword', user } } : malformed('user name')
    }
    case 'erased.restore':
      return r.target === 'hq' || r.target === 'site' ? { ok: true, request: { op: 'erased.restore', target: r.target } } : malformed('target')
    case 'frontDoor.installation': {
      const namespace = text(r.namespace, 31)
      if (!namespace || !/^[a-z][a-z0-9-]*$/.test(namespace)) return malformed('namespace')
      if (r.remove !== undefined && r.remove !== true) return malformed('choice to remove')
      return { ok: true, request: { op: 'frontDoor.installation', namespace, ...(r.remove ? { remove: true } : {}) } }
    }
    case 'frontDoor.check': {
      if (r.filesHost === undefined) return { ok: true, request: { op: 'frontDoor.check' } }
      const filesHost = text(r.filesHost, 253)
      return filesHost ? { ok: true, request: { op: 'frontDoor.check', filesHost } } : malformed('files host')
    }
    default: {
      const upgrades = parseUpgradesRequest(r)
      if (upgrades === 'malformed') return malformed('fields')
      if (upgrades) return { ok: true, request: upgrades }
      const backup = parseBackupMachineRequest(r)
      if (backup === 'malformed') return malformed('fields')
      return backup ? { ok: true, request: backup } : parseHostRequest(data)
    }
  }
}
