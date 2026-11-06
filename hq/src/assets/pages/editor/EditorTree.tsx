import { useMemo, useRef, useState } from 'react'
import { FileTree, type TreeMark } from '../../../shared/fileView/FileTree'
import type { FileRow } from './changeSet'
import { bytesOfText, pathProblem, type EditorFile } from './editorFiles'
import type { EditorState } from './useEditorState'

const MENU_BUTTON = 'rounded px-1.5 py-0.5 text-micro text-text-secondary hover:bg-surface-hover hover:text-text-primary'
const LINK = 'text-small text-accent hover:text-accent-hover'

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

function RowActions({ row, state, onRename }: { row: FileRow; state: EditorState; onRename: (path: string) => void }) {
  const removed = row.status === 'removed'
  return (
    <>
      {!removed && <button type="button" className={MENU_BUTTON} onClick={() => onRename(row.path)} aria-label={`Rename ${row.path}`}>Rename</button>}
      {!removed && <button type="button" className={MENU_BUTTON} onClick={() => state.remove(row.path)} aria-label={`Delete ${row.path}`}>Delete</button>}
      {removed && <button type="button" className={MENU_BUTTON} onClick={() => state.undo({ path: row.path, status: 'removed', before: null, after: null })} aria-label={`Restore ${row.path}`}>Restore</button>}
      {row.status !== null && !removed && <button type="button" className={MENU_BUTTON} onClick={() => state.undo({ path: row.path, status: row.status!, oldPath: row.oldPath, before: null, after: null })} aria-label={`Undo changes to ${row.path}`}>Undo</button>}
    </>
  )
}

/**
 * The skill's files as the tree the skill's page shows (board *The editor*), each change against the version compared
 * with marked, *Only changed* narrowing it to them, and the tree's own actions: new file, upload, and on each file
 * Rename, Delete and Undo (E6).
 */
export function EditorTree({ state }: { state: EditorState }) {
  const [asking, setAsking] = useState<{ kind: 'new' } | { kind: 'rename'; path: string } | null>(null)
  const [onlyChanged, setOnlyChanged] = useState(false)
  const upload = useRef<HTMLInputElement>(null)
  const paths = state.files.map(f => f.path)
  const changed = useMemo(() => state.rows.filter(r => r.status !== null), [state.rows])
  const marks = useMemo(() => new Map<string, TreeMark>(changed.map(r => [r.path, { status: r.status!, added: r.added, removed: r.removed }])), [changed])
  const shown = onlyChanged ? changed.map(r => r.path) : state.rows.map(r => r.path)
  const byPath = new Map(state.rows.map(r => [r.path, r]))

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
    <nav aria-label="Files" className="flex min-h-0 flex-col border-b border-border-subtle bg-surface-1 md:border-b-0 md:border-r">
      <div className="flex shrink-0 items-center gap-2 px-3 py-2">
        <h2 className="flex-1 text-micro font-semibold uppercase tracking-wider text-text-muted">Files</h2>
        <label className="flex items-center gap-1.5 text-micro text-text-secondary">
          <input type="checkbox" checked={onlyChanged} onChange={e => setOnlyChanged(e.target.checked)} />
          Only changed · {changed.length}
        </label>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto" data-testid="editor-tree">
        <FileTree paths={shown} marks={marks} selected={state.selected} onOpen={state.select}
          actions={path => { const row = byPath.get(path); return row ? <RowActions row={row} state={state} onRename={p => setAsking({ kind: 'rename', path: p })} /> : null }} />
      </div>
      {asking?.kind === 'new' && (
        <PathAsk label="New file" initial="" existing={paths} onCancel={() => setAsking(null)} onDone={path => { state.add({ path, bytes: bytesOfText('') }); setAsking(null) }} />
      )}
      {asking?.kind === 'rename' && (
        <PathAsk
          label={`Rename ${asking.path}`} initial={asking.path} existing={paths} except={asking.path} onCancel={() => setAsking(null)}
          onDone={path => { if (path !== asking.path) state.rename(asking.path, path); setAsking(null) }}
        />
      )}
      <div className="flex shrink-0 gap-3 border-t border-border-subtle px-3 py-2">
        <button type="button" className={LINK} onClick={() => setAsking({ kind: 'new' })}>＋ New file</button>
        <button type="button" className={LINK} onClick={() => upload.current?.click()}>Upload</button>
        <input ref={upload} type="file" className="hidden" aria-label="Upload a file" onChange={e => void uploaded(e.target.files)} />
      </div>
    </nav>
  )
}
