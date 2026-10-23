import { Link } from 'react-router'
import { useQuery, getExecutionSites } from 'wasp/client/operations'
import { siteStatusMeaning } from '../../../shared/connectSite'
import { OrgAdminHeading, OrgAdminPage } from '../OrgAdminPage'

/**
 * Organisation › Settings › Sites for projects: the sites a new project can be
 * placed on. Adding and removing sites is a fleet admin's, in the Fleet Console.
 */
export function SitesForProjectsPage() {
  const { data: sites, isLoading } = useQuery(getExecutionSites)
  const available = (sites ?? []).filter(s => s.status !== 'REVOKED')

  return (
    <OrgAdminPage area="settings" title="Sites for projects">
      <OrgAdminHeading title="Sites for projects">
        A new project starts on HQ's site unless another is picked when it is created; its files are kept there.
      </OrgAdminHeading>
      {isLoading ? (
        <p className="text-body text-text-muted">Loading…</p>
      ) : available.length === 0 ? (
        <p className="text-body text-text-muted">No site can take projects yet.</p>
      ) : (
        <ul className="divide-y divide-border-subtle border-y border-border-subtle">
          {available.map(site => (
            <li key={site.id} className="flex items-center gap-3 py-3">
              <div className="min-w-0 flex-1">
                <div className="text-body font-medium text-text-primary">
                  {site.label}
                </div>
                <div className="text-small text-text-muted">
                  {siteStatusMeaning(site).label} · {site.projectCount} {site.projectCount === 1 ? 'project' : 'projects'}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-6 text-small text-text-muted">
        Sites are added, changed and removed by fleet admins in the Fleet Console; how each is doing is under{' '}
        <Link to="/admin/where-work-runs" className="text-accent hover:text-accent-hover">Manage organisation › Where work runs › Sites</Link>.
      </p>
    </OrgAdminPage>
  )
}
