import { useEffect, useState } from 'react'
import { Button } from '@agenthix/ui/primitives'
import { ConfirmDialog } from '../../../shared/components/ConfirmDialog'
import { AskAgentBox } from './AskAgentBox'
import { ChecksPanel } from './ChecksPanel'
import { EditorTree } from './EditorTree'
import { FilePane } from './FilePane'
import { PublishDialog } from './PublishDialog'
import { changeSummary } from './changeSet'
import { publishBlock, saveStatus } from './editorWords'
import type { EditorView } from './editorTypes'
import type { EditorApi } from './useEditorApi'
import { useEditorState } from './useEditorState'

/** Leaving with a change not yet saved asks first. */
function useLeaveGuard(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return
    const guard = (e: BeforeUnloadEvent) => { e.preventDefault() }
    window.addEventListener('beforeunload', guard)
    return () => window.removeEventListener('beforeunload', guard)
  }, [dirty])
}

export interface SkillEditorProps {
  view: EditorView
  api: EditorApi
  reload: () => Promise<unknown>
  /** The draft was discarded: leave the editor. */
  onDiscarded: () => void
  /** Editing a skill another publisher signed: make the organisation's own copy and open that. */
  onMakeCopy?: () => void
}

/**
 * The editor for one skill (skills spec part 6, board U3b): its files in a tree with change markers, the open file in
 * View, Edit or Changes, checks as the person edits, the draft saving itself a moment after they stop typing, and
 * publishing the revision seen, which a pending save holds back. Agents draft, people publish: nothing here reaches an
 * agent until Publish.
 */
export function SkillEditor({ view, api, reload, onDiscarded, onMakeCopy }: SkillEditorProps) {
  const state = useEditorState(view, api, reload)
  const [publishing, setPublishing] = useState(false)
  const [asking, setAsking] = useState(false)
  const [discarding, setDiscarding] = useState(false)
  useLeaveGuard(state.dirty || state.saving)

  const readOnly = !view.editsHere
  const published = view.inUse !== null
  const place = view.target.kind === 'place'
  const why = publishBlock({
    mayPublish: view.mayPublish, place, dirty: state.dirty, saving: state.saving, failed: state.failed, moved: state.moved,
    nothing: state.changes.length === 0 || view.revision === null, blocked: state.blocked, inUse: view.inUse,
  })

  return (
    <div className="mx-auto flex max-w-6xl flex-col px-4 py-4 md:h-full lg:px-8" data-testid="skill-editor">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="min-w-0 text-h1 font-semibold text-text-primary">{view.name}</h1>
        {view.revision !== null && <span className="rounded-full bg-surface-2 px-2.5 py-0.5 text-small font-medium text-warning">Draft</span>}
        <span className="flex-1" />
        {!readOnly && <Button variant="secondary" onClick={() => setAsking(a => !a)}>Ask an agent to edit</Button>}
        {!readOnly && view.revision !== null && <Button variant="secondary" onClick={() => setDiscarding(true)}>Discard draft</Button>}
        {!readOnly && (
          <Button disabled={why !== null} onClick={() => setPublishing(true)} title={why ?? undefined} aria-describedby={why ? 'publish-why' : undefined}>
            Publish…
          </Button>
        )}
      </div>
      {!readOnly && (
        <div className="mt-1 flex flex-wrap items-center justify-end gap-x-3 gap-y-1 text-small">
          <span role="status" data-testid="draft-state" className={state.failed && state.dirty ? 'text-danger' : 'text-text-secondary'}>
            {saveStatus({ dirty: state.dirty, saving: state.saving, failed: state.failed, moved: state.moved, revision: view.revision })}
          </span>
          {why && <span id="publish-why" data-testid="publish-why" className="text-text-secondary">{why}</span>}
        </div>
      )}
      <p className="mt-1 text-small text-text-secondary" data-testid="editor-subline">
        {[
          view.identity,
          published ? `version ${view.inUse} ${view.target.kind === 'library' ? 'in use' : 'newest'}` : 'not published yet',
          view.draftBy ? `draft by ${view.draftBy}` : null,
          view.revision !== null || state.dirty ? changeSummary(state.changes) : null,
        ].filter(Boolean).join(' · ')}
      </p>

      {readOnly && (
        <div role="status" className="mt-3 rounded-lg border border-border-subtle bg-surface-1 p-3 text-small text-text-primary">
          <p>{view.notEditableReason?.replace(/ Nothing was changed\.$/, '')}</p>
          {onMakeCopy && <Button className="mt-2" onClick={onMakeCopy}>Edit as the organisation’s own copy</Button>}
        </div>
      )}
      {state.moved && (
        <p role="status" className="mt-3 rounded-lg border border-warning bg-surface-2 p-3 text-small text-text-primary">
          The draft changed while you were editing (an agent or a colleague saved it).{' '}
          <button type="button" className="text-accent underline" onClick={state.reloadFromServer}>Load their version</button>
          {' '}to see it, which drops your unsaved edits, or{' '}
          <button type="button" className="text-accent underline" onClick={() => void state.save()}>keep yours</button>, which saves them over theirs.
        </p>
      )}
      {asking && <AskAgentBox identity={view.identity} where={view.where} onClose={() => setAsking(false)} onAsked={() => setAsking(false)} />}
      {state.error && <p role="alert" className="mt-3 text-small text-danger">{state.error}</p>}

      <div className="mt-3 grid min-h-[380px] flex-1 overflow-hidden rounded-lg border border-border-subtle md:grid-cols-[230px_1fr] md:grid-rows-[minmax(0,1fr)]">
        <EditorTree state={state} />
        <FilePane state={state} baseLabel={view.baseLabel} />
      </div>

      <ChecksPanel checks={state.checks} />

      {publishing && (
        <PublishDialog
          view={view} api={api} changes={state.changes}
          onClose={() => { setPublishing(false); void reload() }} onPublished={() => void reload()}
          onReload={() => { setPublishing(false); void reload(); state.reloadFromServer() }}
        />
      )}
      <ConfirmDialog
        open={discarding} title="Discard this draft?" destructive confirmLabel="Discard draft"
        description={published ? `The draft goes; ${view.name} stays at version ${view.inUse}.` : `${view.name} was never published, so it goes with its draft.`}
        onCancel={() => setDiscarding(false)}
        onConfirm={() => {
          setDiscarding(false)
          if (view.revision !== null) void api.discard(view.revision).then(onDiscarded, err => state.setError(err instanceof Error ? err.message : 'It could not be discarded. Nothing was changed.'))
        }}
      />
    </div>
  )
}
