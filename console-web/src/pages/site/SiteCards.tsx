import type { HostFigures, HostTarget } from '@agenthix/core'
import { StatePill } from '@agenthix/ui/primitives'
import { FactCard, HowThisWorks, KeyValueRow, Say } from '../../components'
import { Link } from '../../router'
import { changeWords, pendingChanges } from '../dashboard/overview'
import type { FleetHost } from '../dashboard/types'
import { notifies, spanOf, whenIs } from '../dashboard/words'
import { ceilingWords, healthWords, protectionWords } from './words'

const Sub = ({ children }: { children: React.ReactNode }) => <p className="text-small text-text-secondary">{children}</p>
const tidy = 'normal-case tracking-normal'
export const asideLink = 'normal-case tracking-normal text-small font-medium text-accent hover:underline'

/** The site's runs: how many go now against how many at once, and what each run is given. */
export function RunsCard({ host }: { host: FleetHost }) {
  const a = host.agents
  const c = host.figures ? ceilingWords(host.figures.ceilings) : null
  return (
    <FactCard title="Runs" help={<HowThisWorks topic="add-a-site" section="how-many-runs-at-once" className={tidy} />} aside={host.siteRegistered ? undefined : <StatePill>Not yet in HQ</StatePill>}>
      <KeyValueRow label="Now">{a ? `${a.running} of ${a.maxAtOnce} at once` : c ? `— of ${c.atOnce} at once · HQ has not said` : '—'}</KeyValueRow>
      <KeyValueRow label="Each run">{c ? c.each : 'No figures yet'}</KeyValueRow>
    </FactCard>
  )
}

/** What runs, and any change planned for it. */
export function VersionCard({ host, target, now }: { host: FleetHost; target: HostTarget; now: Date }) {
  const install = host.figures?.installs.find(i => i.target === target)
  const planned = pendingChanges(host).filter(c => c.target === target)
  return (
    <FactCard title="Version" aside={install && !install.healthy && install.state !== 'starting' ? <StatePill tone="danger">{install.state}</StatePill> : undefined}>
      <KeyValueRow label="Running">{install?.version ?? '—'}</KeyValueRow>
      <KeyValueRow label="Planned">{planned.length === 0 ? 'none' : planned.map(c => `${changeWords(c)} ${whenIs(c.at, now)}`).join('; ')}</KeyValueRow>
    </FactCard>
  )
}

/** The last backup, where backups are kept, and — with no backup location — what is at stake. */
export function BackupsCard({ host, now, backupsTo, next = false }: { host: FleetHost; now: Date; backupsTo: string; next?: boolean }) {
  const b = host.figures?.backups
  return (
    <FactCard title="Backups" help={<HowThisWorks topic="backups-and-restoring" className={tidy} />} aside={b && !b.locationSet ? <StatePill tone="warning">On this machine only</StatePill> : undefined}>
      {!b ? <Sub>No figures yet.</Sub> : (
        <>
          <KeyValueRow label="Last">
            {b.lastNightlyAt ? `${whenIs(b.lastNightlyAt, now)} · ${b.lastNightlyOk ? 'passed' : 'failed'}` : `none yet, the first tonight at ${b.nightlyAt}`}
          </KeyValueRow>
          {next && <KeyValueRow label="Next">{`tonight ${b.nightlyAt}`}</KeyValueRow>}
          <KeyValueRow label="Kept">{b.locationSet ? 'in the backup location too' : `on ${host.machineName} only`}</KeyValueRow>
          {!b.locationSet && (
            <Say warn>
              If {host.machineName} is lost, so are its backups. <Link to={backupsTo} className="font-medium text-accent hover:underline">Set a backup location, or export a copy</Link>
            </Say>
          )}
        </>
      )}
    </FactCard>
  )
}

/** The machine's health: what fills up, and a verdict. */
export function HealthCard({ figures }: { figures: HostFigures }) {
  const w = healthWords(figures)
  return (
    <FactCard title="Health" aside={<StatePill tone={w.tone}>{w.verdict}</StatePill>}>
      <KeyValueRow label="Disk">{w.disk}</KeyValueRow>
      <KeyValueRow label="Memory">{w.memory}</KeyValueRow>
      {w.say && <Say warn lead={w.say.lead}>{w.say.rest}</Say>}
    </FactCard>
  )
}

/** A fact, not a setting (spec §8): no control of any kind. */
export function ProtectionsCard({ figures, now }: { figures: HostFigures; now: Date }) {
  const w = protectionWords(figures.protections, now)
  return (
    <FactCard title="Protections" help={<HowThisWorks topic="add-a-site" section="what-agents-can-reach" className={tidy} />} aside={<StatePill tone={w.tone}>{w.label}</StatePill>}>
      <Sub>{w.sentence}</Sub>
    </FactCard>
  )
}

/** The machine's system in one line: OS, Docker, the host service, how long it has been up. */
export function SystemCard({ figures, now }: { figures: HostFigures; now: Date }) {
  const m = figures.machine
  return (
    <FactCard title="System">
      <Sub>{[m.system, `Docker ${m.dockerVersion ?? 'not found'}`, `host service ${m.hostServiceVersion}`, `up ${spanOf(m.upSince, now)}`].join(' · ')}</Sub>
    </FactCard>
  )
}

/** Whether the fleet admins are told when the machine stops answering; changed with *Notify…* in the header. */
export function NotifyCard({ host }: { host: FleetHost }) {
  return (
    <FactCard title="Notify" help={<HowThisWorks topic="hq-sites-and-fleet-admins" section="when-a-machine-stops-answering" className={tidy} />}>
      <Sub>
        {host.hqMachine
          ? "Fleet admins are always notified if it stops answering: HQ's machine going quiet means HQ is down."
          : notifies(host) ? 'Fleet admins are notified if it stops answering.' : 'Fleet admins are not notified if it stops answering.'}
      </Sub>
    </FactCard>
  )
}

