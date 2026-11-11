import { useState } from 'react'
import { Play } from 'lucide-react'
import { useAction, startLivePreview, stopLivePreview, turnGitOn } from 'wasp/client/operations'
import { FILES_BUTTON, FILES_BUTTON_PRIMARY } from '@agenthix/ui/projects'
import type { LivePreviewPlaces, LivePreviewView } from '../../livePreviews/types'
import { fullWords, refusalOf, siteLoad, PREVIEW_VIEWER_REASON } from '../livePreviewWords'
import { whenText } from '../words'
import { NativeSelect } from '@agenthix/ui/primitives'
import { ShowAttention } from '@agenthix/ui/attention'
import { Tooltip, useRefusal, withoutHover } from '@agenthix/ui/primitives'

/**
 * *Live preview* before one runs (spec part 4, *Opening one*; part 5): where HQ would start it and how full that site
 * is, the other allowed sites to pick instead, and, when the workspace's own site is full, the live previews open
 * there with *Stop* on the ones the person may stop. *Start* turns Git on first when the workspace has none.
 */
export function LivePreviewStart({ workspaceId, branchId, branchName, places, stopped, onStarted, onChanged }: {
  workspaceId: string
  branchId: string | null
  branchName: string
  places: LivePreviewPlaces
  /** The branch's last live preview, when it stopped: why, before *Start* again. */
  stopped: LivePreviewView | null
  onStarted: (view: LivePreviewView) => void
  onChanged: () => void
}) {
  const start = useAction(startLivePreview)
  const stop = useAction(stopLivePreview)
  const gitOn = useAction(turnGitOn)
  const [siteId, setSiteId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)

  const room = places.others.filter(o => !o.blocked && !o.full)
  const chosen = siteId ?? places.picked?.executionSiteId ?? room[0]?.executionSiteId ?? null
  const canStart = places.mayStart && !places.blocked && (chosen !== null || places.needsGit)

  const go = async () => {
    setBusy(true)
    setProblem(null)
    try {
      if (places.needsGit) await gitOn({ workspaceId })
      const view = await start({ workspaceId, branchId, executionSiteId: chosen })
      onStarted(view)
    } catch (err) {
      setProblem(refusalOf(err, 'The live preview did not start.'))
      onChanged()
    } finally {
      setBusy(false)
    }
  }

  const stopOne = async (livePreviewId: string) => {
    setBusy(true)
    setProblem(null)
    try {
      await stop({ livePreviewId })
    } catch (err) {
      setProblem(refusalOf(err, 'It was not stopped.'))
    } finally {
      setBusy(false)
      onChanged()
    }
  }

  // Why starting is not possible now is said by the button: greyed, the reason in its tooltip, a press opens it in full.
  const why = places.blocked ?? (places.mayStart ? null : PREVIEW_VIEWER_REASON)
  const refused = useRefusal(why ? { reason: why } : undefined)
  return (
    <div className="mx-auto flex w-full max-w-[560px] flex-col gap-3 px-4 py-6 text-small" data-testid="live-preview-start">
      <h2 className="flex items-center gap-2 text-body font-medium text-text-primary"><Play size={16} aria-hidden /> Live preview · <span className="font-mono">{branchName}</span></h2>
      {(stopped?.detail ?? places.lastStopped?.detail) && (
        <p role="status" className="text-text-secondary" data-testid="live-preview-last-stopped">
          {stopped?.detail ?? places.lastStopped?.detail}
          {!stopped?.detail && places.lastStopped && <span className="text-text-muted"> · {whenText(places.lastStopped.at)}</span>}
        </p>
      )}
      <p className="text-text-secondary">
        Runs the app from this branch's working copy, so what the agent saves shows at once. Stopping it never loses work.
      </p>
      {places.needsGit && <p className="text-text-secondary">This workspace isn't a Git repository yet. Starting turns Git on first: its files stay as they are and become the first version.</p>}

      {places.full && (
        <section aria-label="Open live previews" className="space-y-2 rounded-lg border border-border-subtle px-3 py-2">
          <p className="font-medium text-text-primary">{fullWords(places.full.site)}</p>
          <ul className="divide-y divide-border-subtle">
            {places.full.open.map(o => (
              <li key={o.livePreviewId} className="flex items-center gap-2 py-1.5">
                <span className="min-w-0 flex-1 truncate">
                  <b className="font-medium">{o.person.name}</b>
                  <span className="text-text-secondary"> · {o.workspaceName}{o.branch ? <> · <span className="font-mono">{o.branch}</span></> : null} · last used {whenText(o.lastUsedAt)}</span>
                </span>
                {o.mayStop && <button type="button" className={FILES_BUTTON} disabled={busy} onClick={() => void stopOne(o.livePreviewId)}>Stop</button>}
              </li>
            ))}
          </ul>
          <p className="text-micro text-text-muted">
            Stop one of yours{room.length ? ', or pick another site with room below' : ''}. A project Admin may stop any in the project.
          </p>
        </section>
      )}

      {!places.blocked && (places.picked || room.length > 0) && (
        <div className="space-y-1">
          {places.picked && !siteId && <p className="text-text-secondary">Runs on {siteLoad(places.picked)}.</p>}
          {(room.length > 0 || siteId) && (
            <label className="flex items-center gap-2 text-text-secondary">
              Site
              <NativeSelect size="sm" aria-label="Site" value={chosen ?? ''} onChange={e => setSiteId(e.target.value)}
                >
                {places.picked && <option value={places.picked.executionSiteId}>{siteLoad(places.picked)}</option>}
                {room.map(o => <option key={o.executionSiteId} value={o.executionSiteId}>{siteLoad(o)}</option>)}
              </NativeSelect>
            </label>
          )}
        </div>
      )}

      <div>
        <Tooltip label={refused.tooltip ?? ''} wrap side="top" disabled={!refused.tooltip}>
          <button type="button" className={refused.tooltip ? withoutHover(FILES_BUTTON_PRIMARY) : FILES_BUTTON_PRIMARY} disabled={!why && (!canStart || busy)}
            onClick={() => void go()} {...refused.props}>
            <Play size={14} aria-hidden /> {busy ? 'Starting…' : places.needsGit ? 'Turn Git on and start' : 'Start live preview'}
          </button>
        </Tooltip>
        {refused.dialog}
      </div>
      {problem && <ShowAttention kind="alert" text={problem} />}
    </div>
  )
}
