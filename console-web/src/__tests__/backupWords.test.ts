import { describe, expect, it } from 'vitest'
import type { BackupFigures, BackupSummary, HostFigures } from '@agenthix/core'
import type { FleetHost } from '../pages/dashboard/types'
import {
  backupsLede, exportRequest, exportWarning, keyFileName, keyFileText, locationCommand, siteBackupWords, sizeWords,
  takeRequest, takenWords,
} from '../pages/backups/words'

const NOW = new Date(2026, 9, 15, 12, 0, 0)
const GB = 1000 ** 3
const at = (h: number, m = 0, dayOffset = 0) => new Date(2026, 9, 15 + dayOffset, h, m).toISOString()
const DAY = 86400_000

const backups = (over: Partial<BackupFigures> = {}): BackupFigures => ({
  lastNightlyAt: at(2), lastNightlyOk: true, locationSet: true, lastCopyAt: at(2, 20), lastExportAt: null, nightlyAt: '02:00', ...over,
})
const figures = (b: BackupFigures = backups(), installs: HostFigures['installs'] = [site()]): HostFigures => ({
  takenAt: NOW.toISOString(),
  machine: { name: 'office-server', system: 'Ubuntu 24.04', dockerVersion: '27.3', hostServiceVersion: '0.2.0', upSince: at(0, 0, -20) },
  resources: { cpuLoad: 0.2, memory: { usedBytes: 9 * GB, totalBytes: 16 * GB }, disk: { freeBytes: 120 * GB, totalBytes: 200 * GB } },
  ceilings: { memoryBytesPerContainer: 4 * GB, cpusPerContainer: 2, processesPerContainer: 512, containersAtOnce: 6 },
  protections: { holding: true, rules: ['machine-ports'], checkedAt: NOW.toISOString(), problem: null },
  installs, backups: b, frontDoor: { on: false, certificateExpiresAt: null, renewalProblem: null }, scheduledChanges: 0,
})
function site(over: Partial<HostFigures['installs'][number]> = {}): HostFigures['installs'][number] {
  return { target: 'site', version: '0.2.0', state: 'running', since: at(0, 0, -1), healthy: true, problem: null, ...over }
}
const host = (over: Partial<FleetHost> = {}): FleetHost => ({
  fingerprint: 'a'.repeat(64), fingerprintShort: 'aaaa', hostId: 'h1', machineName: 'office-server', siteName: 'office', hqMachine: false,
  siteRegistered: true, connectedAt: at(0, 0, -30), online: true, since: at(0, 0, -3), leftByItself: false, leftAt: null,
  figures: figures(), figuresAt: NOW.toISOString(), agents: null, scheduled: [], move: null, ...over,
})

describe("a site's backups in words @SC-905", () => {
  it('names the site after its machine, what its backups hold, and when it backs up', () => {
    const w = siteBackupWords(host(), NOW)
    expect(w.name).toBe('office-server')
    expect(w.holds).toBe("the site's database and workspaces")
    expect(w.schedule).toBe("Each night at 02:00, office-server's own time.")
  })

  it("HQ's machine holds HQ as well", () => {
    const w = siteBackupWords(host({ hqMachine: true, machineName: 'hq-box', siteName: 'hq-box' }), NOW)
    expect(w.name).toBe('HQ')
    expect(w.holds).toBe("HQ — its database, storage and secrets — and its own site's database and workspaces, on hq-box")
  })

  it('a last backup that reached the backup location', () => {
    const w = siteBackupWords(host(), NOW)
    expect(w.state).toBe('copied')
    expect(w.last).toBe('Last backup today 02:00')
    expect(w.location).toBe('In the backup location since today 02:20')
    expect(w.pill).toEqual({ label: 'Sealed · copied', tone: 'healthy' })
  })

  it('a backup location set after the last backup: the next one is the first copied there', () => {
    const w = siteBackupWords(host({ figures: figures(backups({ lastCopyAt: null })) }), NOW)
    expect(w.state).toBe('copyPending')
    expect(w.location).toBe('A backup location is set; the next backup is the first one copied there')
    expect(w.pill.label).toBe('Location set')
  })

  it('a last backup that did not reach the backup location', () => {
    const w = siteBackupWords(host({ figures: figures(backups({ lastCopyAt: at(2, 20, -1) })) }), NOW)
    expect(w.state).toBe('copyMissed')
    expect(w.location).toBe('The last backup did not reach the backup location; the newest copy there is from yesterday 02:20')
    expect(w.pill).toEqual({ label: 'Copy missed', tone: 'warning' })
  })

  it('no backup location: on this machine only, with the last export', () => {
    const none = siteBackupWords(host({ figures: figures(backups({ locationSet: false, lastCopyAt: null })) }), NOW)
    expect(none.state).toBe('onlyHere')
    expect(none.location).toBe('No backup location. No export has been made.')
    expect(none.pill).toEqual({ label: 'No copy elsewhere', tone: 'warning' })
    const old = siteBackupWords(host({ figures: figures(backups({ locationSet: false, lastCopyAt: null, lastExportAt: new Date(NOW.getTime() - 41 * DAY).toISOString() })) }), NOW)
    expect(old.location).toBe('No backup location. The last export was 41 days ago.')
  })

  it('a failed backup, and none yet', () => {
    expect(siteBackupWords(host({ figures: figures(backups({ lastNightlyOk: false })) }), NOW)).toMatchObject({
      state: 'failed', last: 'The last backup, today 02:00, failed', pill: { label: 'Last backup failed', tone: 'danger' },
    })
    expect(siteBackupWords(host({ figures: figures(backups({ lastNightlyAt: null, lastNightlyOk: null, lastCopyAt: null })) }), NOW)).toMatchObject({
      state: 'none', last: 'No backup yet', pill: { label: 'No backup yet', tone: 'neutral' },
    })
  })

  it('an offline machine says since when, and its last backup, and cannot be asked', () => {
    const w = siteBackupWords(host({ online: false, since: at(18, 2, -3) }), NOW)
    expect(w.state).toBe('offline')
    expect(w.last).toBe('Not answering since 12 Oct 18:02 · last backup today 02:00')
    expect(w.pill).toEqual({ label: 'Not answering', tone: 'warning' })
    expect(w.canAsk).toBe(false)
    expect(siteBackupWords(host({ online: false, since: at(18, 2, -3), notifyIfSilent: false }), NOW).pill).toEqual({ label: 'Not heard from', tone: 'neutral' })
    expect(siteBackupWords(host({ online: false, since: at(18, 2, -3), stoppedAt: at(18, 2, -3) }), NOW)).toMatchObject({
      last: 'Stopped on its machine on 12 Oct at 18:02 · last backup today 02:00', pill: { label: 'Stopped', tone: 'neutral' },
    })
  })

  it('a suspended site: its nightly backup waits', () => {
    const w = siteBackupWords(host({ figures: figures(backups(), [site({ state: 'suspended' })]) }), NOW)
    expect(w.state).toBe('suspended')
    expect(w.pill.label).toBe('Suspended')
    expect(w.schedule).toBe('Suspended: the nightly backup waits until it resumes.')
  })

  it('without figures it says so', () => {
    const w = siteBackupWords(host({ figures: null }), NOW)
    expect(w).toMatchObject({ state: 'noFigures', last: 'Waiting for its first figures', canAsk: true })
  })
})

