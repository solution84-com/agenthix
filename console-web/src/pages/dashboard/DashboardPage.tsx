import { useMemo } from 'react'
import { Plus } from 'lucide-react'
import { Button, EmptyState } from '@agenthix/ui/primitives'
import { HowThisWorks, ListTitleRow, SectionHeading } from '../../components'
import { CloudGroup } from '../../cloud/CloudGroup'
import { CloudHqHero, cloudConnectionWords } from '../../cloud/CloudHqHero'
import { RemoteAccessTile } from '../../cloud/RemoteAccessTile'
import { useCloudFleet } from '../../cloud/useCloudFleet'
import { CLOUD } from '../../cloud/words'
import { navigate } from '../../router'
import { needsYou } from './dashboardWords'
import { DisconnectedCard } from './DisconnectedCard'
import { FleetView } from './FleetView'
import { NeedsYou } from './NeedsYou'
import { CloudOfferLine } from '../../cloud/CloudOfferLine'
import { overviewOf } from './overview'
import { Totals } from './Tiles'
import { useFleet, useFleetRead } from './useFleet'
import { runsSite, whenIs } from './words'

const ADD = '/fleet/add'

/**
 * The dashboard, the first page (board *Proposal*, 6): what needs you on top, each with a button to the thing that has
 * the fix; then *The fleet* — HQ as the hub with every site hanging from it; then the fleet's totals.
 */
export function DashboardPage() {
  const state = useFleet()
  const cloud = useCloudFleet()
  const read = useFleetRead(state, 'The fleet')
  const fleet = state.phase === 'loading' ? null : state.fleet
  const now = state.phase === 'loading' ? new Date() : state.readAt ?? new Date()

  const view = useMemo(() => {
    if (!fleet) return null
    return { needs: needsYou(fleet, now), overview: overviewOf(fleet.hosts, now), sites: fleet.hosts.filter(runsSite).length }
  }, [fleet, now])

  const org = fleet?.hq?.organisationName
  const cloudHq = cloud.group?.kind === 'sites' ? cloud.group.sites.find(s => s.hostsHq) ?? null : null
  const hqHost = fleet?.hosts.find(h => h.hqMachine) ?? null
  const lede = view && [
    org,
    `HQ and ${view.sites} ${view.sites === 1 ? 'site' : 'sites'}`,
    view.needs.length === 0 ? 'nothing needs you' : `${view.needs.length} ${view.needs.length === 1 ? 'needs' : 'need'} you`,
  ].filter(Boolean).join(' · ')

  return (
    <>
      <ListTitleRow
        title="Dashboard"
        help={<HowThisWorks topic="hq-sites-and-fleet-admins" />}
        lede={lede || undefined}
        meta={!read.failedWithoutData ? read.nudge : null}
        add={<Button variant="primary" leadingIcon={<Plus size={14} aria-hidden />} onClick={() => navigate(ADD)}>Add a site</Button>}
      />

      {read.failedWithoutData && read.nudge}

      {fleet && view && fleet.hosts.length === 0 && (
        <EmptyState
          title="No machine is connected yet."
          hint="Add one, and its site appears here with its state."
          action={<Button variant="primary" onClick={() => navigate(ADD)}>Add a site</Button>}
        />
      )}

      {fleet && view && fleet.hosts.length > 0 && (
        <>
          <NeedsYou items={view.needs} />
          {view.sites === 0 && <CloudOfferLine offer="site" from="fleet-console-dashboard" />}
          {!hqHost && cloudHq && <CloudHqHero site={cloudHq} org={org ?? null} address={fleet.hq?.address ?? null} now={now} />}
          <FleetView fleet={fleet} now={now} cloud={cloud.view ? { label: CLOUD, words: cloudConnectionWords(cloud.view.organisation) } : undefined} />
          {view.sites <= 1 && (
            <p className="mt-2 text-small text-text-secondary">
              HQ has one site so far, on its own machine. <button type="button" className="font-medium text-accent hover:underline" onClick={() => navigate(ADD)}>Add a site</button> to run agents on another machine.
            </p>
          )}
          <Totals overview={view.overview} hosts={fleet.hosts}>
            {cloud.remote && <RemoteAccessTile remote={cloud.remote} org={org ?? null} />}
          </Totals>
          {cloud.group && (
            <CloudGroup state={cloud.group} org={org ?? null} now={now} stale={cloud.stale}
              hqSite={hqHost ? { fingerprint: hqHost.fingerprint, machineName: hqHost.machineName } : null} />
          )}
          {fleet.disconnected.length > 0 && (
            <section aria-label="Left the fleet">
              <SectionHeading>Left the fleet</SectionHeading>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-3">
                {fleet.disconnected.map(d => <DisconnectedCard key={d.id} machine={d} now={now} onRemoved={state.refresh} />)}
              </div>
            </section>
          )}
        </>
      )}
    </>
  )
}
