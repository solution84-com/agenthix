import { useState } from 'react'
import { GitBranch, GitMerge, Loader, RefreshCw, RotateCcw } from 'lucide-react'
import { useAction, restoreVersion } from 'wasp/client/operations'
import { Modal } from '@agenthix/ui/primitives'
import { FILES_BUTTON, FILES_BUTTON_PRIMARY } from '@agenthix/ui/projects'
import type { NextStep } from '../nextStep'
import { restoreNotice, returnWords } from '../words'
import { ShowAttention } from '@agenthix/ui/attention'
import { pressFailureWords } from '../../shared/failureWords'

export interface NextStepActions {
  onGit: () => void
  onMerge: () => void
  onUpdate: () => void
  onLatest: () => void
  onReturn: () => void
  /** The hover on *Bring up to date*: why it is the next step. */
  updateWhy: string
  /** The number of the older version in view, when known. */
  olderNumber: number | null
}

/**
 * The one next-step button (two on an older version of main), top right beside About, or full width at a phone's
 * foot. It never shares its name with the dialog it opens.
 */
export function NextStepButtons({ step, actions, wide = false }: { step: NextStep; actions: NextStepActions; wide?: boolean }) {
  const grow = wide ? 'flex-1 justify-center' : ''
  switch (step.kind) {
    case 'none': return null
    case 'git':
      return <button type="button" className={`${FILES_BUTTON} ${grow}`} onClick={actions.onGit}><GitBranch size={14} aria-hidden /> Keep versions with Git…</button>
    case 'merge': {
      const button = <button type="button" className={`${FILES_BUTTON_PRIMARY} ${grow}`} onClick={actions.onMerge}><GitMerge size={14} aria-hidden /> Merge into main…</button>
      if (!step.asked) return button
      return (
        <span className={`flex items-center gap-2 ${wide ? 'w-full flex-col items-stretch' : ''}`}>
          <span className="text-small text-text-muted" data-testid="merge-asked">{step.asked} asked to merge this and waits for an answer</span>
          {button}
        </span>
      )
    }
    case 'update':
      return (
        <button type="button" className={`${FILES_BUTTON_PRIMARY} ${grow}`} title={actions.updateWhy} onClick={actions.onUpdate}>
          <RefreshCw size={14} aria-hidden /> Bring up to date
        </button>
      )
    case 'updating':
      return (
        <button type="button" className={`${FILES_BUTTON} ${grow}`} disabled aria-live="polite">
          <Loader size={14} aria-hidden className="animate-spin" /> Updating…
        </button>
      )
    case 'older': {
      const n = actions.olderNumber
      return (
        <span className={`flex items-center gap-2 ${wide ? 'w-full' : ''}`}>
          <button type="button" className={`${FILES_BUTTON} ${grow}`} onClick={actions.onLatest}>Back to latest</button>
          {step.mayReturn && (
            <button type="button" className={`${FILES_BUTTON_PRIMARY} ${grow}`} onClick={actions.onReturn}>
              <RotateCcw size={14} aria-hidden /> Return main to {n === null ? 'this version' : `v${n}`}…
            </button>
          )}
        </span>
      )
    }
  }
}

/** *Return main to v12…*: main gets a new version with exactly that version's files, as Restore always did. */
export function ReturnMainDialog({ workspaceId, version, number, expectedMain, onClose, onDone }: {
  workspaceId: string
  version: string
  number: number | null
  expectedMain: string
  onClose: () => void
  /** What happened, in words, once it went through. */
  onDone: (words: string, restored: boolean) => void
}) {
  const restore = useAction(restoreVersion)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const name = number === null ? 'this version' : `v${number}`
  const go = async () => {
    setBusy(true)
    setError(null)
    try {
      const result = await restore({ workspaceId, versionCommit: version, expectedMain })
      onDone(restoreNotice(result, number ?? 0), result.outcome === 'restored')
    } catch (e) {
      setError(`${pressFailureWords(e, 'main was not returned to that version.')} Nothing was changed.`)
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal open onClose={onClose} title={`Return main to ${name}`}>
      <div className="space-y-4 text-small" data-testid="return-main-dialog">
        <p className="text-text-secondary">{returnWords(number)}</p>
        {error && <ShowAttention kind="alert" text={error} />}
        <div className="flex justify-end gap-2">
          <button type="button" className={FILES_BUTTON} onClick={onClose}>Cancel</button>
          <button type="button" className={FILES_BUTTON_PRIMARY} disabled={busy} onClick={() => void go()}>
            {busy ? 'Returning…' : `Make ${name} main again`}
          </button>
        </div>
      </div>
    </Modal>
  )
}