describe("the warning when a site's backups are on its machine only @SC-905", () => {
  it('names the machine and the last export', () => {
    const b = backups({ locationSet: false, lastCopyAt: null, lastExportAt: new Date(NOW.getTime() - 41 * DAY).toISOString() })
    expect(exportWarning(host({ figures: figures(b) }), NOW)).toBe(
      "This site's backups are only on office-server. If office-server is lost, so are they. The last export was 41 days ago. Set a backup location on office-server, or export a backup now.",
    )
  })
  it('says nothing when a location is set', () => {
    expect(exportWarning(host(), NOW)).toBeNull()
  })
})

describe("the Backups page's lede @SC-905", () => {
  it('when the nightly backups run, and how many keep them on their own machine only', () => {
    expect(backupsLede([
      host(),
      host({ fingerprint: 'b'.repeat(64), figures: figures(backups({ locationSet: false, lastCopyAt: null })) }),
      host({ fingerprint: 'c'.repeat(64), online: false, figures: figures(backups({ locationSet: false, lastCopyAt: null })) }),
    ])).toBe("Every night at each machine's 02:00. 2 of 3 keep their backups on their own machine only.")
  })
  it('machines set to different times', () => {
    expect(backupsLede([host(), host({ figures: figures(backups({ nightlyAt: '03:30' })) })]))
      .toBe('Every night, at the time each machine is set to. 0 of 2 keep their backups on their own machine only.')
  })
  it('nothing to say before any figures', () => {
    expect(backupsLede([host({ figures: null })])).toBeNull()
  })
})

describe('the commands @SC-905', () => {
  it('Back up now is backup.take, checked against the closed set', () => {
    expect(takeRequest()).toEqual({ op: 'backup.take' })
  })
  it('an export names the backup it seals', () => {
    expect(exportRequest('9f3a1c2b')).toEqual({ op: 'backup.export', backupId: '9f3a1c2b' })
  })
  it('a request the closed set refuses is not sent', () => {
    expect(() => exportRequest('')).toThrow(/backup/)
  })
})

describe('what a backup taken now says @SC-905', () => {
  const summary = (over: Partial<BackupSummary> = {}): BackupSummary => ({
    id: '9f3a1c2b', night: '2026-10-14', takenAt: at(11, 58), sizeBytes: 1.4 * GB, holds: ['site'], inLocation: true, ...over,
  })
  it('copied to the backup location', () => {
    expect(takenWords(summary(), 'office-server', true)).toBe('Backed up: 1.4 GB, sealed, kept on office-server. A copy is in the backup location.')
  })
  it('a copy that did not complete', () => {
    expect(takenWords(summary({ inLocation: false }), 'office-server', true)).toBe('Backed up: 1.4 GB, sealed, kept on office-server. The copy to the backup location did not complete.')
  })
  it('no backup location', () => {
    expect(takenWords(summary({ inLocation: false, sizeBytes: 300 * 1000 ** 2 }), 'office-server', false)).toBe('Backed up: 300 MB, sealed, kept on office-server only: no backup location is set.')
  })
})

describe('sizes, the key file and the location command @SC-905', () => {
  it('sizes in MB below a gigabyte', () => {
    expect(sizeWords(5.2 * GB)).toBe('5.2 GB')
    expect(sizeWords(12 * 1000)).toBe('1 MB')
  })
  it("the key file is named for the site and the night, and holds the key and the export's name", () => {
    expect(keyFileName('Acme HQ', '2026-10-13')).toBe('acme-hq-2026-10-13.key')
    const text = keyFileText('AGXK-7F3Q-M2PL-9WZD-H4TC-K8RN', 'office', 'office-server-2026-10-13T0200-export-9f3a.sealed')
    expect(text).toContain('AGXK-7F3Q-M2PL-9WZD-H4TC-K8RN')
    expect(text).toContain('office-server-2026-10-13T0200-export-9f3a.sealed')
  })
  it('the command that sets a backup location, run on the machine', () => {
    expect(locationCommand).toBe('agenthix backup location <path>')
  })
})
