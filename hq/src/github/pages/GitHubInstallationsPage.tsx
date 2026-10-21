import { useState } from 'react'
import { Link } from 'react-router'
import { useQuery, useAction, getGithubAppStatus, refreshGithubInstallations } from 'wasp/client/operations'
import { ExternalLink, RefreshCw, Loader2 } from 'lucide-react'
import { OrgAdminHeading, OrgAdminPage } from '../../org/pages/OrgAdminPage'

/**
 * Organisation › Settings › GitHub: the GitHub App installed on the
 * organisation's accounts. Registering the App, one per HQ and tied to its
 * address, is Infrastructure's.
 */
export function GitHubInstallationsPage() {
  return (
    <OrgAdminPage area="settings" title="GitHub">
      <OrgAdminHeading title="GitHub">
        The accounts the GitHub App is installed on, where agents get short-lived, repo-scoped tokens.
      </OrgAdminHeading>
      <Installations />
      <UsedFor />
    </OrgAdminPage>
  )
}

function Installations() {
  const { data: status, refetch } = useQuery(getGithubAppStatus)
  const doRefresh = useAction(refreshGithubInstallations)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshError, setRefreshError] = useState<string | null>(null)

  const handleRefresh = async () => {
    setRefreshing(true)
    setRefreshError(null)
    try {
      await doRefresh({})
      await refetch()
    } catch (e: unknown) {
      setRefreshError(e instanceof Error ? e.message : 'Refresh failed')
    } finally {
      setRefreshing(false)
    }
  }

  if (!status) {
    return <div className="flex items-center gap-2 text-small text-text-muted py-4"><Loader2 size={13} className="animate-spin" /> Loading…</div>
  }
  if (!status.registered) {
    return (
      <div className="rounded-xl bg-surface-1 border border-border-subtle p-5 text-body text-text-secondary">
        The GitHub App is not registered for this HQ yet. It is registered under{' '}
        <Link to="/org/infrastructure/github-app" className="text-accent hover:text-accent-hover">Organisation › Infrastructure › GitHub App</Link>;
        then install it on the organisation's accounts here.
      </div>
    )
  }

  return (
    <div className="rounded-xl bg-surface-1 border border-border-subtle px-4 py-4 space-y-3">
      {status.installations.length > 0 ? (
        <div>
          <div className="text-micro font-medium uppercase tracking-wide text-text-muted mb-1.5">Installed on</div>
          <div className="flex flex-wrap gap-1.5">
            {status.installations.map(i => (
              <span key={i.login} className="px-2 py-0.5 rounded-md bg-surface-3 border border-border text-small text-text-secondary font-mono">
                {i.login}{i.type !== 'Organization' && <span className="text-text-muted"> · personal</span>}
              </span>
            ))}
          </div>
          {!status.canCreateRepos && (
            <p className="text-micro text-warning/70 mt-2">
              Personal-account install — you can link existing repos, but creating new repos needs the App installed on an <span className="font-semibold">organization</span>.
            </p>
          )}
        </div>
      ) : (
        <p className="text-small text-text-muted">
          No installations found yet. Install the App on your org or account using the link below, then refresh.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-border">
        <a
          href={`https://github.com/apps/${status.slug}/installations/new`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-small text-accent/70 hover:text-accent transition-colors"
        >
          Install or manage on GitHub <ExternalLink size={11} />
        </a>
        <span className="text-text-muted/70">·</span>
        {refreshError && <span className="text-small text-danger flex-1">{refreshError}</span>}
        <button
          onClick={() => void handleRefresh()}
          disabled={refreshing}
          className="flex items-center gap-1.5 px-3 py-1 text-small font-medium bg-surface-2 hover:bg-surface-hover text-text-secondary hover:text-text-primary disabled:opacity-40 rounded-lg transition-colors"
        >
          {refreshing ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
          {refreshing ? 'Refreshing...' : 'Refresh installations'}
        </button>
      </div>
    </div>
  )
}

function UsedFor() {
  return (
    <div className="mt-6 rounded-xl bg-surface-1 border border-border-subtle p-4 space-y-3">
      <div className="text-micro font-medium uppercase tracking-wide text-text-muted">What this integration is used for</div>
      <ul className="space-y-2 text-small text-text-secondary">
        <li className="flex items-start gap-2">
          <span className="text-accent shrink-0 mt-0.5">·</span>
          <span><strong className="text-text-secondary">Agent repo access</strong> — mints short-lived, per-repo tokens so agents can clone and push code without long-lived credentials</span>
        </li>
        <li className="flex items-start gap-2">
          <span className="text-accent shrink-0 mt-0.5">·</span>
          <span><strong className="text-text-secondary">Operations</strong> — manages workflows, runs, and secrets via the App token — no personal account involved</span>
        </li>
      </ul>
    </div>
  )
}
