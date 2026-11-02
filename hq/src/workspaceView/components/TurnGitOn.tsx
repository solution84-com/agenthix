import { useState } from 'react'
import { GitBranch } from 'lucide-react'
import { useAction, turnGitOn } from 'wasp/client/operations'
import { GIT_INIT_LARGE_FILE_BYTES } from '@agenthix/core'
import { Modal } from '@agenthix/ui/primitives'
import { FILES_BUTTON, FILES_BUTTON_PRIMARY } from '@agenthix/ui/projects'
import { TURN_GIT_ON_WORDS, VIEWER_REASON } from '../words'

/**
 * *Turn Git on* (spec part 3, *Turning Git on*), where *Live preview* and *Git* stand in a workspace without Git. The
 * person reads what happens first; the files left out for their size are named afterwards.
 */
export function TurnGitOn({ workspaceId, name, canAct, onDone }: { workspaceId: string; name: string; canAct: boolean; onDone: () => void }) {
  const turnOn = useAction(turnGitOn)
  const [asking, setAsking] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [leftOut, setLeftOut] = useState<string[] | null>(null)

  const go = async () => {
    setBusy(true)
    setError(null)
    try {
      const result = await turnOn({ workspaceId })
      setAsking(false)
      if (result.leftOut.length) setLeftOut(result.leftOut)
      onDone()
    } catch (e) {
      setError(e instanceof Error ? `${e.message} Nothing was changed.` : 'Git could not be turned on. Nothing was changed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-1 rounded-lg border border-border-subtle px-2 py-2 text-small" data-testid="turn-git-on">
      <p className="text-text-secondary">Live preview and Git need {name} to be a Git repository.</p>
      <button type="button" className={FILES_BUTTON} disabled={!canAct} title={canAct ? undefined : VIEWER_REASON} onClick={() => setAsking(true)}>
        <GitBranch size={14} aria-hidden /> Turn Git on
      </button>
      {!canAct && <p className="text-micro text-text-muted">{VIEWER_REASON}</p>}
      {leftOut && (
        <p role="status" className="text-micro text-text-secondary">
          Left out of the first version for their size, and kept on disk untracked: {leftOut.join(', ')}.
        </p>
      )}
      {asking && (
        <Modal open onClose={() => setAsking(false)} title="Turn Git on">
          <div className="space-y-4 text-small">
            <p className="text-text-secondary">{TURN_GIT_ON_WORDS(name)}</p>
            <p className="text-micro text-text-muted">Files over {GIT_INIT_LARGE_FILE_BYTES / (1024 * 1024)} MB are left out of the first version and stay on disk, untracked. Git cannot be turned off again.</p>
            {error && <p role="alert" className="text-danger">{error}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" className={FILES_BUTTON} onClick={() => setAsking(false)}>Cancel</button>
              <button type="button" className={FILES_BUTTON_PRIMARY} disabled={busy} onClick={() => void go()}>{busy ? 'Turning Git on…' : 'Turn Git on'}</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
