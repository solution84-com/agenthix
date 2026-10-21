import { useState } from 'react'
import type { CloudFleetAdminListing, CloudSiteSummary, CloudView, RemoteAccessView } from '@agenthix/core'
import { Button } from '@agenthix/ui/primitives'
import { Card, KeyValueRow, SectionHeading } from '../components'
import { authenticatorItem, cloudItems, type AccountItem } from '../cloud/accountParts'
import { CloudConnectionSection } from '../cloud/CloudConnectionSection'
import { CloudFleetAdminsList } from '../cloud/CloudFleetAdmins'
import { CloudGroup, type CloudGroupState } from '../cloud/CloudGroup'
import { CloudHqHero } from '../cloud/CloudHqHero'
import { CloudSiteView, SignInFirst } from '../cloud/CloudSitePage'
import { RemoteCodeFields, type SecondStep } from '../cloud/RemoteSignIn'
import { RecoveryCodes, ScanStep } from '../pages/remote-access/AuthenticatorSetupPage'
import { RemoteAccess } from '../pages/remote-access/RemoteAccessPage'
import { SAMPLE_HOSTS, SAMPLE_HQ } from './fleetSamples'

const at = (minutes: number) => new Date(Date.now() + minutes * 60_000).toISOString()
const figures = SAMPLE_HOSTS[0].figures
const site = (siteName: string, over: Partial<CloudSiteSummary> = {}): CloudSiteSummary => ({
  siteName, machineName: siteName, hostsHq: false, region: 'Helsinki', healthy: true, problem: null,
  agents: { running: 3, maxAtOnce: 8 }, figures: figures && { ...figures, installs: [{ ...figures.installs[0], target: 'site' }] }, ...over,
})
const ORG = SAMPLE_HQ.organisationName
const HQ_SITE = { fingerprint: SAMPLE_HOSTS[0].fingerprint, machineName: 'hq-box' }
const CONNECTED = { cloudOrganisationId: 'org_1', name: 'Acme Robotics', connectedAt: at(-60 * 24 * 3) }
const ON = { on: true as const, turnedOnBy: { via: 'cli' as const }, startedAt: at(-38), endsAt: at(78), address: 'https://hm-x7f3k2.relay.example' }
const ADMINS: CloudFleetAdminListing[] = [
  { cloudAccountId: 'acct_1', name: 'Avery Chen', email: 'avery@acme.example', fleetAdminInHq: true },
  { cloudAccountId: 'acct_2', name: 'Jordan Lee', email: 'jordan@acme.example', fleetAdminInHq: false },
]
const RECOVERY = ['k7qm-2xpa', '9rt4-hw3d', 'b6nv-ye82', 'c5jf-04xz', 'mt8s-ap7q', 'r2dw-j9ke', 'x4gc-31ub', 'u0lh-6zno', 'f8yv-dt5a', 'w3pe-m1cs']

const GROUPS: [string, CloudGroupState][] = [
  ['Not connected', { kind: 'notConnected' }],
  ['Connected, not signed in to Cloud', { kind: 'signInNeeded' }],
  ['Connected, no Cloud sites', { kind: 'sites', sites: [] }],
  ['Connected, with Cloud sites (HQ on Cloud is the hero, not repeated)', { kind: 'sites', sites: [site('hel-1', { hostsHq: true }), site('hel-2'), site('fra-1', { healthy: false, problem: 'Disk 88% full. Cloud is adding space.' })] }],
  ['A Cloud account with no role', { kind: 'noRole' }],
]

const REMOTE: [string, RemoteAccessView][] = [
  ['Off, the organisation not connected', { state: { on: false }, organisationConnected: false, place: 'onTheMachine' }],
  ['Off, connected: the usual state', { state: { on: false }, organisationConnected: true, place: 'onTheMachine' }],
  ['On, seen at the machine', { state: ON, organisationConnected: true, place: 'onTheMachine' }],
  ['On, seen through the tunnel', { state: ON, organisationConnected: true, place: 'throughRemoteAccess' }],
]

