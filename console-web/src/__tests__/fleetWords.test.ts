import { describe, expect, it } from 'vitest'
import type { HostFigures } from '@agenthix/core'
import { describeHost, whenIs } from '../pages/dashboard/words'
import type { FleetHost } from '../pages/dashboard/types'

const NOW = new Date(2026, 9, 15, 12, 0)
const GB = 1000 ** 3

function figures(over: { diskUsed?: number; memUsed?: number; healthy?: boolean; problem?: string | null; protections?: boolean } = {}): HostFigures {
  const total = 100 * GB
  return {
    takenAt: NOW.toISOString(),
    machine: { name: 'office-server', system: 'Linux', dockerVersion: '27', hostServiceVersion: '0.2.0', upSince: new Date(2026, 9, 3, 12, 0).toISOString() },
    resources: { cpuLoad: 0.2, memory: { usedBytes: (over.memUsed ?? 30) * GB, totalBytes: total }, disk: { freeBytes: (100 - (over.diskUsed ?? 40)) * GB, totalBytes: total } },
    ceilings: { memoryBytesPerContainer: GB, cpusPerContainer: 1, processesPerContainer: 100, containersAtOnce: 6 },
    protections: { holding: over.protections ?? true, rules: [], checkedAt: NOW.toISOString(), problem: over.protections === false ? 'A rule is not holding.' : null },
    installs: [{ target: 'site', version: '0.2.0', state: 'running', since: NOW.toISOString(), healthy: over.healthy ?? true, problem: over.problem ?? null }],
    backups: { lastNightlyAt: null, lastNightlyOk: null, locationSet: false, lastCopyAt: null, lastExportAt: null, nightlyAt: '02:00' },
    frontDoor: { on: false, certificateExpiresAt: null, renewalProblem: null },
    scheduledChanges: 0,
  }
}

function host(over: Partial<FleetHost> = {}): FleetHost {
  return {
    fingerprint: 'f'.repeat(64), fingerprintShort: 'ffff-ffff', hostId: 'h1', machineName: 'office-server', siteName: 'office-server',
    hqMachine: false, siteRegistered: true, connectedAt: NOW.toISOString(), online: true, since: NOW.toISOString(),
    leftByItself: false, leftAt: null, figures: figures(), figuresAt: NOW.toISOString(), agents: null, scheduled: [], move: null, ...over,
  }
}

describe('whenIs', () => {
  it('says today, yesterday and a date in words', () => {
    expect(whenIs(new Date(2026, 9, 15, 2, 0).toISOString(), NOW)).toBe('today 02:00')
    expect(whenIs(new Date(2026, 9, 14, 18, 2).toISOString(), NOW)).toBe('yesterday 18:02')
    expect(whenIs(new Date(2026, 9, 11, 2, 0).toISOString(), NOW)).toBe('11 Oct 02:00')
  })
})

