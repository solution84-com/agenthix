import { useEffect, useState } from 'react'
import { BRANDING, type HostRequest } from '@agenthix/core'
import { Button, StatePill } from '@agenthix/ui/primitives'
import { FactGroup, HqLink, KeyValueRow, Notice, PageHeading, Say } from '../../components'
import { useConsoleStatus } from '../../auth/useConsoleStatus'
import { CloudConnection } from '../../cloud/CloudConnectionSection'
import { useHqSuspended } from '../../forms/hqSuspend'
import { HqUpgradeNotice } from '../../forms/HqUpgradeNotice'
import { navigate } from '../../router'
import { HQ_PATH } from '../../shell/menu'
import { useShellPanel } from '../../shell/useShellPanel'
import type { FleetHost, FleetResponse } from '../dashboard/types'
import { possessive, spanOf, whenIs } from '../dashboard/words'
import { BackupsCard, HealthCard, ProtectionsCard, SystemCard, VersionCard } from '../site/SiteCards'
import { EraseModal } from './EraseModal'
import { RelayCard } from './RelayCard'
import { DependsCard, HqSiteLine, ReachCard } from './HqCards'
import { commandWords, graceWords, hqCondition, hqHealth, localChange, newest, type Asked, type HqAction } from './hqWords'
import { useHostCommand } from './useHostCommand'

/**
 * HQ's page (board *Proposal*, 1): only HQ — how people reach it, who depends on it, its version and backups, a line
 * about its own site — then the machine it runs on. Suspended or erased, the page leads with that while it lasts
 * (board *Suspend, resume and erase*).
 */
