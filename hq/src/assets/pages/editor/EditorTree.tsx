import { useRef, useState } from 'react'
import { ChangeMarker } from '@agenthix/ui/files'
import type { FileRow } from './changeSet'
import { bytesOfText, pathProblem, type EditorFile } from './editorFiles'
import type { EditorState } from './useEditorState'

const MENU_BUTTON = 'rounded px-1.5 py-0.5 text-micro text-text-secondary hover:bg-surface-hover hover:text-text-primary'
const LINK = 'text-small text-accent hover:text-accent-hover'

function Row({ row, state, onRename }: { row: FileRow; state: EditorState; onRename: (path: string) => void }) {
  const removed = row.status === 'removed'
  const on = state.selected === row.path
  const undoable = row.status !== null
  return (
    <li className={`group flex items-center gap-1.5 px-3 py-1 ${on ? 'bg-accent-subtle' : ''}`}>
      <span className="w-4 shrink-0 text-center">
        {row.status ? <ChangeMarker status={row.status} added={row.added} removed={row.removed} /> : null}
      </span>
      <button
        type="button" data-testid="editor-file" aria-current={on ? 'true' : undefined}
        className={`min-w-0 flex-1 truncate text-left text-small ${removed ? 'text-text-secondary line-through' : 'text-text-primary'}`}
        onClick={() => state.select(row.path)} title={row.path}
      >
        {row.path}
        {row.status === 'renamed' && row.oldPath && <span className="text-text-muted"> ← {row.oldPath}</span>}
      </button>
      {(row.added > 0 || row.removed > 0) && (
        <span className="font-mono text-micro text-text-muted">
          {row.added > 0 && `+${row.added}`}{row.added > 0 && row.removed > 0 && ' '}{row.removed > 0 && `−${row.removed}`}
        </span>
      )}
      <span className="hidden gap-0.5 group-hover:flex group-focus-within:flex">
        {!removed && <button type="button" className={MENU_BUTTON} onClick={() => onRename(row.path)} aria-label={`Rename ${row.path}`}>Rename</button>}
        {!removed && <button type="button" className={MENU_BUTTON} onClick={() => state.remove(row.path)} aria-label={`Delete ${row.path}`}>Delete</button>}
        {removed && <button type="button" className={MENU_BUTTON} onClick={() => state.undo({ path: row.path, status: 'removed', before: null, after: null })} aria-label={`Restore ${row.path}`}>Restore</button>}
        {undoable && !removed && <button type="button" className={MENU_BUTTON} onClick={() => state.undo({ path: row.path, status: row.status!, oldPath: row.oldPath, before: null, after: null })} aria-label={`Undo changes to ${row.path}`}>Undo</button>}
      </span>
    </li>
  )
}

/** A path asked for in the tree: new file, or a file's new name. */
function PathAsk({ label, initial, existing, except, onDone, onCancel }: {
  label: string; initial: string; existing: string[]; except?: string; onDone: (path: string) => void; onCancel: () => void
}) {
  const [value, setValue] = useState(initial)
  const problem = value === initial && except === undefined ? null : pathProblem(value, existing, except)
  const ok = pathProblem(value, existing, except) === null
  return (
    <form
      className="border-t border-border-subtle px-3 py-2" onSubmit={e => { e.preventDefault(); if (ok) onDone(value.trim()) }}
    >
      <label className="block text-micro font-medium text-text-secondary" htmlFor="editor-path">{label}</label>
      <input
        id="editor-path" autoFocus value={value} onChange={e => setValue(e.target.value)} onKeyDown={e => { if (e.key === 'Escape') onCancel() }}
        className="mt-1 w-full rounded border border-border bg-surface-2 px-2 py-1 font-mono text-small text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
        placeholder="scripts/format.py"
      />
      {problem && <p role="alert" className="mt-1 text-micro text-danger">{problem}</p>}
      <div className="mt-2 flex gap-3">
        <button type="submit" disabled={!ok} className={`${LINK} disabled:opacity-40`}>OK</button>
        <button type="button" className="text-small text-text-secondary hover:text-text-primary" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  )
}

/** The skill's files, each with its change marker (board U3b, E1), and the tree's own actions: new file, upload (E6). */
export function EditorTree({ state }: { state: EditorState }) {
  const [asking, setAsking] = useState<{ kind: 'new' } | { kind: 'rename'; path: string } | null>(null)
  const upload = useRef<HTMLInputElement>(null)
  const paths = state.files.map(f => f.path)

  async function uploaded(list: FileList | null) {
    const picked = list?.[0]
    if (!picked) return
    const problem = pathProblem(picked.name, paths)
    if (problem) { state.setError(problem); return }
    const file: EditorFile = { path: picked.name, bytes: new Uint8Array(await picked.arrayBuffer()) }
    state.add(file)
    if (upload.current) upload.current.value = ''
  }

  return (
    <nav aria-label="Files" className="flex min-h-0 flex-col border-r border-border-subtle bg-surface-1 py-2">
      <h2 className="px-3 pb-1.5 text-micro font-semibold uppercase tracking-wider text-text-muted">Files</h2>
      <ul className="min-h-0 flex-1 overflow-y-auto" data-testid="editor-tree">
        {state.rows.map(row => <Row key={row.path} row={row} state={state} onRename={path => setAsking({ kind: 'rename', path })} />)}
      </ul>
      {asking?.kind === 'new' && (
        <PathAsk label="New file" initial="" existing={paths} onCancel={() => setAsking(null)} onDone={path => { state.add({ path, bytes: bytesOfText('') }); setAsking(null) }} />
      )}
      {asking?.kind === 'rename' && (
        <PathAsk
          label={`Rename ${asking.path}`} initial={asking.path} existing={paths} except={asking.path} onCancel={() => setAsking(null)}
          onDone={path => { if (path !== asking.path) state.rename(asking.path, path); setAsking(null) }}
        />
      )}
      <div className="flex gap-3 border-t border-border-subtle px-3 pt-2">
        <button type="button" className={LINK} onClick={() => setAsking({ kind: 'new' })}>＋ New file</button>
        <button type="button" className={LINK} onClick={() => upload.current?.click()}>Upload</button>
        <input ref={upload} type="file" className="hidden" aria-label="Upload a file" onChange={e => void uploaded(e.target.files)} />
      </div>
    </nav>
  )
}