describe('what a machine\'s card says @SC-897', () => {
  it('online with healthy figures: Healthy', () => {
    const w = describeHost(host(), NOW)
    expect(w).toMatchObject({ state: 'healthy', label: 'Healthy', tone: 'healthy', attention: null })
  })

  it('Up is the site\'s own time running, not the machine\'s connection time', () => {
    const f = figures()
    f.installs[0].since = new Date(2026, 9, 12, 12, 0).toISOString()
    const w = describeHost(host({ figures: f, since: new Date(2026, 9, 15, 11, 55).toISOString() }), NOW)
    expect(w.sentence).toBe('Up 3 days.')
  })

  it('a site that is starting reads as starting, never as needing attention', () => {
    const f = figures({ healthy: false })
    f.installs[0].state = 'starting'
    const w = describeHost(host({ figures: f }), NOW)
    expect(w).toMatchObject({ state: 'starting', tone: 'neutral', label: 'Starting…', attention: null })
  })

  it('a part that is stopped or failing, past its start, still needs attention', () => {
    const f = figures({ healthy: false })
    f.installs[0].state = 'failed'
    expect(describeHost(host({ figures: f }), NOW)).toMatchObject({ state: 'attention', label: 'Needs attention' })
  })

  it('online before its first figures: says it waits, and is not a problem', () => {
    expect(describeHost(host({ figures: null, figuresAt: null }), NOW)).toMatchObject({ state: 'starting', label: 'Online', attention: null })
  })

  describe('a machine that is not answering', () => {
    const YESTERDAY = new Date(2026, 9, 14, 18, 2).toISOString()
    const minutesAgo = (n: number) => new Date(NOW.getTime() - n * 60_000).toISOString()

    it('ticked, silent for 10 minutes: Not answering, and it needs attention', () => {
      const w = describeHost(host({ online: false, since: YESTERDAY }), NOW)
      expect(w).toMatchObject({ state: 'notAnswering', label: 'Not answering', tone: 'warning', attention: 'not answering' })
      expect(w.sentence).toBe('Not answering since yesterday 18:02.')
      expect(describeHost(host({ online: false, since: minutesAgo(11), notifyIfSilent: true }), NOW).state).toBe('notAnswering')
    })

    it('unticked: only not heard from, neutral, never attention', () => {
      const w = describeHost(host({ online: false, since: YESTERDAY, notifyIfSilent: false }), NOW)
      expect(w).toMatchObject({ state: 'notHeard', label: 'Not heard from', tone: 'neutral', attention: null })
      expect(w.sentence).toBe('Not heard from since yesterday 18:02.')
    })

    it('silent for less than 10 minutes, as HQ counts: neutral either way, so a restart never alarms', () => {
      for (const notifyIfSilent of [true, false]) {
        expect(describeHost(host({ online: false, since: minutesAgo(9), notifyIfSilent }), NOW)).toMatchObject({ state: 'notHeard', attention: null })
      }
      expect(describeHost(host({ online: false, since: null }), NOW).sentence).toBe('Not heard from yet.')
    })

    it('HQ’s machine is always told about, whatever it says', () => {
      expect(describeHost(host({ online: false, since: YESTERDAY, hqMachine: true, notifyIfSilent: false }), NOW).state).toBe('notAnswering')
    })

    it('stopped on its machine: says when, neutral, whatever the setting, until it answers again', () => {
      for (const notifyIfSilent of [true, false]) {
        const w = describeHost(host({ online: false, since: YESTERDAY, stoppedAt: new Date(2026, 9, 15, 9, 30).toISOString(), notifyIfSilent }), NOW)
        expect(w).toMatchObject({ state: 'stopped', label: 'Stopped', tone: 'neutral', attention: null })
        expect(w.sentence).toBe('Stopped on its machine at 09:30.')
      }
      expect(describeHost(host({ stoppedAt: NOW.toISOString() }), NOW).state).toBe('healthy')
    })

    it('a machine with no site reads the same way under its own name', () => {
      const w = describeHost(host({ online: false, since: YESTERDAY, siteRegistered: false, figures: null }), NOW)
      expect(w).toMatchObject({ state: 'empty', attention: 'not answering' })
      expect(w.sentence).toBe('Nothing runs here but its host service. Not answering since yesterday 18:02.')
      expect(describeHost(host({ online: false, since: YESTERDAY, siteRegistered: false, figures: null, notifyIfSilent: false }), NOW).attention).toBeNull()
    })
  })

  it('disconnected on its own machine: left by itself, waiting to be removed, needs attention', () => {
    const w = describeHost(host({ online: false, leftByItself: true, leftAt: new Date(2026, 9, 15, 9, 30).toISOString() }), NOW)
    expect(w).toMatchObject({ state: 'left', label: 'Disconnected on its machine', tone: 'warning' })
    expect(w.sentence).toBe('This machine disconnected itself today 09:30. It stays listed until you remove it from the list: HQ then forgets it and its site, and nothing on the machine changes.')
    expect(w.attention).toBe('disconnected itself')
  })

  it('left by itself outranks not answering', () => {
    expect(describeHost(host({ online: false, leftByItself: true, leftAt: NOW.toISOString() }), NOW).state).toBe('left')
  })

  it('a machine about to receive a site waits for it by name', () => {
    const w = describeHost(host({ move: { moveId: 'm', role: 'receiving', siteName: 'office-server', state: 'waitingForMachine', at: null } }), NOW)
    expect(w).toMatchObject({ state: 'moving', label: 'Waiting to receive office-server' })
  })

  it('a site moving away says so', () => {
    const w = describeHost(host({ move: { moveId: 'm', role: 'sending', siteName: 'office-server', state: 'running', at: null } }), NOW)
    expect(w).toMatchObject({ state: 'moving', label: 'Moving' })
    expect(w.sentence).toBe('office-server is moving to another machine.')
  })

  it('a disk 90% full or more needs attention, with what is left and what follows', () => {
    const w = describeHost(host({ figures: figures({ diskUsed: 91 }) }), NOW)
    expect(w).toMatchObject({ state: 'attention', label: 'Needs attention', tone: 'warning', attention: 'disk 91% full' })
    expect(w.sentence).toBe('Disk 91% full, 9 GB left. Free space before it fills, or the site stops taking runs.')
  })

  it('a disk at 89% does not', () => {
    expect(describeHost(host({ figures: figures({ diskUsed: 89 }) }), NOW).state).toBe('healthy')
  })

  it('memory in use at 90% or more needs attention', () => {
    expect(describeHost(host({ figures: figures({ memUsed: 95 }) }), NOW)).toMatchObject({ state: 'attention', attention: 'memory 95% in use' })
  })

  it("an install that is not healthy shows the host service's own sentence", () => {
    const w = describeHost(host({ figures: figures({ healthy: false, problem: 'The site did not start.' }) }), NOW)
    expect(w).toMatchObject({ state: 'attention', tone: 'danger', sentence: 'The site did not start.', attention: 'the site did not start' })
  })

  it('protections that do not hold need attention', () => {
    expect(describeHost(host({ figures: figures({ protections: false }) }), NOW)).toMatchObject({ state: 'attention', sentence: 'A rule is not holding.' })
  })
})
