/**
 * Every component the Fleet Console draws, for checking against the boards (development builds only, at
 * /_components). The page shows itself twice, light and dark side by side: each half is the same page in a frame
 * with `?embed&theme=…`, since the theme is chosen on <html>.
 */
import { useEffect, useState } from 'react'
import { Plus } from 'lucide-react'
import { Button, EmptyState, HostingBadge, StatePill, useAttention, ConfirmDialog } from '@agenthix/ui/primitives'
import {
  Card, DropDown, FactCard, FactGroup, KeyValueRow, ListTitleRow, NOW_CHOICE, PageHeading, Row, Say, ScheduleWhen,
  SectionHeading, ThemeSwitch, type WhenChoice,
} from '../components'
import { CodePanel, MachineCheck, Steps, WaitingRow } from '../pages/add/JoinParts'
import { FleetView } from '../pages/dashboard/FleetView'
import { NeedsYou } from '../pages/dashboard/NeedsYou'
import { needsYou } from '../pages/dashboard/dashboardWords'
import { overviewOf } from '../pages/dashboard/overview'
import { Totals } from '../pages/dashboard/Tiles'
import { SAMPLE_FLEET, SAMPLE_HOSTS } from './fleetSamples'
import { HqSamples } from './HqSamples'
import { BackupSamples } from './BackupSamples'
import { CloudSamples } from './CloudSamples'
import { BackupsCard, HealthCard, NotifyCard, ProtectionsCard, RunsCard, SystemCard, VersionCard } from '../pages/site/SiteCards'
import { Brand, WhereBadge } from '../shell/Brand'
import { LocalOnlyFoot } from '../shell/LocalOnlyFoot'
import { JOBS, type MenuSite } from '../shell/menu'
import { NoticesBell } from '../shell/NoticesBell'
import type { FleetNoticeView } from '../shell/notices'
import { NoticesPanel } from '../shell/NoticesPanel'
import { Initials } from '../shell/PersonMenu'
import { Sidebar } from '../shell/Sidebar'

const SAMPLE_NOTICES: FleetNoticeView[] = [
  { id: '1', kind: 'machineNotHeardFrom', title: 'Not heard from lab-01 since 09:14', body: 'It may be switched off, disconnected on the machine, or unable to reach HQ.', at: new Date().toISOString(), dismissible: false, fingerprint: 'b'.repeat(64), target: { page: 'site', fingerprint: 'b'.repeat(64) } },
  { id: '2', kind: 'activity', title: 'Avery Chen exported a backup of office-server', body: 'office-server', at: new Date().toISOString(), dismissible: true, fingerprint: null, target: { page: 'site', fingerprint: 'a'.repeat(64) } },
]

const SAMPLE_SITES: MenuSite[] = [
  { fingerprint: 'd'.repeat(64), name: 'machine-d', siteName: 'machine-d', hq: true, dot: 'healthy', state: 'Healthy' },
  { fingerprint: 'b'.repeat(64), name: 'lab-01', siteName: 'lab-01', hq: false, dot: 'attention', state: 'Not answering' },
  { fingerprint: 'c'.repeat(64), name: 'lab-02', siteName: '', hq: false, dot: 'none', state: 'No site' },
  { fingerprint: 'a'.repeat(64), name: 'office-server', siteName: 'office-server', hq: false, dot: 'silent', state: 'Stopped' },
]

