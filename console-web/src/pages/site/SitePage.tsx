import { useState, type ReactNode } from 'react'
import { Button, Modal, StatePill } from '@agenthix/ui/primitives'
import { FactGroup, Notice, PageHeading } from '../../components'
import { navigate } from '../../router'
import { sitePath } from '../../shell/menu'
import { useShellPanel } from '../../shell/useShellPanel'
import { siteTag } from '../dashboard/dashboardWords'
import type { FleetHost } from '../dashboard/types'
import { describeHost, runsSite, whenIs } from '../dashboard/words'
import { useFeature } from '../../features/features'
import { DisconnectModal } from './DisconnectModal'
import { LivePreviewsSection } from './LivePreviewsSection'
import { NotifySetting } from './NotifySetting'
import { BackupsCard, HealthCard, NotifyCard, ProtectionsCard, RunsCard, SystemCard, VersionCard } from './SiteCards'
import { useHost } from './useHost'

/**
 * A site's page (board *Proposal*, 1 and 8): named after its machine, tagged *Site* or *HQ's site*, every action a
 * button in the header; then the site, then the machine it runs on. HQ's own site has this same page, and no page here
 * says anything of HQ itself — that is HQ's page.
 */
export function SitePage({ fingerprint }: { fingerprint: string }) {
  const state = useHost(fingerprint)
  const host = state.phase === 'loading' ? null : state.host

  if (state.phase === 'failed' && !host) {
    return (
      <>
        <PageHeading title={state.missing ? 'Site not found' : 'The site could not be read'} />
        <Notice tone="danger" action={state.missing ? undefined : <Button variant="secondary" onClick={state.refresh}>Try again</Button>}>{state.message}</Notice>
      </>
    )
  }
  if (!host) return null
  const now = state.phase === 'ready' ? state.readAt : state.phase === 'failed' ? state.readAt ?? new Date() : new Date()
  return <SiteView host={host} now={now} failure={state.phase === 'failed' ? state.message : null} refresh={state.refresh} />
}

function SiteView({ host, now, failure, refresh }: { host: FleetHost; now: Date; failure: string | null; refresh: () => void }) {
  // The live preview's section only while hq says it is on (adr-0172); the Fleet Console's server refuses it otherwise.
  const livePreviews = useFeature('livePreview')
  const [dialog, setDialog] = useState<'disconnect' | 'notify' | null>(null)
  const words = describeHost(host, now)
  const site = runsSite(host)
  const f = host.figures
  const go = (to: string) => () => navigate(`${sitePath(host.fingerprint)}/${to}`)
  const { openMaintenance } = useShellPanel()
  const aboutFigures = !f
    ? 'Waiting for its first figures.'
    : !host.online ? `These figures are from ${host.figuresAt ? whenIs(host.figuresAt, now) : 'earlier'}. ${words.sentence}` : null

  // One door to its maintenance, which knows the site and leaves what to do to the person. HQ's own site goes wherever
  // HQ goes, and is always watched: no notify setting, no disconnect of its own.
  const buttons: ReactNode[] = []
  if (site) {
    buttons.push(
      <Button key="maintenance" variant="secondary" onClick={() => openMaintenance(host.fingerprint)}>Plan maintenance…</Button>,
      <Button key="backup" variant="secondary" onClick={go('backups')}>Back up now</Button>,
    )
  }
  if (!host.hqMachine) {
    buttons.push(
      <Button key="notify" variant="secondary" onClick={() => setDialog('notify')}>Notify…</Button>,
      <Button key="disconnect" variant="danger" onClick={() => setDialog('disconnect')}>{host.leftByItself ? 'Remove from the list…' : 'Disconnect…'}</Button>,
    )
  }

  return (
    <>
      <PageHeading
        title={host.machineName}
        badges={<>
          {site && <span className="rounded-md bg-chip px-2 py-0.5 text-micro font-semibold uppercase tracking-[.06em] text-text-secondary">{siteTag(host)}</span>}
          <StatePill tone={words.tone}>{words.label}</StatePill>
        </>}
        lede={`${words.state === 'healthy' ? words.sentence.replace(/\.$/, '') : words.label} · connected since ${whenIs(host.connectedAt, now)}`}
      />
      {buttons.length > 0 && <div className="mb-4 flex flex-wrap gap-2">{buttons}</div>}
      {!host.hqMachine && (
        <>
          <DisconnectModal host={host} open={dialog === 'disconnect'} onClose={() => setDialog(null)} />
          <Modal open={dialog === 'notify'} onClose={() => setDialog(null)} title={`Notify about ${host.machineName}`}>
            <NotifySetting host={host} onChanged={refresh} />
            <div className="flex justify-end"><Button variant="secondary" onClick={() => setDialog(null)}>Done</Button></div>
          </Modal>
        </>
      )}

      {failure && (
        <Notice tone="warning" title="The figures below are not current" action={<Button variant="secondary" onClick={refresh}>Try again</Button>}>{failure}</Notice>
      )}
      {aboutFigures && <Notice tone="neutral">{aboutFigures}</Notice>}
      {(words.state === 'left' || !site) && <Notice tone={words.state === 'left' ? 'warning' : 'neutral'} title={site ? words.label : undefined}>{words.sentence}</Notice>}
      {words.state === 'empty' && (
        <p className="mb-4 text-small text-text-secondary">
          To run a site of its own here, disconnect this machine, then add it again with <i>Add a site</i>: its machine admin connects it with the new code.
          To move a site here instead, choose this machine when you plan that site's <i>Move</i>.
        </p>
      )}

      {site && (
        <FactGroup tag="The site" aside="what HQ uses, and what moves with it">
          <RunsCard host={host} />
          <VersionCard host={host} target="site" now={now} />
          <BackupsCard host={host} now={now} backupsTo={`${sitePath(host.fingerprint)}/backups`} />
        </FactGroup>
      )}
      {livePreviews && site && host.siteRegistered && host.online && <LivePreviewsSection host={host} now={now} />}
      {f && (
        <FactGroup tag="The machine" aside="what stays with the hardware" tinted>
          <HealthCard figures={f} copiesBytes={host.agents?.copiesBytes} />
          <ProtectionsCard figures={f} now={now} />
          <SystemCard figures={f} now={now} />
          <NotifyCard host={host} />
        </FactGroup>
      )}
    </>
  )
}
