import { describe, it, expect } from 'vitest'
import { availability, causeExplanation, figureFacts, loadText, rowDetail, runLimitsText, scheduledLine } from '../whereWorkRunsWords'
import type { SiteListEntry } from '../../siteViews'

const GIB = 1024 ** 3
const NOW = new Date(2026, 9, 15, 15, 0)
const ceilings = (memory: number, cpus: number) => ({
  ceilings: { memoryBytesPerContainer: memory * GIB, cpusPerContainer: cpus, processesPerContainer: 512, containersAtOnce: 4 },
  machine: { memoryBytesPerContainer: memory * GIB, cpusPerContainer: cpus, processesPerContainer: 512, containersAtOnce: 4 },
})
const entry = (over: Partial<SiteListEntry>): SiteListEntry => ({
  id: 'r1', siteId: 's1', label: 'office-server', status: 'ONLINE', connected: true, isDefault: false,
  registeredAt: new Date(2026, 9, 3, 9, 0), lastSeenAt: NOW, protocolVersion: null, hqProtocol: '',
  projectCount: 3, waiting: { runs: 0, changes: 0 }, figures: false, load: { running: 1, maxAtOnce: 4, ceilings: ceilings(8, 4) },
  health: null, healthReportedAt: null, removal: null, group: 'running', problems: [],
  hosting: 'self-hosted', scheduled: null, cause: null, ...over,
})

describe('availability: a word and a sentence of cause @SC-637', () => {
  it('Available when it takes runs', () => {
    expect(availability(entry({}), NOW)).toEqual({ word: 'Available', sentence: 'Available', tone: 'ok' })
  })

  it('Busy when every place is taken and runs wait, and nothing is wrong with it', () => {
    const s = entry({ load: { running: 4, maxAtOnce: 4 }, waiting: { runs: 0, changes: 0, atCapacity: 3 } })
    expect(availability(s, NOW)).toMatchObject({ word: 'Busy', sentence: 'Busy: all 4 runs are going, 3 runs wait for a place', tone: 'ok' })
    expect(availability({ ...s, waiting: { runs: 0, changes: 0, atCapacity: 1 } }, NOW).sentence).toBe('Busy: all 4 runs are going, 1 run waits for a place')
  })

  it('every place taken with nothing waiting is still Available', () => {
    expect(availability(entry({ load: { running: 4, maxAtOnce: 4 } }), NOW).word).toBe('Available')
  })

  it('Unavailable since the last time it was heard from, in words, and that the fleet admins know', () => {
    const s = entry({ status: 'OFFLINE', connected: false, lastSeenAt: new Date(2026, 9, 15, 9, 14), group: 'needsYou' })
    expect(availability(s, NOW)).toEqual({
      word: 'Unavailable', tone: 'attention',
      sentence: "Unavailable since 09:14: its machine isn't answering. Your fleet admins have been told.",
    })
  })

  it('a site that never connected says so', () => {
    const s = entry({ status: 'REGISTERED', connected: false, lastSeenAt: null, group: 'neverConnected' })
    expect(availability(s, NOW).sentence).toBe('Unavailable: its machine has not connected yet. Your fleet admins have been told.')
  })

  it('a site older than HQ works with, and one whose machine cannot start runs, name no version and no figure', () => {
    const old = entry({ status: 'VERSION_MISMATCH', group: 'needsYou', problems: [{ kind: 'upgrade', protocolVersion: null, side: 'site' }] })
    expect(availability(old, NOW).sentence).toBe('Unavailable: its software is older than HQ works with. Your fleet admins have been told.')
    const ahead = entry({ status: 'VERSION_MISMATCH', group: 'needsYou', problems: [{ kind: 'upgrade', protocolVersion: null, side: 'hq' }] })
    expect(availability(ahead, NOW).sentence).toBe('Unavailable: its software is newer than HQ works with. Your fleet admins have been told.')
    const docker = entry({ group: 'needsYou', problems: [{ kind: 'dockerDown' }] })
    expect(availability(docker, NOW).word).toBe('Unavailable')
    expect(availability(docker, NOW).sentence).not.toMatch(/\d/)
  })

  it('a machine short of disk or memory stays available and says runs may fail, with no figure', () => {
    const s = entry({ group: 'needsYou', problems: [{ kind: 'diskNearlyFull', freeBytes: 2e9, totalBytes: 5e11 }, { kind: 'memoryNearlyFull' }] })
    expect(availability(s, NOW)).toEqual({
      word: 'Available', tone: 'attention',
      sentence: 'Available, but it is nearly out of disk and memory; runs may fail. Your fleet admins have been told.',
    })
  })

  it('hq\'s own site names the actual cause, each of the board\'s three', () => {
    const hq = (cause: SiteListEntry['cause'], lastSeenAt: Date | null) =>
      availability(entry({ isDefault: true, status: 'OFFLINE', connected: false, lastSeenAt, cause, group: 'needsYou' }), NOW).sentence
    expect(hq('secretTooShort', null)).toBe('Unavailable: its pairing secret is too short')
    expect(hq('addressRefused', new Date(2026, 9, 15, 9, 12))).toBe('Unavailable: it cannot reach HQ')
    expect(hq(null, new Date(2026, 9, 15, 9, 12))).toBe('Unavailable since 09:12: it is not running')
  })

  it('a removed site reads as removed', () => {
    const s = entry({ status: 'REVOKED', connected: false, group: 'removed', removal: { at: new Date(2026, 9, 5), by: null, leftByItself: true } })
    expect(availability(s, NOW)).toMatchObject({ word: 'Removed', sentence: 'Left by itself on 5 Oct' })
  })
})

