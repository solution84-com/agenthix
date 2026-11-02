import { describe, it, expect } from 'vitest'
import { diskFilling, diskNearlyFull, machineMemoryNearlyFull, parseSiteHealth, type SiteHealth } from '../siteHealth.js'

const GIB = 1024 ** 3

const report: SiteHealth = {
  takenAt: '2026-10-09T10:00:00.000Z',
  runs: { running: 1, maxAtOnce: 5 },
  disk: { freeBytes: 182 * GIB, totalBytes: 500 * GIB },
  docker: { running: true, version: '27.3.1' },
  agentImage: { name: 'agenthix-agent', present: true, version: '0.4.0' },
  ceilings: null,
  memoryNearlyFull: false,
}

describe('parseSiteHealth @SC-757', () => {
  it('keeps a well-formed report as it is', () => {
    expect(parseSiteHealth(JSON.parse(JSON.stringify(report)))).toEqual(report)
  })

  it('refuses what is not a report', () => {
    expect(parseSiteHealth(null)).toBeNull()
    expect(parseSiteHealth({ ...report, runs: { running: -1, maxAtOnce: 5 } })).toBeNull()
    expect(parseSiteHealth({ ...report, runs: { running: 1.5, maxAtOnce: 5 } })).toBeNull()
    expect(parseSiteHealth({ ...report, takenAt: 'yesterday' })).toBeNull()
    expect(parseSiteHealth({ ...report, docker: { running: 'yes', version: null } })).toBeNull()
    expect(parseSiteHealth({ ...report, agentImage: { name: '', present: true, version: null } })).toBeNull()
  })

  it('drops a disk it cannot trust rather than the whole report', () => {
    expect(parseSiteHealth({ ...report, disk: { freeBytes: 10, totalBytes: 5 } })?.disk).toBeNull()
    expect(parseSiteHealth({ ...report, disk: 'full' })?.disk).toBeNull()
  })

  it('clips text a site sends', () => {
    const long = 'x'.repeat(1000)
    expect(parseSiteHealth({ ...report, docker: { running: true, version: long } })?.docker.version).toHaveLength(200)
  })
})

describe('the effective ceilings a site reports', () => {
  const machine = { memoryBytesPerContainer: 8 * GIB, cpusPerContainer: 2, processesPerContainer: 4096, containersAtOnce: 5 }
  const ceilings = { ...machine, memoryBytesPerContainer: 4 * GIB }

  it('keeps the ceilings, and what they were before hq narrowed them', () => {
    expect(parseSiteHealth({ ...report, ceilings: { ceilings, machine } })?.ceilings).toEqual({ ceilings, machine })
  })

  it('drops ceilings it cannot trust rather than the whole report', () => {
    expect(parseSiteHealth({ ...report, ceilings: { ceilings: { ...machine, containersAtOnce: 9 }, machine } })?.ceilings).toBeNull()
    expect(parseSiteHealth({ ...report, ceilings: 'all of it' })?.ceilings).toBeNull()
  })

  it('carries ceilings only — never the machine figures they came with', () => {
    const extra = { ...machine, memoryUsedBytes: 3 * GIB, dockerVersion: '29.0.0' }
    expect(parseSiteHealth({ ...report, ceilings: { ceilings, machine: extra, resources: { cpuLoad: 2 } } })?.ceilings).toEqual({ ceilings, machine })
  })
})

describe('diskNearlyFull @SC-757', () => {
  it('is under 10 GiB free on a large disk', () => {
    expect(diskNearlyFull({ freeBytes: 9 * GIB, totalBytes: 500 * GIB })).toBe(true)
    expect(diskNearlyFull({ freeBytes: 11 * GIB, totalBytes: 500 * GIB })).toBe(false)
  })

  it('is under a tenth free on a disk smaller than 100 GiB', () => {
    expect(diskNearlyFull({ freeBytes: 4 * GIB, totalBytes: 50 * GIB })).toBe(true)
    expect(diskNearlyFull({ freeBytes: 6 * GIB, totalBytes: 50 * GIB })).toBe(false)
  })

  it('says nothing about a disk it does not know', () => {
    expect(diskNearlyFull(null)).toBe(false)
  })
})

