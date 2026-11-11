import { useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { useAction, turnGitOn } from 'wasp/client/operations'
import { GIT_INIT_LARGE_FILE_BYTES } from '@agenthix/core'
import { Modal } from '@agenthix/ui/primitives'
import { FILES_BUTTON, FILES_BUTTON_PRIMARY } from '@agenthix/ui/projects'
import { gitOnNote } from '../words'
import { ShowAttention } from '@agenthix/ui/attention'

export type GitTurnedOn = { leftOut: string[]; gitignoreAdded: boolean }

/**
 * *Keep versions with Git…*'s dialog: it says first that it cannot be undone, then what a person gets and what changes
 * in the folder. Its button names the workspace, so it does not read like the button that opened it.
 */
export function TurnGitOnDialog({ workspaceId, name, onClose, onDone }: {
  workspaceId: string
  name: string
  onClose: () => void
  onDone: (result: GitTurnedOn) => void
}) {
  const turnOn = useAction(turnGitOn)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const go = async () => {
    setBusy(true)
    setError(null)
    try {
      const result = await turnOn({ workspaceId })
      onDone({ leftOut: result.leftOut, gitignoreAdded: result.gitignoreAdded })
    } catch (e) {
      setError(e instanceof Error ? `${e.message} Nothing was changed.` : 'Git could not be turned on. Nothing was changed.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal open onClose={onClose} title="Keep versions of this workspace with Git" maxWidth="max-w-lg">
      <div className="space-y-3 text-small text-text-secondary" data-testid="turn-git-on">
        <p role="note" className="flex gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-text-primary">
          <AlertTriangle size={16} aria-hidden className="mt-0.5 shrink-0 text-warning" />
          <span><b>This can't be undone.</b> Once Git is on for a workspace, it stays on.</span>
        </p>
        <p className="font-medium text-text-primary">What you get</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Each agent works on its own branch; you review the changes and merge them into main.</li>
          <li>Every merge is a version you can look back at or return to.</li>
          <li>Tasks can run here.</li>
        </ul>
        <p className="font-medium text-text-primary">What changes in the folder</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>main is protected: it changes only by merging a branch.</li>
          <li>A <code>.gitignore</code> file is added when there is none, listing files Git should not keep.</li>
          <li>Files over {GIT_INIT_LARGE_FILE_BYTES / (1024 * 1024)} MB are left out of the first version and stay in the folder.</li>
        </ul>
        {error && <ShowAttention text={error} />}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className={FILES_BUTTON} onClick={onClose}>Cancel</button>
          <button type="button" className={FILES_BUTTON_PRIMARY} disabled={busy} onClick={() => void go()}>
            {busy ? 'Turning on Git…' : `Turn on Git for ${name}`}
          </button>
        </div>
      </div>
    </Modal>
  )
}

/** The one short line after Git was turned on, until dismissed: what changed in the folder. */
export function GitOnNote({ result }: { result: GitTurnedOn }) {
  return (
    <ShowAttention title="Git is on" text={<>
      {gitOnNote(result.gitignoreAdded)}
      {result.leftOut.length > 0 && <> Left out of the first version for their size, and kept in the folder: {result.leftOut.join(', ')}.</>}
    </>} />
  )
}
