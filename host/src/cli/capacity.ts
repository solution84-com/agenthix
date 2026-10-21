/**
 * `agenthix capacity` and `agenthix capacity set` (host-management spec §8, the CLI board's *agenthix capacity*):
 * the machine's ceilings for agent containers, shown and set on the machine. There is no setting for the agent
 * protections: they are always on.
 */
import type { HostCeilings, HostFigures } from '@agenthix/core'
import { machineSize, memoryText, type CapacityResult, type MachineSize } from '../figures/capacity'
import { cmd, wrap } from './words'

export type CapacityChange = Partial<HostCeilings>

export type CapacityCommand = { kind: 'capacity' } | { kind: 'capacitySet'; change: CapacityChange } | { kind: 'usage'; message: string }

const GIB = 1024 ** 3
const MIB = 1024 ** 2
const SETTINGS = ['--memory', '--processors', '--processes', '--containers'] as const
const EXAMPLE = 'capacity set --memory 6GB --containers 2'

function memory(value: string): number | null {
  const m = /^(\d+(?:\.\d+)?)\s*(gb|g|gib|mb|m|mib)$/i.exec(value.trim())
  if (!m) return null
  const bytes = Math.round(Number(m[1]) * (/^g/i.test(m[2]) ? GIB : MIB))
  return bytes > 0 ? bytes : null
}

function count(value: string, integer: boolean): number | null {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 && (!integer || Number.isInteger(n)) ? n : null
}

export function parseCapacity(args: string[]): CapacityCommand {
  if (args.length === 0) return { kind: 'capacity' }
  if (args[0] !== 'set') return { kind: 'usage', message: `capacity shows the machine's ceilings; ${cmd(EXAMPLE)} changes them.` }
  const change: CapacityChange = {}
  const rest = args.slice(1)
  if (rest.length === 0) return { kind: 'usage', message: `Say what to change, for example: ${cmd(EXAMPLE)}` }
  for (let i = 0; i < rest.length; i += 2) {
    const name = rest[i]
    const value = rest[i + 1]
    if (/protection/i.test(name)) return { kind: 'usage', message: 'No such setting. Shutting agents out of this machine is always on.' }
    if (!(SETTINGS as readonly string[]).includes(name)) {
      return { kind: 'usage', message: `No such setting: ${name}. There are ${SETTINGS.join(', ')}.` }
    }
    if (value === undefined) return { kind: 'usage', message: `${name} takes a value, for example: ${cmd(EXAMPLE)}` }
    if (name === '--memory') {
      const v = memory(value)
      if (!v) return { kind: 'usage', message: `--memory takes a size like 6GB or 512MB, not ${value}.` }
      change.memoryBytesPerContainer = v
    } else {
      const v = count(value, name !== '--processors')
      if (!v) return { kind: 'usage', message: `${name} takes a ${name === '--processors' ? 'positive number' : 'whole number'}, not ${value}.` }
      if (name === '--processors') change.cpusPerContainer = v
      else if (name === '--processes') change.processesPerContainer = v
      else change.containersAtOnce = v
    }
  }
  return { kind: 'capacitySet', change }
}

const pad = (label: string) => `  ${label.padEnd(34)}`

export function capacityText(machine: string, c: HostCeilings, size: MachineSize = machineSize()): string {
  return [
    wrap(`What each agent run on ${machine} may use (this machine has ${memoryText(size.memoryBytes)} of memory and ${size.processors} processors):`),
    `${pad('Memory per agent container')}${memoryText(c.memoryBytesPerContainer)}`,
    `${pad('Processors per agent container')}${c.cpusPerContainer}`,
    `${pad('Processes per agent container')}${c.processesPerContainer}`,
    `${pad('Agent containers at once')}${c.containersAtOnce}`,
    'HQ and projects may narrow these for a run; a run gets the smaller.',
    `To change them: ${cmd(EXAMPLE)}`,
  ].join('\n')
}

export function capacityChanged(r: CapacityResult): string {
  const { ceilings: c, before: b } = r
  const parts: string[] = []
  if (c.memoryBytesPerContainer !== b.memoryBytesPerContainer) parts.push(memoryText(c.memoryBytesPerContainer))
  if (c.cpusPerContainer !== b.cpusPerContainer) parts.push(`${c.cpusPerContainer} processors`)
  if (c.processesPerContainer !== b.processesPerContainer) parts.push(`${c.processesPerContainer} processes`)
  if (c.containersAtOnce !== b.containersAtOnce) parts.push(`at most ${c.containersAtOnce} container${c.containersAtOnce === 1 ? '' : 's'} at once`)
  if (parts.length === 0) return 'Nothing changed: these are the ceilings already.'
  const list = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`
  return wrap(`Changed. New runs get ${list}. Runs already going keep what they started with. HQ will show the new limits on Where work runs.`)
}

/** Reads the figures, applies the change to the machine's ceilings, and sets them whole. */
export async function setCapacityFrom(
  ask: <T>(request: unknown) => Promise<T>,
  change: CapacityChange,
): Promise<CapacityResult> {
  const figures = await ask<HostFigures>({ op: 'figures.read' })
  return ask<CapacityResult>({ op: 'capacity.set', ceilings: { ...figures.ceilings, ...change } })
}
