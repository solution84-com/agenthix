import { StatePill } from '@agenthix/ui/primitives'
import { FactCard, HowThisWorks, KeyValueRow } from '../../components'
import { Link } from '../../router'
import { HQ_PATH, sitePath } from '../../shell/menu'
import { sitesConnected } from '../dashboard/dashboardWords'
import type { FleetHost } from '../dashboard/types'
import { asideLink } from '../site/SiteCards'
import { frontDoorLine } from './hqWords'

const Sub = ({ children }: { children: React.ReactNode }) => <p className="text-small text-text-secondary">{children}</p>

/**
 * How people reach HQ: its address and its front door, a line each. What to do about either — the web server's
 * instructions, where uploaded files are served — is on the *Change* page, where it is acted on.
 */
export function ReachCard({ host, address, now }: { host: FleetHost; address: string | null; now: Date }) {
  const door = host.figures?.frontDoor
  const line = door ? frontDoorLine(door, address, now) : null
  return (
    <FactCard title="How people reach it" help={<HowThisWorks topic="domain-and-https" className="normal-case tracking-normal" />} aside={<Link to={`${HQ_PATH}/address`} className={asideLink}>Change</Link>}>
      <KeyValueRow label="Address">{address ? <span className="font-mono text-[.92em]">{address}</span> : 'HQ has not said yet'}</KeyValueRow>
      <KeyValueRow label="Front door">
        {line ? <span className="flex flex-wrap items-center gap-x-2 gap-y-1">{line.title}{line.tone !== 'neutral' && <StatePill tone={line.tone}>{line.pill}</StatePill>}</span> : 'No figures yet'}
      </KeyValueRow>
    </FactCard>
  )
}

/** Whether HQ is doing its job for the sites that take their work from it. */
export function DependsCard({ hosts }: { hosts: readonly FleetHost[] }) {
  const { connected, total } = sitesConnected(hosts)
  return (
    <FactCard title="Who depends on it" aside={connected < total ? <StatePill tone="warning">{`${total - connected} not connected`}</StatePill> : undefined}>
      <KeyValueRow label="Sites">{`${connected} of ${total} connected`}</KeyValueRow>
    </FactCard>
  )
}

/** HQ's own site, in one line: it is a site like the others, with its own page. */
export function HqSiteLine({ host }: { host: FleetHost }) {
  const a = host.agents
  return (
    <FactCard title="Agents run here too" wide>
      <Sub>
        {`HQ's own site: ${a ? `${a.running} of ${a.maxAtOnce} runs` : 'runs not reported yet'} · `}
        <Link to={sitePath(host.fingerprint)} className="font-medium text-accent hover:underline">{`Open ${host.machineName}'s site ›`}</Link>
      </Sub>
    </FactCard>
  )
}
