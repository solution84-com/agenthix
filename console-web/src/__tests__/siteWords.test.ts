import { describe, expect, it } from 'vitest'
import type { HostFigures } from '@agenthix/core'
import { agoWords, ceilingWords, copiesWords, diskWords, gbOf, memoryWords, protectionWords } from '../pages/site/words'

const NOW = new Date(2026, 9, 15, 12, 0, 0)
const GB = 1000 ** 3
const GIB = 1024 ** 3

const base = (over: Partial<HostFigures['protections']> = {}): HostFigures['protections'] => ({
  holding: true, rules: ['machine-ports', 'published-ports', 'metadata-address'], checkedAt: new Date(NOW.getTime() - 40_000).toISOString(), problem: null, ...over,
})

describe('sizes in decimal units, as HQ gives them', () => {
  it('counts disk in decimal GB and memory in binary GB, as Docker and HQ count a run\'s memory', () => {
    expect(diskWords({ freeBytes: 1_006_900_000_000 - 119_800_000_000, totalBytes: 1_006_900_000_000 }).detail).toBe('119.8 of 1006.9 GB used')
    expect(memoryWords({ usedBytes: 9.1 * GIB, totalBytes: 16 * GIB }).detail).toBe('9.1 of 16 GB memory')
    expect(gbOf(1_500_000_000)).toBe('1.5')
  })
})

describe('ceilings in words', () => {
  it('names each limit of a run and how many run at once', () => {
    expect(ceilingWords({ memoryBytesPerContainer: 4 * GIB, cpusPerContainer: 2, processesPerContainer: 512, containersAtOnce: 6 }))
      .toEqual({ each: '4 GB memory · 2 processors · 512 processes', atOnce: '6' })
  })
  it('uses the singular, and keeps a fraction', () => {
    expect(ceilingWords({ memoryBytesPerContainer: 1.5 * GIB, cpusPerContainer: 1, processesPerContainer: 1, containersAtOnce: 1 }).each)
      .toBe('1.5 GB memory · 1 processor · 1 process')
    expect(ceilingWords({ memoryBytesPerContainer: GIB, cpusPerContainer: 0.5, processesPerContainer: 64, containersAtOnce: 2 }).each)
      .toContain('0.5 processors')
  })
})

describe('the disk and memory @SC-897', () => {
  it('says nothing of a disk with room, and warns from 90%', () => {
    expect(diskWords({ freeBytes: 60 * GB, totalBytes: 100 * GB })).toMatchObject({ percent: 40, warn: false, say: null })
    const full = diskWords({ freeBytes: 18 * GB, totalBytes: 200 * GB })
    expect(full).toMatchObject({ percent: 91, warn: true, detail: '182 of 200 GB used' })
    expect(full.say).toEqual({ lead: 'The disk is 91% full, 18 GB left.', rest: expect.stringContaining('Free space') })
  })
  it('gives memory in GB with the share', () => {
    expect(memoryWords({ usedBytes: 9.1 * GIB, totalBytes: 32 * GIB })).toMatchObject({ percent: 28, text: '9.1 GB', detail: '9.1 of 32 GB memory', warn: false })
    expect(memoryWords({ usedBytes: 30 * GIB, totalBytes: 32 * GIB }).warn).toBe(true)
  })
})

describe('the protections @SC-897', () => {
  it('state what holds, as a fact, without when they were checked: the pill says it', () => {
    const w = protectionWords(base(), NOW)
    expect(w).toMatchObject({ label: 'In place', tone: 'healthy' })
    expect(w.sentence).toBe("Agents can't reach the machine's ports, other containers' ports or the metadata address.")
  })
  it('when they do not hold: the cause and that no new agent starts', () => {
    const w = protectionWords(base({ holding: false, problem: 'The firewall rule is missing.' }), NOW)
    expect(w).toMatchObject({ label: 'Not holding', tone: 'danger' })
    expect(w.sentence).toContain('The firewall rule is missing.')
    expect(w.sentence).toContain('No new agent starts until they hold.')
    expect(w.sentence).toContain('Checked 40 seconds ago.')
  })
})

describe('how long ago', () => {
  it('counts in the largest whole unit', () => {
    expect(agoWords(new Date(NOW.getTime() - 40_000).toISOString(), NOW)).toBe('40 seconds ago')
    expect(agoWords(new Date(NOW.getTime() - 60_000).toISOString(), NOW)).toBe('1 minute ago')
    expect(agoWords(new Date(NOW.getTime() - 3 * 3600_000).toISOString(), NOW)).toBe('3 hours ago')
    expect(agoWords(new Date(NOW.getTime() - 41 * 86400_000).toISOString(), NOW)).toBe('41 days ago')
  })
})

describe('the disk branch copies use', () => {
  const disk = { freeBytes: 200 * GB, totalBytes: 500 * GB }
  it('is shown against the machine\'s disk', () => {
    expect(copiesWords(disk, 50 * GB)).toBe('50 GB of 500 GB · 10% of the disk')
  })
  it('is left out while the site has not said', () => {
    expect(copiesWords(disk, null)).toBeNull()
    expect(copiesWords(disk, undefined)).toBeNull()
  })
})
