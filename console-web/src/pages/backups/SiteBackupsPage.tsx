import { useState, type ReactNode } from 'react'
import { Button, HostingBadge, StatePill } from '@agenthix/ui/primitives'
import { FactCard, FactGroup, KeyValueRow, PageHeading, Say } from '../../components'
import { possessive } from '../dashboard/words'
import type { FleetHost } from '../dashboard/types'
import { useHost, useHostRead } from '../site/useHost'
import { CloudOfferLine } from '../../cloud/CloudOfferLine'
import { LocationCommand, TakeOutcome } from './BackupParts'
import { useTakeBackup } from './commands'
import { ExportPanel } from './ExportPanel'
import { NightsCard } from './NightsCard'
import { carriesHq, exportWarning, locationCommand, siteBackupWords } from './words'

/**
 * One thing's backups — a site's, or HQ's with its own site (board *Backups — one site's Backups*, *A site with no
 * backup location*), and its export; `exporting` opens with the export, as *Export…* on the Backups page asks.
 */
export function SiteBackupsPage({ fingerprint, exporting = false, pollMs }: { fingerprint: string; exporting?: boolean; pollMs?: number }) {
  const state = useHost(fingerprint)
  const read = useHostRead(state, 'The site')
  const host = state.phase === 'loading' ? null : state.host
  if (read.failedWithoutData) {
    return (
      <>
        <PageHeading title={state.phase === 'failed' && state.missing ? 'Machine not found' : 'The site could not be read'} />
        {read.nudge}
      </>
    )
  }
  if (!host) return null
  const now = state.phase === 'ready' ? state.readAt : state.phase === 'failed' ? state.readAt ?? new Date() : new Date()
  return <SiteBackups host={host} now={now} pollMs={pollMs} refresh={state.refresh} meta={read.nudge} exportFirst={exporting} />
}

function SiteBackups({ host, now, pollMs, refresh, meta, exportFirst }: { host: FleetHost; now: Date; pollMs?: number; refresh: () => void; meta: ReactNode; exportFirst: boolean }) {
  const [exporting, setExporting] = useState(exportFirst && host.online)
  const take = useTakeBackup(host.fingerprint, pollMs, refresh)
  const w = siteBackupWords(host, now)
  const hq = carriesHq(host)
  const title = `${possessive(hq ? 'HQ' : host.machineName)} backups`
  const warning = exportWarning(host, now)
  const offline = host.online ? undefined : {
    reason: `${host.machineName} is not answering, so it cannot be asked to back up or export now.`,
    detail: `${host.machineName} is not answering, so it cannot be asked to back up or export now. It keeps backing up on its own each night.`,
  }
  const b = host.figures?.backups
  return (
    <>
      <PageHeading
        title={title}
        badges={<><span className="text-small text-text-secondary">{hq ? `HQ and its own site, on ${host.machineName}` : 'Site'}</span><HostingBadge where="self-hosted" /><StatePill tone={w.pill.tone}>{w.pill.label}</StatePill></>}
        meta={meta}
        lede={b ? `Each night at ${b.nightlyAt} (${possessive(host.machineName)} own time) it backs up ${w.holds}, sealed. Its key is held by ${possessive(host.machineName)} host service.` : undefined}
      />

      {exporting ? (
        <ExportPanel host={host} now={now} pollMs={pollMs} onClose={() => setExporting(false)} />
      ) : (
        <>
          {warning && <div className="mb-3 max-w-3xl"><Say warn>{warning}</Say></div>}
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <Button variant="secondary" onClick={take.take} refusal={offline} disabled={host.online && take.state.phase === 'working'}>{take.state.phase === 'working' ? `Taking a sealed backup on ${host.machineName}…` : 'Take a backup now'}</Button>
            <Button variant="secondary" onClick={() => { take.reset(); setExporting(true) }} refusal={offline} disabled={host.online && take.state.phase === 'working'}>Export a backup…</Button>
          </div>
          <TakeOutcome state={take.state} />
          <FactGroup tag="Backups" name={host.machineName} aside="each machine backs up on its own">
            <NightsCard host={host} summary={w.last} schedule={w.schedule} aside={<StatePill tone={w.pill.tone}>{w.pill.label}</StatePill>} />
            <FactCard title="Backup location" aside={b ? <StatePill tone={b.locationSet ? 'neutral' : 'warning'}>{b.locationSet ? 'Set' : 'Not set'}</StatePill> : undefined}>
              {!b ? <p className="text-small text-text-secondary">Waiting for its first figures.</p> : b.locationSet ? (
                <>
                  <p className="text-small text-text-primary">{w.location}.</p>
                  <KeyValueRow label="Its key">kept by whoever set the location, not by the machines</KeyValueRow>
                  <p className="text-small text-text-muted">The folder is shown only on {host.machineName}. To change it, run <code className="font-mono">{locationCommand}</code> there.</p>
                </>
              ) : (
                <>
                  <p className="text-small text-text-primary">Nightly backups stay on this machine until a machine admin sets one.</p>
                  <LocationCommand machineName={host.machineName} />
                </>
              )}
            </FactCard>
          </FactGroup>
          {hq && b && !b.locationSet && <CloudOfferLine offer="backups" from="fleet-console-backups" />}
        </>
      )}
    </>
  )
}