describe('the memory condition', () => {
  it('is under 1.5 GiB available on a large machine, under a tenth on a small one', () => {
    expect(machineMemoryNearlyFull({ availableBytes: 1 * GIB, totalBytes: 64 * GIB })).toBe(true)
    expect(machineMemoryNearlyFull({ availableBytes: 2 * GIB, totalBytes: 64 * GIB })).toBe(false)
    expect(machineMemoryNearlyFull({ availableBytes: 0.7 * GIB, totalBytes: 8 * GIB })).toBe(true)
    expect(machineMemoryNearlyFull({ availableBytes: 0.9 * GIB, totalBytes: 8 * GIB })).toBe(false)
  })

  it('travels as a condition the report must carry', () => {
    expect(parseSiteHealth({ ...report, memoryNearlyFull: true })?.memoryNearlyFull).toBe(true)
    const { memoryNearlyFull: _m, ...without } = report
    expect(parseSiteHealth(without)).toBeNull()
    expect(parseSiteHealth({ ...report, memoryNearlyFull: 'yes' })).toBeNull()
  })
})

describe('the executor image a site reports @SC-1366', () => {
  const digest = `sha256:${'a'.repeat(64)}`
  const image = { name: 'agenthix-executor', present: true, digest, release: '0.4.0', toolsKey: 'k1' }

  it('keeps it beside the agent image', () => {
    expect(parseSiteHealth({ ...report, executorImage: image })?.executorImage).toEqual(image)
  })

  it('is absent from a report that carries none, as from a site before 1.5', () => {
    expect(parseSiteHealth(report)).not.toHaveProperty('executorImage')
  })

  it('reads an image without a digest it can trust as not there', () => {
    expect(parseSiteHealth({ ...report, executorImage: { ...image, digest: 'latest' } })?.executorImage)
      .toEqual({ ...image, present: false, digest: null, release: null, toolsKey: null })
  })

  it('drops a tools key that is not a key, and the image that is not one', () => {
    expect(parseSiteHealth({ ...report, executorImage: { ...image, toolsKey: 'a b' } })?.executorImage?.toolsKey).toBeNull()
    expect(parseSiteHealth({ ...report, executorImage: { present: true } })).not.toHaveProperty('executorImage')
  })
})

describe('the disk branch copies use and the 80% notice (site protocol 1.13) @SC-1730', () => {
  it('keeps the copies figure, and a report from before it reads as it did', () => {
    const withCopies = { ...report, branchCopies: { usedBytes: 3 * GIB } }
    expect(parseSiteHealth(JSON.parse(JSON.stringify(withCopies)))?.branchCopies).toEqual({ usedBytes: 3 * GIB })
    expect(parseSiteHealth(JSON.parse(JSON.stringify(report)))).not.toHaveProperty('branchCopies')
    expect(parseSiteHealth({ ...report, branchCopies: { usedBytes: -1 } })).not.toHaveProperty('branchCopies')
  })

  it('is filling at 80% used', () => {
    expect(diskFilling({ freeBytes: 21 * GIB, totalBytes: 100 * GIB })).toBe(false)
    expect(diskFilling({ freeBytes: 20 * GIB, totalBytes: 100 * GIB })).toBe(true)
    expect(diskFilling(null)).toBe(false)
  })

  it('once warned, holds until usage is below 75%', () => {
    expect(diskFilling({ freeBytes: 23 * GIB, totalBytes: 100 * GIB }, true)).toBe(true)
    expect(diskFilling({ freeBytes: 25 * GIB, totalBytes: 100 * GIB }, true)).toBe(true)
    expect(diskFilling({ freeBytes: 26 * GIB, totalBytes: 100 * GIB }, true)).toBe(false)
    expect(diskFilling({ freeBytes: 23 * GIB, totalBytes: 100 * GIB }, false)).toBe(false)
  })
})
