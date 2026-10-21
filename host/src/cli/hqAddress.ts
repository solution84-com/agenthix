/**
 * `agenthix hq address <address>`, `site hq-address <address>` and `console hq-address <address>` (host-management
 * spec §13): moving HQ to a new address on its machine, and pointing a site or a machine that was offline during the
 * move at it. The last two run the move check before anything changes; the host service says how it went.
 */
import type { Ask } from './backups'
import type { MachineStatus } from '../status/machineStatus'
import type { HqAddressResult } from '../install/hqAddress'
import type { SiteAddressResult } from '../install/siteAddress'
import type { PointMachineResult } from '../link/pointMachine'
import { addressProblem } from '../install/address'
import { hqAddressWarning, hqMoved, machinePointed, sitePointed } from './hqAddressWords'

export type HqAddressCommand =
  | { kind: 'hqAddress'; address: string; yes: boolean }
  | { kind: 'siteHqAddress'; address: string }
  | { kind: 'consoleHqAddress'; address: string }

type Usage = { kind: 'usage'; message: string }

function oneAddress(args: string[], usage: string): string | Usage {
  if (args.length !== 1) return { kind: 'usage', message: usage }
  const address = args[0].replace(/\/+$/, '')
  const problem = addressProblem(address)
  return problem ? { kind: 'usage', message: `HQ cannot be at ${address}: ${problem}.` } : address
}

/** `hq address …`, `site hq-address …` or `console hq-address …`. */
export function parseHqAddress(target: 'hq' | 'site' | 'console', args: string[]): HqAddressCommand | Usage {
  if (target === 'hq') {
    const yes = args.includes('--yes')
    const address = oneAddress(args.filter(a => a !== '--yes'), "Give HQ's new address: hq address <address>")
    return typeof address === 'string' ? { kind: 'hqAddress', address, yes } : address
  }
  const address = oneAddress(args, `Give HQ's new address, as a fleet admin has it: ${target} hq-address <address>`)
  if (typeof address !== 'string') return address
  return target === 'site' ? { kind: 'siteHqAddress', address } : { kind: 'consoleHqAddress', address }
}

export type HqAddressIo = {
  out: (text: string) => void
  confirm: (question: string, yes: boolean) => Promise<boolean>
}

export async function hqAddressCommand(command: HqAddressCommand, call: Ask, io: HqAddressIo): Promise<number> {
  switch (command.kind) {
    case 'hqAddress': {
      const status = await call<MachineStatus>({ op: 'machine.status' })
      if (status.hq) {
        io.out(hqAddressWarning(status.hq.address, command.address))
        if (!(await io.confirm('Move HQ?', command.yes))) return 1
      }
      const r = await call<HqAddressResult>({ op: 'address.set', target: 'hq', address: command.address })
      io.out(hqMoved(r.address, r.told))
      return 0
    }
    case 'siteHqAddress': {
      const r = await call<SiteAddressResult>({ op: 'address.set', target: 'site', address: command.address })
      io.out(sitePointed(r.siteName, r.address))
      return 0
    }
    case 'consoleHqAddress': {
      const r = await call<PointMachineResult>({ op: 'console.hqAddress', address: command.address })
      io.out(machinePointed(r.machine, r.address, r.console, r.siteNeedsAddress))
      return 0
    }
  }
}
