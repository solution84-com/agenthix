import { ChangesList, ChangeMarker, type FileChange } from '@agenthix/ui/files'
import { EditFile } from './EditFile'
import { ViewFile } from './ViewFile'
import type { EditorMode, EditorState } from './useEditorState'

const MODES: { id: EditorMode; label: string }[] = [
  { id: 'view', label: 'View' },
  { id: 'edit', label: 'Edit' },
  { id: 'changes', label: 'Changes' },
]

const ACTION = 'rounded px-2 py-0.5 text-small text-accent hover:bg-surface-hover'

function Modes({ state }: { state: EditorState }) {
  return (
    <div role="tablist" aria-label="Mode" className="inline-flex overflow-hidden rounded-lg border border-border text-small">
      {MODES.map(m => (
        <button
          key={m.id} type="button" role="tab" aria-selected={state.mode === m.id} onClick={() => state.setMode(m.id)}
          className={`px-3 py-1 ${state.mode === m.id ? 'bg-accent text-on-accent' : 'text-text-secondary hover:text-text-primary'}`}
        >
          {m.label}
        </button>
      ))}
    </div>
  )
}

function ChangesOf({ state, baseLabel, onlyPath }: { state: EditorState; baseLabel: string; onlyPath: string | null }) {
  const shown = onlyPath ? state.changes.filter(c => c.path === onlyPath || c.oldPath === onlyPath) : state.changes
  const actions = (file: FileChange) => (
    <button type="button" className={ACTION} onClick={() => state.undo(file)}>
      {file.status === 'removed' ? 'Restore' : 'Undo this file’s changes'}
    </button>
  )
  return (
    <div data-testid="editor-changes">
      <p className="mb-2 text-small text-text-secondary">Compared with {baseLabel}.</p>
      {onlyPath && shown.length === 0
        ? <p className="text-small text-text-secondary">{onlyPath} is the same as in {baseLabel}.</p>
        : <ChangesList files={shown} actions={actions} />}
      {onlyPath && state.changes.length > shown.length && (
        <button type="button" className={`${ACTION} mt-3`} onClick={() => state.select(null)}>Show every file’s changes</button>
      )}
    </div>
  )
}

/** The open file in its three modes (board U3b): View, Edit and Changes, and with no file open every file's changes. */
export function FilePane({ state, baseLabel }: { state: EditorState; baseLabel: string }) {
  const file = state.current
  const only = state.selected
  return (
    <section className="flex min-h-0 min-w-0 flex-col p-4" aria-label="File">
      <div className="mb-3 flex shrink-0 flex-wrap items-center gap-2">
        {file
          ? <h2 className="min-w-0 flex-1 truncate font-mono text-body text-text-primary">{file.path}</h2>
          : <h2 className="min-w-0 flex-1 text-body text-text-primary">{state.gone ? state.gone.path : 'Every file’s changes'}</h2>}
        <Modes state={state} />
      </div>
      <div className="md:min-h-0 md:flex-1 md:overflow-auto">
        {state.mode === 'changes' ? (
          <ChangesOf state={state} baseLabel={baseLabel} onlyPath={file || state.gone ? only : null} />
        ) : state.gone ? (
          <div className="flex items-center gap-2 text-small text-text-secondary">
            <ChangeMarker status="removed" />
            <span>{state.gone.path} is deleted, and stays listed until the skill is published.</span>
            <button type="button" className={ACTION} onClick={() => state.undo(state.gone!)}>Restore</button>
          </div>
        ) : !file ? (
          <p className="text-small text-text-secondary">Choose a file on the left.</p>
        ) : state.mode === 'view' ? (
          <ViewFile file={file} />
        ) : (
          <EditFile file={file} onChange={state.edit} />
        )}
      </div>
    </section>
  )
}

