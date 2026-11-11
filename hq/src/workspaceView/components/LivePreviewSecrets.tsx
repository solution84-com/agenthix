import { useEffect } from 'react'
import { FILES_BUTTON } from '@agenthix/ui/projects'
import type { LiveAppView, LivePreviewSecretsView } from '../../livePreviews/types'
import { appsToRestart, secretsLine } from '../livePreviewWords'

/** How often the strip reads HQ again while a secrets run goes: a run's end comes with no workspace event. */
export const SECRETS_RUN_READ_EVERY_MS = 2_000

/**
 * The live preview's last *Start with secrets* or *Reload with secrets* (spec part 4, *Secrets*): going, then the names
 * it handed to the app's container, or why it did not. An app that was running before reads them only once restarted:
 * the strip offers to restart those, which keeps the container and what it holds.
 */
export function LivePreviewSecrets({ secrets, apps, canAct, busy, onRestart, onChanged }: {
  secrets: LivePreviewSecretsView
  apps: LiveAppView[]
  canAct: boolean
  busy: boolean
  onRestart: (apps: Pick<LiveAppView, 'appId' | 'name'>[]) => void
  onChanged: () => void
}) {
  const going = secrets.state === 'going'
  useEffect(() => {
    if (!going) return
    const timer = window.setInterval(onChanged, SECRETS_RUN_READ_EVERY_MS)
    return () => window.clearInterval(timer)
  }, [going, onChanged])

  const stale = canAct ? appsToRestart(apps, secrets) : []
  const failed = secrets.state === 'failed' || secrets.state === 'stopped'
  return (
    <div className="flex flex-wrap items-center gap-2 px-3 pb-2 text-small" data-testid="live-preview-secrets">
      {/* Part of the preview's record: the run that did not hand the secrets over, said in its line. */}
      {failed && <span role="status" data-testid="secrets-failed" className="text-text-secondary">{secretsLine(secrets)}</span>}
      {stale.length > 0 && (
        <>
          <span className="text-text-muted">{stale.map(a => a.name).join(' and ')} started before, so {stale.length === 1 ? 'it has' : 'they have'} not read them.</span>
          <button type="button" className={FILES_BUTTON} disabled={busy} onClick={() => onRestart(stale)}>
            Restart {stale.map(a => a.name).join(' and ')}
          </button>
        </>
      )}
    </div>
  )
}