export function HqPage({ fleet, host, now, failure, refresh, pollMs }: {
  fleet: FleetResponse
  host: FleetHost
  now: Date
  failure: string | null
  refresh: () => void
  pollMs?: number
}) {
  const address = fleet.hq?.address ?? null
  const org = fleet.hq?.organisationName
  const title = org ? `${possessive(org)} HQ` : 'HQ'
  const status = useConsoleStatus()
  const consoleHere = status.phase === 'ready' && status.status.machineName === host.machineName
  const command = useHostCommand(host.fingerprint, pollMs)
  const [asked, setAsked] = useState<Asked | null>(null)
  const [dialog, setDialog] = useState<'erase' | null>(null)
  const [scheduled, setScheduled] = useState(false)
  const suspendedHere = useHqSuspended()
  const { openMaintenance } = useShellPanel()

  const install = host.figures?.installs.find(i => i.target === 'hq')
  // Suspended from *Plan maintenance*, or anything asked on this page: the newer says what HQ is now.
  const local = newest(localChange(asked, command.run, host.online), suspendedHere ? { kind: 'suspended', at: suspendedHere } : null)
  const condition = hqCondition(install, local)
  const settled = local?.kind ?? null
  useEffect(() => {
    if (settled) setDialog(null)
  }, [settled])
  useEffect(() => {
    if (asked?.action === 'eraseLater' && command.run.phase === 'done') {
      setDialog(null)
      setScheduled(true)
    }
  }, [asked, command.run])

  const ask = (action: HqAction, request: HostRequest) => {
    setAsked({ action, at: new Date().toISOString(), wasOnline: host.online })
    command.send(request)
  }
  const openErase = () => { command.reset(); setAsked(null); setDialog('erase') }
  const said = asked && !dialog ? commandWords(asked.action, command.run) : null
  const go = (to: string) => () => navigate(`${HQ_PATH}/${to}`)
  const cli = (words: string) => <code className="font-mono">{BRANDING.cliCommand} {words}</code>
  const machine = host.machineName
  const modals = (
    <>
      <EraseModal open={dialog === 'erase'} machineName={machine} address={address} locationSet={host.figures?.backups.locationSet ?? false}
        run={{ action: asked?.action === 'eraseLater' ? 'eraseLater' : 'erase', run: asked?.action === 'erase' || asked?.action === 'eraseLater' ? command.run : { phase: 'idle' } }}
        onErase={(request, later) => ask(later ? 'eraseLater' : 'erase', request)} onClose={() => setDialog(null)} />
    </>
  )
  const saidNotice = said && said.text !== '' && <Notice tone={said.tone} title={said.title}>{said.text}</Notice>
  const where = `on ${machine}${consoleHere ? ', with this Fleet Console' : ''}`

  if (condition.kind === 'suspended') {
    return (
      <>
        <PageHeading title={title} badges={<StatePill tone="warning">HQ suspended</StatePill>} lede={`on ${machine} · its site still runs there`} />
        {saidNotice}
        <Notice tone="warning">HQ is suspended since {whenIs(condition.since, now)}. Nobody can sign in and no agent runs. Resume starts it again as it was.</Notice>
        <div className="mb-3 max-w-2xl rounded-xl border border-border bg-card px-4 py-1">
          <KeyValueRow label="Data, backups, credentials">kept</KeyValueRow>
          <KeyValueRow label="Sites">waiting — they reconnect when HQ resumes</KeyValueRow>
          {address && <KeyValueRow label="Address"><span className="font-mono">{address}</span></KeyValueRow>}
        </div>
        <div className="mb-3 max-w-2xl">
          <Say lead="This Fleet Console reaches every machine through HQ,">
            so while HQ is suspended it may not reach {machine}. If Resume HQ gets no answer, run on {machine}: {cli('hq resume')}
          </Say>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" disabled={command.run.phase === 'working'} onClick={() => ask('resume', { op: 'resume', target: 'hq' })}>Resume HQ</Button>
          <Button variant="danger" onClick={() => setDialog('erase')}>Erase…</Button>
        </div>
        {modals}
      </>
    )
  }

  if (condition.kind === 'erased') {
    const g = graceWords(condition, now)
    return (
      <>
        <PageHeading title={title} badges={<StatePill tone="danger">{g.pill}</StatePill>} lede={`on ${machine} · its site still runs there`} />
        <Notice tone="warning">{g.sentence}</Notice>
        <div className="mb-3 max-w-2xl rounded-xl border border-border bg-card px-4 py-1">
          <KeyValueRow label="Final backup">on {machine} · sealed · key held by {machine}</KeyValueRow>
          {host.figures?.backups.locationSet && <KeyValueRow label="Copy in the backup location">sealed · key kept by whoever set the location</KeyValueRow>}
        </div>
        <div className="max-w-2xl">
          <Say lead="Restoring HQ is done on its machine,">where the final backup is kept. On {machine}, run: {cli('hq restore')}</Say>
        </div>
      </>
    )
  }

  const health = hqHealth(install, host.online, !!host.figures)
  const f = host.figures
  return (
    <>
      <PageHeading
        title={title}
        badges={<StatePill tone={health.tone}>{health.label}</StatePill>}
        lede={[health.sentence, install?.healthy && host.online ? `up ${spanOf(install.since, now)}` : null, where].filter(Boolean).join(' · ')}
      />
      <div className="mb-4 flex flex-wrap gap-2">
        {address && <HqLink address={address}>Open HQ ↗</HqLink>}
        <Button variant="secondary" onClick={() => openMaintenance('hq')}>Plan maintenance…</Button>
        <Button variant="secondary" onClick={go('backups')}>Back up now</Button>
        <Button variant="danger" onClick={openErase}>Erase…</Button>
      </div>
      {modals}
      {saidNotice}
      <HqUpgradeNotice host={host} now={now} />
      {scheduled && <Notice tone="healthy" title="The erase is scheduled.">Members see a notice from now, and a countdown until it runs. You can cancel it in Maintenance.</Notice>}
      {failure && <Notice tone="warning" title="The figures below are not current" action={<Button variant="secondary" onClick={refresh}>Try again</Button>}>{failure}</Notice>}
      {!f && <Notice>Waiting for its first figures.</Notice>}

      <FactGroup tag="HQ" aside="what people sign in to">
        <ReachCard host={host} address={address} now={now} />
        {fleet.hqRelay && <RelayCard relay={fleet.hqRelay} />}
        <DependsCard hosts={fleet.hosts} />
        <VersionCard host={host} target="hq" now={now} />
        <BackupsCard host={host} now={now} backupsTo={`${HQ_PATH}/backups`} next />
        <HqSiteLine host={host} />
      </FactGroup>
      <CloudConnection org={org ?? null} />
      {f && (
        <FactGroup tag="The machine HQ runs on" name={machine} aside="what stays with the hardware" tinted>
          <HealthCard figures={f} copiesBytes={host.agents?.copiesBytes} />
          <ProtectionsCard figures={f} now={now} />
          <SystemCard figures={f} now={now} />
        </FactGroup>
      )}
    </>
  )
}
