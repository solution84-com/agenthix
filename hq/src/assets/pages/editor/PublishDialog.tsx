import { useState } from 'react'
import { Button, Modal, FIELD as FIELD_LOOK } from '@agenthix/ui/primitives'
import { ChangesList, type FileChange } from '@agenthix/ui/files'
import { changeSummary } from './changeSet'
import { WhichAgentsDialog } from '../../../library/components/WhichAgentsDialog'
import type { Bump, EditorApi } from './useEditorApi'
import type { EditorView } from './editorTypes'
import { ShowAttention } from '@agenthix/ui/attention'

const STEPS: { id: Bump; label: string }[] = [
  { id: 'patch', label: 'Patch' }, { id: 'minor', label: 'Minor' }, { id: 'major', label: 'Major' },
]

/** Who a publish reaches, in words: "Ada and Priya use it from their next turn." */
export function reachWords(view: EditorView): string {
  if (view.target.kind === 'place') return 'It is written into the place’s files, and the agents that work there use it from their next turn once it is switched on.'
  const { everyAgent, names } = view.agentsWith
  if (everyAgent) return 'Every agent uses it from its next turn.'
  if (names.length === 0) return 'No agent has it yet. After publishing you can add it to agents.'
  const list = names.length <= 3 ? names.join(', ').replace(/, ([^,]*)$/, ' and $1') : `${names.slice(0, 2).join(', ')} and ${names.length - 2} others`
  return `${list} ${names.length === 1 ? 'uses' : 'use'} it from their next turn.`
}

/**
 * Publish (spec part 2, D24; board U3b section 5): the full difference since the version in use, every file, a note, and
 * the version step. It publishes only the draft revision this person is looking at; if the draft moved, the server
 * refuses and this says so and offers to reload.
 */
export function PublishDialog({ view, api, changes, onClose, onPublished, onReload }: {
  view: EditorView
  api: EditorApi
  changes: readonly FileChange[]
  onClose: () => void
  onPublished: (version: string) => void
  onReload: () => void
}) {
  const [note, setNote] = useState('')
  const [bump, setBump] = useState<Bump>('minor')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [moved, setMoved] = useState(false)
  const [done, setDone] = useState<string | null>(null)
  const first = view.inUse === null
  const library = view.target.kind === 'library'
  const next = library
    ? first ? '1.0.0' : view.nextVersions![bump]
    : String(view.nextNumber)

  async function publish() {
    if (view.revision === null) return
    setBusy(true)
    setError('')
    try {
      const result = await api.publish({ revision: view.revision, note: note.trim(), ...(library && !first ? { bump } : {}) })
      setDone(result.version)
      onPublished(result.version)
    } catch (err) {
      const text = err instanceof Error ? err.message : 'It could not be published. Nothing was changed.'
      setError(text)
      setMoved(/changed since you looked|changed as you published|no draft to publish/i.test(text))
    } finally {
      setBusy(false)
    }
  }

  // Publishing a library skill ends on which agents use it; a place's skill reaches the agents that work there.
  if (done !== null && view.target.kind === 'library') {
    return <WhichAgentsDialog assetId={view.target.assetId} title={`${view.name} ${done} is published`} onDone={onClose} />
  }
  if (done !== null) {
    return (
      <Modal open onClose={onClose} title={`Published version ${done}`} maxWidth="max-w-lg">
        <p className="text-body text-text-primary">{view.name} is at version {done}.</p>
        <ShowAttention kind="alert" text={error} title="It was not published" actions={moved ? [{ label: 'Reload the draft', onClick: onReload }] : undefined} onClose={() => setError('')} />
      <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Close</Button>
        </div>
      </Modal>
    )
  }
  return (
    <Modal open onClose={onClose} title={`Publish version ${next}`} maxWidth="max-w-3xl">
      <div className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto">
        <p className="text-body text-text-primary" data-testid="publish-summary">
          {changeSummary(changes)}. {reachWords(view)}
        </p>
        <ChangesList files={[...changes]} />
        {library && !first && (
          <fieldset className="flex items-center gap-4">
            <legend className="mb-1 text-small font-medium text-text-secondary">Version step</legend>
            {STEPS.map(s => (
              <label key={s.id} className="flex items-center gap-1.5 text-small text-text-primary">
                <input type="radio" className="accent-accent" name="bump" checked={bump === s.id} onChange={() => setBump(s.id)} />
                {s.label} <span className="font-mono text-text-muted">{view.nextVersions![s.id]}</span>
              </label>
            ))}
          </fieldset>
        )}
        <label className="block text-small font-medium text-text-secondary" htmlFor="publish-note">
          Note: what changed, for the history
          <textarea
            id="publish-note" value={note} onChange={e => setNote(e.target.value)} rows={3} maxLength={1000}
            className={`mt-1 w-full rounded-lg px-3 py-2 text-body ${FIELD_LOOK}`}
          />
        </label>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button disabled={busy || note.trim() === '' || view.revision === null || changes.length === 0} onClick={() => void publish()}>
          Publish version {next}
        </Button>
      </div>
    </Modal>
  )
}
