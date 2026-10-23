import { useState } from 'react'
import { Link } from 'react-router'
import { useQuery, useAction, getGithubAppStatus, disconnectGithubApp, startGithubAppRegistration } from 'wasp/client/operations'
import { ExternalLink, CheckCircle2, AppWindow, Loader2, Unplug } from 'lucide-react'
import { OrgAdminHeading, OrgAdminPage } from '../../org/pages/OrgAdminPage'

/**
 * Organisation › Infrastructure › GitHub App: registering the App — one per
 * HQ, tied to its address — and removing it. Installing it on the
 * organisation's accounts is Organisation › Settings › GitHub.
 */
export function GitHubAppPage() {
  return (
    <OrgAdminPage area="infrastructure" title="GitHub App">
      <OrgAdminHeading title="GitHub App">
        The GitHub App this HQ uses, registered once for its address. GitHub creates the App and sends you back here.
      </OrgAdminHeading>
      <Registration />
    </OrgAdminPage>
  )
}

function Registration() {
  const { data: status, refetch } = useQuery(getGithubAppStatus)
  const doDisconnect = useAction(disconnectGithubApp)
  const [org, setOrg] = useState('')
  const [connecting, setConnecting] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)
  const [confirmDisconnect, setConfirmDisconnect] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleDisconnect = async () => {
    if (!confirmDisconnect) { setConfirmDisconnect(true); return }
    setDisconnecting(true)
    setError(null)
    try {
      await doDisconnect({})
      await refetch()
      setConfirmDisconnect(false)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Disconnect failed')
    } finally {
      setDisconnecting(false)
    }
  }

  // hq issues the one-time state; the page then goes to the address it returns.
  const handleConnect = async () => {
    setConnecting(true)
    setError(null)
    try {
      const { url } = await startGithubAppRegistration({ org: org.trim() || undefined })
      window.location.assign(url)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not start connecting GitHub')
      setConnecting(false)
    }
  }

  if (!status) {
    return <div className="flex items-center gap-2 text-small text-text-muted py-4"><Loader2 size={13} className="animate-spin" /> Loading…</div>
  }

  if (status.registered) {
    return (
      <div className="rounded-xl bg-success/10 border border-success/20 px-4 py-4 space-y-3">
        <div className="flex items-center gap-3">
          <CheckCircle2 size={14} className="text-success shrink-0" />
          <span className="text-success text-small font-medium">GitHub App registered</span>
          <code className="text-text-secondary text-small font-mono">{status.slug}</code>
        </div>
        <p className="text-small text-text-secondary">
          Install it on the organisation's accounts under{' '}
          <Link to="/admin/settings/github" className="text-accent hover:text-accent-hover">Organisation › Settings › GitHub</Link>.
        </p>
        <div className="flex items-center gap-2 pt-1 border-t border-border">
          {error && <span className="text-small text-danger flex-1">{error}</span>}
          <button
            onClick={() => void handleDisconnect()}
            onBlur={() => setConfirmDisconnect(false)}
            disabled={disconnecting}
            title="Removes the GitHub App credential from this platform. Does not delete the App on GitHub."
            className="flex items-center gap-1.5 px-3 py-1 text-small font-medium text-danger/80 hover:text-danger hover:bg-danger/10 disabled:opacity-40 rounded-lg transition-colors"
          >
            {disconnecting ? <Loader2 size={11} className="animate-spin" /> : <Unplug size={11} />}
            {disconnecting ? 'Disconnecting…' : confirmDisconnect ? 'Confirm disconnect?' : 'Disconnect'}
          </button>
        </div>
        {confirmDisconnect && !disconnecting && (
          <p className="text-micro text-danger/70">
            Removes the stored App credential — operations and agent git stop working until you reconnect. Does not delete the App on GitHub (remove it there too if you want it fully gone).
          </p>
        )}
      </div>
    )
  }

  return (
    <div className="rounded-xl bg-surface-1 border border-border-subtle p-5 space-y-4">
      <div className="flex items-start gap-3">
        <AppWindow size={18} className="text-text-muted shrink-0 mt-0.5" />
        <div>
          <div className="text-body font-semibold text-text-primary">No GitHub App registered</div>
          <div className="text-micro text-text-muted mt-0.5">
            Register a GitHub App via the Manifest flow. GitHub will create the App and redirect back here automatically.
          </div>
        </div>
      </div>
      <div className="space-y-2">
        <label htmlFor="github-org" className="block text-micro font-medium text-text-secondary">
          GitHub organization <span className="text-text-muted">— leave blank to create under your personal account</span>
        </label>
        <input
          id="github-org"
          type="text"
          value={org}
          onChange={e => setOrg(e.target.value)}
          placeholder="my-org"
          className="w-full max-w-xs px-3 py-1.5 text-body bg-surface-2 border border-border rounded-lg text-text-primary placeholder:text-text-muted/70 focus:outline-none focus:border-accent/50"
        />
        <div>
          <button
            type="button"
            onClick={() => void handleConnect()}
            disabled={connecting}
            className="inline-flex items-center gap-2 px-4 py-2 mt-1 text-body font-medium bg-accent hover:bg-accent-hover disabled:opacity-40 text-on-accent rounded-lg transition-colors"
          >
            Register the GitHub App {connecting ? <Loader2 size={13} className="animate-spin" /> : <ExternalLink size={13} />}
          </button>
          {error && <p className="text-small text-danger mt-2">{error}</p>}
        </div>
      </div>
    </div>
  )
}
