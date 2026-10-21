import type { HostCeilings } from '@agenthix/core'
import { MEMORY_GB } from '../pages/dashboard/words'
import { memoryGbOf } from '../pages/site/words'

export type CapacityForm = { memoryGb: string; cpus: string; processes: string; atOnce: string }
export type CapacityErrors = Partial<Record<keyof CapacityForm, string>>

export const formOf = (c: HostCeilings): CapacityForm => ({
  memoryGb: memoryGbOf(c.memoryBytesPerContainer), cpus: String(c.cpusPerContainer),
  processes: String(c.processesPerContainer), atOnce: String(c.containersAtOnce),
})

const number = (s: string): number => (s.trim() === '' ? NaN : Number(s))
const whole = (n: number) => Number.isInteger(n) && n > 0

/** What was typed, as the ceilings to send, or the sentence beside each field that is wrong. */
export function parseCapacityForm(form: CapacityForm, machineMemoryBytes: number | null):
  { ok: true; ceilings: HostCeilings } | { ok: false; errors: CapacityErrors } {
  const errors: CapacityErrors = {}
  const memory = number(form.memoryGb)
  const cpus = number(form.cpus)
  const processes = number(form.processes)
  const atOnce = number(form.atOnce)
  if (!(memory > 0) || !Number.isFinite(memory)) errors.memoryGb = 'Enter the memory in GB.'
  else if (machineMemoryBytes !== null && Math.round(memory * MEMORY_GB) > machineMemoryBytes) {
    errors.memoryGb = `The machine has ${memoryGbOf(machineMemoryBytes)} GB; one run cannot have more.`
  }
  if (!(cpus > 0) || !Number.isFinite(cpus)) errors.cpus = 'Enter a number of processors, such as 2 or 0.5.'
  if (!whole(processes)) errors.processes = 'Enter a whole number above zero.'
  if (!whole(atOnce)) errors.atOnce = 'Enter a whole number above zero.'
  if (Object.keys(errors).length > 0) return { ok: false, errors }
  return { ok: true, ceilings: { memoryBytesPerContainer: Math.round(memory * MEMORY_GB), cpusPerContainer: cpus, processesPerContainer: processes, containersAtOnce: atOnce } }
}
