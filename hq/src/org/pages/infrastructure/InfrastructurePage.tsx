import { useQuery, getVersionInfo, getEnvStatus, getSiteList, getGithubAppStatus, getDiagnosticsSummary, getWhereHqRuns } from 'wasp/client/operations'
import { plural } from '../../../sites/pages/siteWords'
import { availability } from '../../../sites/pages/whereWorkRunsWords'
import { OrgAdminHeading, OrgAdminPage } from '../OrgAdminPage'
import { OrgEntryGroup, OrgEntryRow } from '../OrgEntryRow'
import { isKeySet, requiredKeysLine } from './envFacts'
import { whereHqRunsLine } from './whereHqRuns'
import { BRANDING } from '@agenthix/core'

const built = (at: string) => new Date(at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })

function diagnosticsLine(d: { errorsLast24h: number; sitesWithLogs: number }): string {
  const errors = d.errorsLast24h === 0 ? 'No errors in the last 24 hours' : `${plural(d.errorsLast24h, 'error')} in the last 24 hours`
  const logs = d.sitesWithLogs === 0 ? 'logs from HQ' : `logs from HQ and ${plural(d.sitesWithLogs, 'site')}`
  return `${errors} · ${logs} · support bundle`
}

/**
 * Organisation › Infrastructure: what everything runs on (spec §3) — HQ, every
 * Execution Site, storage, the GitHub App's registration, and diagnostics. For
 * organisation admins only until host management gives it admins of its own.
 */
export function InfrastructurePage() {
  return (
    <OrgAdminPage area="infrastructure">
      <OrgAdminHeading title="Infrastructure">
        What {BRANDING.displayName} runs on — HQ, its sites, storage. Organisation admins, for now.
      </OrgAdminHeading>
      <InfrastructureOverview />
    </OrgAdminPage>
  )
}

/** Asked only once the person is known to be an admin: most of what it reads is refused to anyone else. */
function InfrastructureOverview() {
  const { data: version } = useQuery(getVersionInfo)
  const { data: env } = useQuery(getEnvStatus)
  const { data: sites } = useQuery(getSiteList)
  const { data: github } = useQuery(getGithubAppStatus)
  const { data: diagnostics } = useQuery(getDiagnosticsSummary)
  const { data: hosting } = useQuery(getWhereHqRuns)

  const storageRoot = isKeySet(env?.sections, 'HQ_STORAGE_ROOT')
  const database = isKeySet(env?.sections, 'DATABASE_URL')

  return (
    <>
      <OrgEntryGroup title="HQ">
        <OrgEntryRow to="/org/infrastructure/hq" title="Where HQ runs" line={hosting ? whereHqRunsLine(hosting) : 'Loading…'} />
        <OrgEntryRow
          to="/org/infrastructure/hq"
          title="Version"
          line={version ? `Agenthix ${version.version} · built ${built(version.built)}` : 'Loading…'}
        />
        <OrgEntryRow
          to="/org/infrastructure/hq"
          title="Address and environment"
          line={env ? `${env.address ?? 'No address set'} · ${requiredKeysLine(env.sections)}` : 'Loading…'}
        />
      </OrgEntryGroup>

      <OrgEntryGroup title="Where work runs" all={{ to: '/org/settings/where-work-runs', label: 'All sites' }}>
        {(sites ?? []).filter(s => s.group !== 'removed').map(site => (
          <OrgEntryRow
            key={site.id}
            to={`/org/settings/where-work-runs/${site.id}`}
            title={site.label}
            line={`${availability(site).sentence} · ${plural(site.projectCount, 'project')}`}
          />
        ))}
      </OrgEntryGroup>

      <OrgEntryGroup title="Storage">
        <OrgEntryRow
          to="/org/infrastructure/hq"
          title="Database"
          line={database === undefined ? 'Loading…' : database ? 'Its address is set' : 'Its address is not set'}
        />
        <OrgEntryRow
          to="/org/infrastructure/hq"
          title="HQ's own files"
          line={storageRoot === undefined ? 'Loading…' : storageRoot
            ? 'Kept where HQ_STORAGE_ROOT says'
            : 'Kept beside the build — set HQ_STORAGE_ROOT so they outlive a container'}
        />
      </OrgEntryGroup>
      <p className="-mt-4 mb-6 text-small text-text-muted">Projects' and people's files are kept on the Execution Site that holds them. HQ takes no backups.</p>

      <OrgEntryGroup title="More">
        <OrgEntryRow
          to="/org/infrastructure/github-app"
          title="GitHub App"
          line={!github ? 'Loading…' : github.registered ? `Registered as ${github.slug}` : 'Not registered'}
        />
        <OrgEntryRow to="/org/infrastructure/diagnostics" title="Logs and diagnostics" line={diagnostics ? diagnosticsLine(diagnostics) : 'Loading…'} />
      </OrgEntryGroup>
    </>
  )
}
