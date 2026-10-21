/**
 * `capacity.set` (host-management spec §8, the CLI board's *agenthix capacity*): the machine's ceilings for agent
 * containers, stored in `machine.json`, which the figures read and the site applies to every run it starts. They
 * are the machine admin's or the fleet admin's; hq and projects may only narrow them.
 *
 * Refused when they cannot fit the machine: every container at once at its memory ceiling must fit in the
 * machine's memory, and no container may have more processors than the machine has.
 */
import os from 'node:os'
import type { HostCeilings } from '@agenthix/core'
import type { Context } from '../service/context'
import { Refusal } from '../owner/results'
import { machineCeilings } from './figures'

export type MachineSize = { memoryBytes: number; processors: number }

export const machineSize = (): MachineSize => ({ memoryBytes: os.totalmem(), processors: os.cpus().length })

const GIB = 1024 ** 3
const MIB = 1024 ** 2

/** `6 GB`, `4.5 GB`, `512 MB`: binary units, as the machine reports them, written as people read them. */
export function memoryText(bytes: number): string {
  if (bytes >= GIB) return `${Math.round((bytes / GIB) * 10) / 10} GB`
  return `${Math.max(1, Math.round(bytes / MIB))} MB`
}

export type CapacityResult = { ceilings: HostCeilings; before: HostCeilings }

export function capacityProblem(c: HostCeilings, before: HostCeilings, size: MachineSize): string | null {
  if (c.cpusPerContainer > size.processors) {
    return `Not changed: this machine has ${size.processors} processors, so an agent container cannot have ${c.cpusPerContainer}.`
  }
  const all = c.memoryBytesPerContainer * c.containersAtOnce
  if (all > size.memoryBytes) {
    return `Not changed: ${c.containersAtOnce} containers at ${memoryText(c.memoryBytesPerContainer)} could use ${memoryText(all)}; ` +
      `this machine has ${memoryText(size.memoryBytes)}. Lower either, or keep ${before.containersAtOnce} containers at ` +
      `${memoryText(before.memoryBytesPerContainer)}.`
  }
  return null
}

export function setCapacity(ctx: Context, ceilings: HostCeilings, size: MachineSize = machineSize()): CapacityResult {
  const before = machineCeilings(ctx)
  const problem = capacityProblem(ceilings, before, size)
  if (problem) throw new Refusal('conflict', problem)
  const stored = (ctx.state.readJson('machine.json') ?? {}) as Record<string, unknown>
  ctx.state.writeJson(['machine.json'], { ...stored, ceilings })
  return { ceilings, before }
}
