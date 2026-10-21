import { useState } from 'react'
import type { CloudSiteSummary, CloudView } from '@agenthix/core'
import { Button, HostingBadge, Modal, StatePill } from '@agenthix/ui/primitives'
import { Card, FactCard, FactGroup, KeyValueRow, Notice, PageHeading, Say } from '../components'
import { useSessionDetails } from '../auth/useSessionDetails'
import { Meter } from '../pages/dashboard/Meter'
import { MEMORY_GB, diskUsedPercent, memoryUsedPercent, spanOf } from '../pages/dashboard/words'
import { useCloudAsk, useCloudRead, type CloudAsk } from './api'
import { CloudAskNotice } from './CloudMark'
import { cloudSiteHealth } from './CloudSiteCard'
import { CLOUD } from './words'

/**
 * A site Cloud runs (board *A Cloud site and its machine*). Cloud's machines are Cloud's controller's, never the
 * Fleet Console's: it shows them through Cloud's API with the person's own Cloud sign-in, and each action goes to Cloud,
 * which checks their Cloud role.
 */
export function CloudSitePage({ name }: { name: string }) {
  const org = useSessionDetails()?.hq?.organisationName ?? null
  const view = useCloudRead<CloudView>('/cloud')
  const signedIn = view.phase === 'ready' && view.value.account !== null
  const sites = useCloudRead<{ sites: CloudSiteSummary[] }>(signedIn ? '/cloud/sites' : null)
  const signIn = useCloudAsk()
  const site = sites.phase === 'ready' ? sites.value.sites.find(s => s.siteName === name) ?? null : null

  if (view.phase === 'loading') return null
  if (site) return <CloudSiteView site={site} org={org} now={new Date()} />
  return (
    <>
      <Heading name={name} org={org} />
      {view.phase === 'failed' && <Notice tone="warning" title="Cloud could not be asked">{view.message}</Notice>}
      {sites.phase === 'failed' && <Notice tone="warning" title="This site could not be read from Cloud">{sites.message}</Notice>}
      {!signedIn && <SignInFirst ask={signIn.ask} onSignIn={() => void signIn.send('POST', '/cloud/account/sign-in')} />}
    </>
  )
}

function Heading({ name, org, healthy }: { name: string; org: string | null; healthy?: { tone: 'healthy' | 'warning'; label: string } }) {
  return (
    <PageHeading
      title={name}
      badges={<><HostingBadge where="cloud" short />{healthy && <StatePill tone={healthy.tone}>{healthy.label}</StatePill>}</>}
      lede={`Site · on Cloud's machine${org ? ` · run for ${org}` : ''}`}
    />
  )
}

/** Before signing in to Cloud: the Fleet Console keeps none of a Cloud site's figures, so it cannot show them. */
export function SignInFirst({ ask, onSignIn }: { ask: CloudAsk; onSignIn: () => void }) {
  return (
    <Card className="max-w-2xl">
      <p className="text-body text-text-primary">
        <b className="font-semibold">Sign in to Cloud to see this site and its machine.</b>{' '}
        Their figures come from Cloud, with your own Cloud sign-in; the Fleet Console keeps none of them.
      </p>
      <Button className="mt-3" disabled={ask.phase === 'working'} onClick={onSignIn}>Sign in to Cloud ↗</Button>
      <div className="mt-3"><CloudAskNotice ask={ask} /></div>
    </Card>
  )
}

/** After signing in: the same two groups as a self-hosted site's, its machine run by Cloud. */
export function CloudSiteView({ site, org, now, initialAction = null }: { site: CloudSiteSummary; org: string | null; now: Date; initialAction?: string | null }) {
  const [action, setAction] = useState<string | null>(initialAction)
  const f = site.figures
  const siteInstall = f?.installs.find(i => i.target === 'site')
  const disk = f ? diskUsedPercent(f) : null
  const memory = f ? memoryUsedPercent(f) : null
  const ceilings = f?.ceilings
  return (
    <>
      <Heading name={site.siteName} org={org} healthy={cloudSiteHealth(site)} />
      <div className="mb-4 flex flex-wrap gap-2">
        <Button onClick={() => setAction('Upgrade')}>Upgrade…</Button>
        <Button variant="secondary" onClick={() => setAction('Resize')}>Resize…</Button>
        <Button variant="secondary" onClick={() => setAction('Logs')}>Logs</Button>
      </div>
      <FactGroup tag="The site" aside="what HQ uses, and what moves with it">
        <FactCard title="Execution Site" aside={<StatePill tone="healthy">Takes part</StatePill>}>
          <p className="text-small text-text-secondary">Takes part in HQ{siteInstall ? ` · Execution Site ${siteInstall.version}` : ''}</p>
        </FactCard>
        {ceilings && (
          <FactCard title="Capacity">
            <KeyValueRow label="Each run">{Math.round(ceilings.memoryBytesPerContainer / MEMORY_GB)} GB memory · {ceilings.cpusPerContainer} processors · {ceilings.processesPerContainer} processes</KeyValueRow>
            <KeyValueRow label="Runs at once">{ceilings.containersAtOnce}</KeyValueRow>
          </FactCard>
        )}
        <FactCard title="Version"><p className="text-small text-text-secondary">{siteInstall?.version ?? '—'} · Cloud applies fixes</p></FactCard>
      </FactGroup>
      <FactGroup tag="The machine" name={`Run by ${CLOUD}`} aside="what stays with the hardware" tinted>
        <FactCard title="System">
          <KeyValueRow label="Run by">{CLOUD}</KeyValueRow>
          {site.region && <KeyValueRow label="Where">{site.region}</KeyValueRow>}
          {f && <KeyValueRow label="Uptime">{spanOf(f.machine.upSince, now)}</KeyValueRow>}
          <KeyValueRow label="Health">{cloudSiteHealth(site).label}</KeyValueRow>
        </FactCard>
        {f && (
          <FactCard title="Use">
            <Meter label="Disk" value={disk} text={`${disk}%`} />
            <Meter label="Memory" value={memory} text={`${memory}%`} />
            <p className="text-micro text-text-muted">CPU load {f.resources.cpuLoad.toFixed(2)} (1-minute average)</p>
          </FactCard>
        )}
        <FactCard title="Host service">
          <Say>Cloud manages this machine. Each action here is sent to Cloud, which checks your Cloud role first; if it says no, you see its reason.</Say>
        </FactCard>
      </FactGroup>
      <PermissionEnded site={site.siteName} action={action} onClose={() => setAction(null)} />
    </>
  )
}

/**
 * An action on a Cloud machine. The Fleet Console holds a Cloud permission for one action and then forgets it, so
 * each action begins with signing in to Cloud for it.
 */
function PermissionEnded({ site, action, onClose }: { site: string; action: string | null; onClose: () => void }) {
  const signIn = useCloudAsk()
  return (
    <Modal open={action !== null} onClose={onClose} title={`${action ?? ''} ${site}`}>
      <p className="text-body text-text-primary">This machine is Cloud's. Cloud checks your role and carries it out — the Fleet Console only asks.</p>
      <p className="mt-2 text-body text-text-secondary">Your last Cloud permission has ended. Signing in again gives a new one for this action only.</p>
      <div className="mt-3"><CloudAskNotice ask={signIn.ask} /></div>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button disabled={signIn.ask.phase === 'working'} onClick={() => void signIn.send('POST', '/cloud/account/sign-in')}>Sign in to Cloud and continue ↗</Button>
      </div>
    </Modal>
  )
}