describe('the explanation of hq\'s own site not being connected', () => {
  it('says what stopped it, and for "not running" since when', () => {
    expect(causeExplanation('secretTooShort', null)).toMatch(/at least 32 characters/)
    expect(causeExplanation('unreachable', null)).toMatch(/does not lead to HQ/)
    expect(causeExplanation(null, new Date(2026, 9, 15, 9, 12), NOW)).toBe('The site has stopped. It was connected until 09:12 and nothing turned it away.')
  })
})

describe('the second line and the load', () => {
  it("lists HQ's site's projects, what each run gets and the scheduled change", () => {
    const at = new Date(Date.UTC(2026, 9, 18, 2, 0))
    const s = entry({ isDefault: true, projectCount: 2, scheduled: { kind: 'upgrade', at, expectedMinutes: 20, detail: null } })
    expect(rowDetail(s, 'UTC')).toBe('2 projects · runs get 8 GB memory, 4 processors · Scheduled maintenance: upgrade Sun 18 Oct at 02:00, about 20 minutes')
  })

  it('an unavailable site says how many runs wait, and has no projects line when none', () => {
    const s = entry({ connected: false, status: 'OFFLINE', projectCount: 0, waiting: { runs: 2, changes: 0 } })
    expect(rowDetail(s, 'UTC')).toBe('2 runs wait · runs get 8 GB memory, 4 processors')
  })

  it('writes the limits in the machine\'s units and the scheduled change in the reader\'s zone', () => {
    expect(runLimitsText({ memoryBytesPerContainer: GIB / 2, cpusPerContainer: 1, processesPerContainer: 1, containersAtOnce: 1 })).toBe('512 MB memory, 1 processor')
    const at = new Date(Date.UTC(2026, 9, 18, 2, 0))
    expect(scheduledLine({ kind: 'resize', at, expectedMinutes: null, detail: null }, 'Asia/Tokyo')).toBe('Scheduled maintenance: resize Sun 18 Oct at 11:00')
  })

  it('runs against capacity and how many wait', () => {
    expect(loadText(entry({ load: { running: 4, maxAtOnce: 4 }, waiting: { runs: 0, changes: 0, atCapacity: 3 } }))).toEqual({ runs: '4 of 4 runs', waiting: '3 waiting' })
    expect(loadText(entry({ load: null }))).toBeNull()
  })
})

describe('machine figures are a fleet admin\'s alone (spec §10) @SC-939', () => {
  const health = { takenAt: '', runs: { running: 1, maxAtOnce: 4 }, disk: { freeBytes: 182e9, totalBytes: 500e9 }, docker: { running: true, version: '27' }, agentImage: { name: 'a', present: true, version: '0.4.0' }, ceilings: null, memoryNearlyFull: false }

  it('a fleet admin\'s entry gives disk, Docker and the protocol', () => {
    expect(figureFacts(entry({ figures: true, health, protocolVersion: '1.0', hqProtocol: '1.0' }))).toEqual([
      { label: 'Disk', text: '182 GB free of 500 GB' },
      { label: 'Docker', text: 'Running · agent image 0.4.0 ready' },
      { label: 'Protocol', text: '1.0 — works with HQ' },
    ])
  })

  it('a refused site\'s protocol line says which side must upgrade', () => {
    const refused = (side: 'site' | 'hq', protocolVersion: string) =>
      figureFacts(entry({ figures: true, health: null, protocolVersion, hqProtocol: '1.0', problems: [{ kind: 'upgrade', protocolVersion, side }] }))
    expect(refused('hq', '3.0')).toEqual([{ label: 'Protocol', text: '3.0 — HQ speaks 1.0: upgrade HQ' }])
    expect(refused('site', '0.0')).toEqual([{ label: 'Protocol', text: '0.0 — HQ speaks 1.0: upgrade the site' }])
  })

  it('anyone else\'s entry, and a Cloud site\'s, gives none', () => {
    expect(figureFacts(entry({ figures: false, health: null, protocolVersion: null }))).toEqual([])
  })
})