export default function ComponentsPage() {
  const params = new URLSearchParams(window.location.search)
  const embedded = params.has('embed')
  const theme = params.get('theme')

  useEffect(() => {
    if (theme === 'light' || theme === 'dark') document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  if (!embedded) {
    return (
      <div className="grid h-screen grid-cols-1 lg:grid-cols-2">
        <iframe title="Light" src="/_components?embed&theme=light" className="h-full w-full border-0 border-r border-border" />
        <iframe title="Dark" src="/_components?embed&theme=dark" className="h-full w-full border-0" />
      </div>
    )
  }
  return <Showcase />
}

function Showcase() {
  const attention = useAttention()
  const [find, setFind] = useState('')
  const [confirming, setConfirming] = useState<'plain' | 'destructive' | null>(null)
  const [what, setWhat] = useState<string | null>('capacity')
  const [when, setWhen] = useState<WhenChoice>(NOW_CHOICE)
  return (
    <main className="min-h-screen bg-surface-0 bg-[radial-gradient(520px_190px_at_26%_-70px,var(--color-frame-glow),transparent_70%),linear-gradient(180deg,var(--color-frame-wash),transparent_200px)] bg-no-repeat px-7 pt-6 pb-7">
      <div className="mb-4"><ThemeSwitch /></div>

      <ListTitleRow
        title="Fleet"
        lede="Every site of Acme Robotics, with the machine it runs on."
        find={{ label: 'Find a site', value: find, onChange: setFind }}
        add={<Button variant="primary" leadingIcon={<Plus size={14} aria-hidden />}>Add a site</Button>}
      />

      <SectionHeading aside="4 sites">Rows</SectionHeading>
      <Row><b className="flex-1 font-semibold">hq-box</b><HostingBadge where="self-hosted" /><StatePill tone="healthy">Healthy</StatePill></Row>
      <Row><b className="flex-1 font-semibold">office-server</b><HostingBadge where="self-hosted" /><StatePill tone="warning">Disk 91%</StatePill></Row>
      <Row><b className="flex-1 font-semibold">laptop</b><HostingBadge where="self-hosted" /><StatePill>Not heard from since 18:02</StatePill></Row>
      <Row><b className="flex-1 font-semibold">hel-2</b><HostingBadge where="cloud" short /><StatePill tone="danger">Not reachable</StatePill></Row>

      <SectionHeading>Page heading</SectionHeading>
      <PageHeading
        title="office-server"
        badges={<><HostingBadge where="self-hosted" /><HostingBadge where="cloud" /><StatePill tone="healthy">Healthy</StatePill></>}
        lede="A site of Acme Robotics, on the machine office-server."
      />

      <SectionHeading>Card and key–value rows</SectionHeading>
      <Card>
        <KeyValueRow label="Version">0.2.0</KeyValueRow>
        <KeyValueRow label="Runs at once">6</KeyValueRow>
        <KeyValueRow label="Address"><span className="font-mono">https://hq.acme.example</span></KeyValueRow>
      </Card>

      <SectionHeading>Buttons</SectionHeading>
      <div className="flex flex-wrap gap-2">
        <Button variant="primary">Add a site</Button>
        <Button variant="secondary">Edit capacity</Button>
        <Button variant="danger">Disconnect</Button>
        <Button variant="secondary" disabled>Not now</Button>
      </div>

      <SectionHeading>Notices</SectionHeading>
      <p className="mb-2 text-small text-text-secondary">A notice is a dialog, opened once when it appears; Try again is there when there is a way.</p>
      <Button variant="secondary" onClick={() => attention.show({ title: 'Not reachable', text: 'HQ has not heard from laptop for 10 minutes.', retry: () => undefined })}>Open a notice</Button>
      {attention.dialog}

      <SectionHeading>Drop-down and When (Plan maintenance)</SectionHeading>
      <div className="grid max-w-md gap-3">
        <DropDown label="What" placeholder="Choose what to do" value={what} onChange={setWhat} options={[
          { key: 'upgrade', label: 'Upgrade', hint: 'To a newer version, backed up first and rolled back if it does not come up healthy.' },
          { key: 'capacity', label: 'Change capacity', hint: 'What each agent run gets, and how many run at once.' },
          { key: 'move', label: 'Move', hint: 'To another machine, with everything it holds.' },
        ]} />
        <ScheduleWhen value={when} onChange={setWhen} idPrefix="sample-when" />
      </div>

      <SectionHeading>Empty state</SectionHeading>
      <EmptyState variant="inline" title="No site runs on another machine yet." action={<Button variant="secondary">Add a site</Button>} />

      <SectionHeading>Confirmation</SectionHeading>
      <div className="flex gap-2">
        <Button variant="secondary" onClick={() => setConfirming('plain')}>Open a confirmation</Button>
        <Button variant="danger" onClick={() => setConfirming('destructive')}>Open a destructive one</Button>
      </div>
      <ConfirmDialog
        open={confirming !== null}
        title={confirming === 'destructive' ? 'Disconnect office-server?' : 'Upgrade office-server now?'}
        confirmLabel={confirming === 'destructive' ? 'Disconnect office-server' : 'Upgrade now'}
        destructive={confirming === 'destructive'}
        onConfirm={() => setConfirming(null)}
        onCancel={() => setConfirming(null)}
      >
        {confirming === 'destructive'
          ? 'Its agents stop, and HQ no longer sends it work. The machine keeps its data.'
          : 'Its runs finish first; new work waits until it is back.'}
      </ConfirmDialog>

      <SectionHeading>Dashboard: what needs you, the fleet with HQ as its hub, the totals</SectionHeading>
      <NeedsYou items={needsYou(SAMPLE_FLEET, new Date())} />
      <FleetView fleet={SAMPLE_FLEET} now={new Date()} />
      <Totals overview={overviewOf(SAMPLE_HOSTS, new Date())} hosts={SAMPLE_HOSTS} />

      <SectionHeading>A site's page: fact groups and cards</SectionHeading>
      <FactGroup tag="The site" aside="what HQ uses, and what moves with it">
        <RunsCard host={SAMPLE_HOSTS[1]} />
        <VersionCard host={SAMPLE_HOSTS[1]} target="site" now={new Date()} />
        <FactCard title="A fact card" aside={<StatePill tone="warning">Aside</StatePill>}><Say warn lead="A warning.">Said in a sentence.</Say></FactCard>
        <BackupsCard host={{ ...SAMPLE_HOSTS[1], figures: { ...SAMPLE_HOSTS[1].figures!, backups: { ...SAMPLE_HOSTS[1].figures!.backups, locationSet: false } } }} now={new Date()} backupsTo="/backups" />
      </FactGroup>
      {SAMPLE_HOSTS[1].figures && (
        <FactGroup tag="The machine" name="office-server" aside="what stays with the hardware" tinted>
          <HealthCard figures={SAMPLE_HOSTS[1].figures} />
          <ProtectionsCard figures={SAMPLE_HOSTS[1].figures} now={new Date()} />
          <SystemCard figures={SAMPLE_HOSTS[1].figures} now={new Date()} />
          <NotifyCard host={SAMPLE_HOSTS[1]} />
        </FactGroup>
      )}

      <SectionHeading>Add a site and Move site: the code, the machine to confirm, the steps</SectionHeading>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-3">
        <Card className="flex flex-col gap-3">
          <CodePanel code="K7QM-4XPD-93TB" lifetime="Works once, for the next 60 minutes." command="agenthix console connect https://hq.acme.example K7QM-4XPD-93TB" />
          <WaitingRow left="14:12 left" />
        </Card>
        <Card>
          <MachineCheck
            machine={{ name: 'office-server', fingerprintShort: '8F3A 91C2 E04B 7D55' }}
            warnings={['This machine says it runs HQ.']}
            confirmLabel="Confirm office-server" busy={false} onConfirm={() => {}} onRefuse={() => {}}
          />
        </Card>
        <Steps steps={[
          { label: 'new-server connected and waiting', detail: 'fingerprint confirmed by Sam Rivera', state: 'done' },
          { label: 'Restored on new-server', detail: null, state: 'current' },
          { label: 'The site dials HQ from new-server', detail: null, state: 'todo' },
          { label: 'The site installed and started on it', state: 'failed' },
        ]} />
      </div>

      <HqSamples />
      <BackupSamples />
      <CloudSamples />

      <SectionHeading>The shell</SectionHeading>
      <div className="flex h-[560px] flex-col overflow-hidden rounded-[14px] border border-border">
        <div className="flex min-h-0 flex-1">
          <Sidebar jobs={JOBS} hq={{ to: `/fleet/${'d'.repeat(64)}`, dot: 'healthy', state: 'Healthy' }} sites={SAMPLE_SITES} path="/" machineName="hq-box"
            noticeCount={SAMPLE_NOTICES.length} user={{ id: 'u1', name: 'Sam Rivera' }} onSignOut={() => {}} />
          <div className="flex flex-1 items-center justify-center text-small text-text-muted">… the page …</div>
        </div>
        <LocalOnlyFoot />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-4">
        <Brand />
        <WhereBadge machineName="hq-box" />
        <NoticesBell count={0} />
        <NoticesBell count={SAMPLE_NOTICES.length} />
        <Initials name="Sam Rivera" />
      </div>
      <div className="mt-3 h-[360px] w-[380px] overflow-hidden rounded-[14px] border border-border bg-surface-1">
        <NoticesPanel notices={SAMPLE_NOTICES} />
      </div>

      <SectionHeading>Code</SectionHeading>
      <pre className="rounded-xl bg-terminal px-3.5 py-3 font-mono text-micro text-terminal-text">agenthix status</pre>
    </main>
  )
}
