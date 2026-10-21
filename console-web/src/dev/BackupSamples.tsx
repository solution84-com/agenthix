import { Card, SectionHeading } from '../components'
import { LocationCommand, TakeOutcome } from '../pages/backups/BackupParts'
import { KeyOnce } from '../pages/backups/ExportPanel'
import { siteBackupWords } from '../pages/backups/words'
import { SAMPLE_HOSTS } from './fleetSamples'

const office = SAMPLE_HOSTS[1]
const GB = 1000 ** 3

/** Backups: a site's words in each state, the location command, a backup taken now, and an export's key. */
export function BackupSamples() {
  const now = new Date()
  const backup = { id: '9f3a1c2b', night: '2026-10-14', takenAt: now.toISOString(), sizeBytes: 5.2 * GB, holds: ['site' as const], inLocation: false }
  return (
    <>
      <SectionHeading>Backups: a site in words, the location command, Back up now, an export's key</SectionHeading>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-3">
        <Card className="flex flex-col gap-1 text-small text-text-secondary">
          {SAMPLE_HOSTS.map(h => {
            const w = siteBackupWords(h, now)
            return <p key={h.fingerprint}><b className="text-text-primary">{w.name}</b> · {w.pill.label} · {w.last} · {w.location}</p>
          })}
        </Card>
        <Card><LocationCommand machineName="office-server" /></Card>
        <Card className="flex flex-col gap-2">
          <TakeOutcome state={{ phase: 'working' }} host={office} onDismiss={() => {}} />
          <TakeOutcome state={{ phase: 'done', backup }} host={office} onDismiss={() => {}} />
          <TakeOutcome state={{ phase: 'refused', message: 'A restore is running on this machine. Wait for it to finish, then try again.' }} host={office} onDismiss={() => {}} />
        </Card>
      </div>
      <div className="mt-3">
        <KeyOnce host={office} keepAs="show" now={now} onDone={() => {}}
          made={{ key: 'AGXK-7F3Q-M2PL-9WZD-H4TC-K8RN', exportId: 'office-server-2026-10-14T1158-export-9f3a1c2b.sealed', sizeBytes: 5.2 * GB, night: '2026-10-14', takenAt: now.toISOString() }} />
      </div>
    </>
  )
}
