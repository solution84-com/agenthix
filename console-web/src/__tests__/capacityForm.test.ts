import { describe, expect, it } from 'vitest'
import { formOf, parseCapacityForm } from '../forms/capacityForm'

const GB = 1024 ** 3
const ceilings = { memoryBytesPerContainer: 4 * GB, cpusPerContainer: 2, processesPerContainer: 512, containersAtOnce: 6 }

describe('the capacity form @SC-908', () => {
  it('starts from the ceilings, memory in GB', () => {
    expect(formOf(ceilings)).toEqual({ memoryGb: '4', cpus: '2', processes: '512', atOnce: '6' })
  })
  it('turns what was typed into ceilings', () => {
    expect(parseCapacityForm({ memoryGb: '1.5', cpus: '0.5', processes: '256', atOnce: '3' }, null))
      .toEqual({ ok: true, ceilings: { memoryBytesPerContainer: 1.5 * GB, cpusPerContainer: 0.5, processesPerContainer: 256, containersAtOnce: 3 } })
  })
  it('refuses what is empty, not a number, zero or negative, each beside its field', () => {
    const r = parseCapacityForm({ memoryGb: '', cpus: 'two', processes: '0', atOnce: '-1' }, null)
    expect(r).toEqual({
      ok: false,
      errors: {
        memoryGb: 'Enter the memory in GB.', cpus: 'Enter a number of processors, such as 2 or 0.5.',
        processes: 'Enter a whole number above zero.', atOnce: 'Enter a whole number above zero.',
      },
    })
  })
  it('refuses a fraction of a process or of a run', () => {
    const r = parseCapacityForm({ memoryGb: '4', cpus: '2', processes: '10.5', atOnce: '2.5' }, null)
    expect(r.ok).toBe(false)
  })
  it('refuses more memory for one run than the machine has', () => {
    const r = parseCapacityForm({ memoryGb: '40', cpus: '2', processes: '512', atOnce: '6' }, 32 * GB)
    expect(r).toEqual({ ok: false, errors: { memoryGb: 'The machine has 32 GB; one run cannot have more.' } })
  })
  it('sends a memory ceiling it did not change exactly as it was, though the field shows one decimal', () => {
    const current = { ...ceilings, memoryBytesPerContainer: Math.round(0.25 * GB) }
    const form = { ...formOf(current), cpus: '1' }
    expect(form.memoryGb).toBe('0.3')
    const parsed = parseCapacityForm(form, null, current)
    expect(parsed.ok && parsed.ceilings).toEqual({ ...current, cpusPerContainer: 1 })
  })
  it('sends the memory typed once it is changed', () => {
    const current = { ...ceilings, memoryBytesPerContainer: Math.round(0.25 * GB) }
    const parsed = parseCapacityForm({ ...formOf(current), memoryGb: '2' }, null, current)
    expect(parsed.ok && parsed.ceilings.memoryBytesPerContainer).toBe(2 * GB)
  })
})
