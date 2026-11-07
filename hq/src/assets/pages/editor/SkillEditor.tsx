import { useEffect, useState, type ReactNode } from 'react'
import { Button } from '@agenthix/ui/primitives'
import { ConfirmDialog } from '../../../shared/components/ConfirmDialog'
import { AskAgentBox } from './AskAgentBox'
import { ChecksPanel } from './ChecksPanel'
import { EditorTree } from './EditorTree'
import { FilePane } from './FilePane'
import { PublishDialog } from './PublishDialog'
import { MoreMenu, type MenuItem } from '../../../org/components/menus'
import { draftWords } from '../asset/skill/skillWords'
import { firstProblem, problemsWhere } from './editorChecks'
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
  /** *draft ▾*: the skill's versions with the draft at the top. */
  versionMenu?: ReactNode
}

/**
 * The editor for one skill (skills spec part 6; board *The editor*): the skill's page ready to write in, its files in a
 * tree with change markers, the open file with a *Changes* switch, checks as one line at the foot with each problem at
 * its line, the draft saving itself a moment after they stop typing, and
 * publishing the revision seen, which a pending save holds back. Agents draft, people publish: nothing here reaches an
 * agent until Publish.
 */
export function SkillEditor({ view, api, reload, onDiscarded, onMakeCopy, versionMenu }: SkillEditorProps) {
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
    problems: problemsWhere(state.checks),
  })
  const problem = firstProblem(state.checks)

  const show = (path: string) => { state.select(path); state.setShowChanges(false) }
  const menu: MenuItem[] = !readOnly && view.revision !== null
    ? [{ label: 'Discard draft…', hint: published ? `Keeps version ${view.inUse}` : 'It was never published', danger: true, onSelect: () => setDiscarding(true) }]
    : []

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="skill-editor">
      <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-border-subtle bg-surface-1 px-4 py-2.5 lg:px-6">
        <h1 className="min-w-0 truncate text-h2 font-semibold text-text-primary">{view.name}</h1>
        {versionMenu}
        <span className="min-w-0 truncate text-small text-text-secondary" data-testid="editor-subline">
          {view.revision !== null && <span className="mr-1.5 rounded-full bg-surface-2 px-2 py-0.5 text-micro font-medium text-warning">Draft</span>}
          {draftWords(state.changes.length, view.baseLabel, view.revision !== null || state.dirty).replace(/^Draft · /, '')}
          {view.draftBy ? ` · last saved by ${view.draftBy}` : ''}
        </span>
        <span className="flex-1" />
        {!readOnly && <Button variant="secondary" onClick={() => setAsking(a => !a)}>Ask an agent to edit</Button>}
        {menu.length > 0 && <MoreMenu items={menu} label={`More about the draft of ${view.name}`} />}
        {!readOnly && (
          <Button disabled={why !== null} onClick={() => setPublishing(true)} title={why ?? undefined} aria-describedby={why ? 'publish-why' : undefined}>
            Publish…
          </Button>
        )}
      </div>
      {!readOnly && why && (
        <p id="publish-why" data-testid="publish-why" role="status" className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border-subtle bg-surface-2 px-4 py-1.5 text-small text-text-primary lg:px-6">
          <span>{why}</span>
          {state.blocked && problem?.path && <button type="button" className="text-accent hover:underline" onClick={() => show(problem.path!)}>Show it</button>}
        </p>
      )}

      {readOnly && (
        <div role="status" className="shrink-0 border-b border-border-subtle bg-surface-2 px-4 py-2 text-small text-text-primary lg:px-6">
          <p>{view.notEditableReason?.replace(/ Nothing was changed\.$/, '')}</p>
          {onMakeCopy && <Button className="mt-2" onClick={onMakeCopy}>Edit as the organisation’s own copy</Button>}
        </div>
      )}
      {state.moved && (
        <p role="status" className="shrink-0 border-b border-warning bg-surface-2 px-4 py-2 text-small text-text-primary lg:px-6">
          The draft changed while you were editing (an agent or a colleague saved it).{' '}
          <button type="button" className="text-accent underline" onClick={state.reloadFromServer}>Load their version</button>
          {' '}to see it, which drops your unsaved edits, or{' '}
          <button type="button" className="text-accent underline" onClick={() => void state.save()}>keep yours</button>, which saves them over theirs.
        </p>
      )}
      {asking && <AskAgentBox identity={view.identity} where={view.where} onClose={() => setAsking(false)} onAsked={() => setAsking(false)} />}
      {state.error && <p role="alert" className="shrink-0 px-4 py-2 text-small text-danger lg:px-6">{state.error}</p>}

      <div className="grid min-h-[380px] flex-1 md:grid-cols-[260px_minmax(0,1fr)] md:grid-rows-[minmax(0,1fr)] md:overflow-hidden">
        <EditorTree state={state} />
        <FilePane state={state} baseLabel={view.baseLabel} />
      </div>

      <ChecksPanel checks={state.checks} onShow={show} status={!readOnly && (
        <span role="status" data-testid="draft-state" className={state.failed && state.dirty ? 'text-danger' : 'text-text-secondary'}>
          {saveStatus({ dirty: state.dirty, saving: state.saving, failed: state.failed, moved: state.moved, revision: view.revision })}
        </span>
      )} />

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
