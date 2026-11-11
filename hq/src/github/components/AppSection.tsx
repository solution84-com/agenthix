import { useState } from 'react'
import { ExternalLink, Unplug } from 'lucide-react'
import { useAction, disconnectGithubApp } from 'wasp/client/operations'
import type { GitHubPermissions } from '@agenthix/core'
import { Button, FOCUS_RING, ConfirmDialog } from '@agenthix/ui/primitives'
import { CEILING_WORDS, permissionRows } from './githubWords'
import { Nudge, ShowAttention } from '@agenthix/ui/attention'

/** The App (G1, part 1): its name, its permissions read from GitHub with what uses each, and *Change on GitHub*. */
export function AppSection({ slug, owner, permissions, settingsUrl, onChanged }: {
  slug: string
  /** Who owns the App on GitHub, as GitHub says; null until read. */
  owner?: { login: string; type: 'Organization' | 'User' } | null
  permissions: GitHubPermissions | null
  settingsUrl: string
  onChanged: () => void
}) {
  const disconnect = useAction(disconnectGithubApp)
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const rows = permissions ? permissionRows(permissions) : []

  const doDisconnect = async () => {
    setBusy(true)
    setError(null)
    try {
      await disconnect({})
      onChanged()
    } catch (e) {
      setError(e)
    } finally {
      setBusy(false)
      setConfirming(false)
    }
  }

  return (
    <section aria-label="The App" className="space-y-4">
      <h2 className="text-h3 font-medium text-text-primary">1 · The App</h2>
      <div className="space-y-3 rounded-xl border border-border-subtle bg-surface-1 p-4">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <a href={`https://github.com/apps/${encodeURIComponent(slug)}`} target="_blank" rel="noopener noreferrer" className={`rounded font-mono text-body font-medium text-text-primary hover:underline ${FOCUS_RING}`}>{slug}</a>
          {owner && (
            <span className="text-small text-text-muted">
              owned by <span className="font-medium text-text-primary">{owner.login}</span>
              {owner.type === 'User' ? ' (a personal account)' : ''}
            </span>
          )}
          <span className="text-small text-text-muted">Homepage: {window.location.origin}</span>
          <span className="flex-1" />
          <Button variant="ghost" size="sm" onClick={() => setConfirming(true)} disabled={busy} leadingIcon={<Unplug size={11} aria-hidden />}>
            Disconnect
          </Button>
        </div>
        <ConfirmDialog
          open={confirming}
          title="Disconnect the App?"
          description="Removes the stored App credential: workflows and agents' git stop working until you register again. It does not delete the App on GitHub; remove it there too if you want it gone."
          confirmLabel="Disconnect"
          destructive
          onConfirm={() => void doDisconnect()}
          onCancel={() => setConfirming(false)}
        />
        <ShowAttention kind="alert" text={error} title="The App was not disconnected" onClose={() => setError(null)} />
      </div>

      <div className="space-y-2 rounded-xl border border-border-subtle bg-surface-1 p-4">
        <h3 className="text-body font-medium text-text-primary">The App's permissions: the most any workflow can do</h3>
        {permissions === null ? (
          <Nudge place="content" title="The App's permissions could not be read" action={{ label: 'Try again', onClick: onChanged }}>GitHub did not answer.</Nudge>
        ) : (
          <ul className="divide-y divide-border-subtle" aria-label="The App's permissions">
            {rows.map((r) => (
              <li key={r.name} className="flex flex-wrap items-baseline gap-x-3 py-1.5 text-small">
                <span className="w-44 font-medium text-text-primary">{r.label}</span>
                <span className="min-w-0 flex-1 text-text-secondary">{r.use}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="text-small text-text-muted">{CEILING_WORDS}</p>
        <p className="text-small text-text-muted">
          It's your App: an owner changes its permissions in the App's settings on GitHub. Each GitHub account using it is then asked, on GitHub, to accept the change.
        </p>
        <a href={settingsUrl} target="_blank" rel="noopener noreferrer" className={`rounded inline-flex items-center gap-1 text-small text-link hover:underline ${FOCUS_RING}`}>
          Change on GitHub <ExternalLink size={11} aria-hidden />
        </a>
      </div>
    </section>
  )
}