function Items({ items }: { items: AccountItem[] }) {
  return <>{items.map(i => <KeyValueRow key={i.key} label={i.fact}>{i.text}{i.action && <div className="mt-1">{i.action}</div>}</KeyValueRow>)}</>
}

/** Agenthix Cloud's scaffolds in every state the boards draw, with sample data: none of it is reachable from Cloud yet. */
export function CloudSamples() {
  const now = new Date()
  const [step, setStep] = useState<SecondStep>({ code: '' })
  const [action, setAction] = useState<string | null>(null)
  const linked: CloudView = {
    organisation: CONNECTED, account: { accountId: 'acct_8Q2vN', linkedAt: at(-60) }, place: 'onTheMachine', connecting: null, lastAttempt: null, cloudUrl: null, runByCloud: false,
  }
  return (
    <>
      <SectionHeading>Agenthix Cloud: the fleet's group, in its states</SectionHeading>
      {GROUPS.map(([label, state]) => (
        <div key={label} className="mb-3">
          <p className="text-micro text-text-muted">{label}</p>
          <CloudGroup state={state} org={ORG} hqSite={HQ_SITE} now={now} />
        </div>
      ))}
      <CloudHqHero site={site('hel-1', { hostsHq: true, figures: figures })} org={ORG} address={SAMPLE_HQ.address} now={now} />

      <SectionHeading>A Cloud site: before and after signing in to Cloud</SectionHeading>
      <SignInFirst ask={{ phase: 'idle' }} onSignIn={() => {}} />
      <div className="mt-4">
        <CloudSiteView key={action ?? 'none'} site={site('hel-2')} org={ORG} now={now} initialAction={action} />
        <Button variant="secondary" onClick={() => setAction('Upgrade')}>An action, once the Cloud permission has ended</Button>
      </div>

      <SectionHeading>HQ's site: the organisation's connection to Cloud</SectionHeading>
      <CloudConnectionSection view={{ organisation: null, account: null, place: 'onTheMachine', connecting: null, lastAttempt: null, cloudUrl: null, runByCloud: false }} org={ORG} />
      <CloudConnectionSection view={linked} org={ORG} />
      <CloudConnectionSection view={{ ...linked, place: 'throughRemoteAccess' }} org={ORG} />

      <SectionHeading>Remote access</SectionHeading>
      {REMOTE.map(([label, view]) => (
        <div key={label} className="mb-3">
          <p className="text-micro text-text-muted">{label}</p>
          <RemoteAccess view={view} org={ORG} machine="hq-box" hqSite={HQ_SITE} now={now} />
        </div>
      ))}

      <SectionHeading>The authenticator code: signing in remotely, setting it up, Your account</SectionHeading>
      <Card className="max-w-[380px]">
        <RemoteCodeFields step={step} onChange={setStep} machineName="hq-box" username="avery" />
      </Card>
      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <ScanStep keyText="JBSW Y3DP EHPK 3PXP" onDone={() => {}} onNotNow={() => {}} />
        <RecoveryCodes codes={RECOVERY} onStored={() => {}} />
      </div>
      <Card className="mt-3">
        <Items items={[
          authenticatorItem({ code: null, place: 'onTheMachine' }, 'sam'),
          authenticatorItem({ code: { setUpAt: at(-60 * 24 * 3), recoveryCodesLeft: 8 }, place: 'onTheMachine' }, 'sam'),
          authenticatorItem({ code: { setUpAt: at(-60 * 24 * 3), recoveryCodesLeft: 8 }, place: 'throughRemoteAccess' }, 'sam'),
          ...cloudItems({ organisation: CONNECTED, account: null, place: 'onTheMachine', connecting: null, lastAttempt: null, cloudUrl: null, runByCloud: false }),
          ...cloudItems(linked),
        ]} />
      </Card>

      <SectionHeading>Fleet admins on Cloud</SectionHeading>
      <CloudFleetAdminsList connected={false} list={{ phase: 'off' }} org={ORG} onGive={() => {}} />
      <CloudFleetAdminsList connected list={{ phase: 'ready', value: { admins: ADMINS } }} org={ORG} onGive={() => {}} />
    </>
  )
}
