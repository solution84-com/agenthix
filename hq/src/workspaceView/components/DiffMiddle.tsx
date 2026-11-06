import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, ChevronLeft } from 'lucide-react'
import { useQuery, getGitFile } from 'wasp/client/operations'
import type { BranchFileChange } from '@agenthix/core'
import { ChangeMarker, type DiffRow } from '@agenthix/ui/files'
import { FilesQuietLine } from '@agenthix/ui/projects'
import type { BranchRef, GitFileView } from '../../branches/views'
import { useOnWorkspaceChange } from '../hooks/useWorkspaceLive'
import { MARK_HINT, baseName, markerStatus, parentOf } from './changeMarks'
import { fileRows, stepTo, type FileMode } from './fileRows'

type Side = { text: string | null; note: string | null; loading: boolean; error: Error | null }

function useSide(workspaceId: string, gitRef: BranchRef, at: 'tip' | 'base', path: string | null): Side {
  const { data, error, refetch } = useQuery(getGitFile, { workspaceId, ref: gitRef, at, path: path ?? '' }, { enabled: path !== null })
  useOnWorkspaceChange(refetch)
  if (path === null) return { text: null, note: null, loading: false, error: null }
  const view = data as GitFileView | undefined
  if (!view) return { text: null, note: null, loading: !error, error: error ?? null }
  if (!view.exists) return { text: null, note: null, loading: false, error: null }
  if (view.binary) return { text: null, note: 'A binary file: there are no lines to show.', loading: false, error: null }
  if (view.tooLarge || view.text === null) return { text: null, note: 'Too large to show here.', loading: false, error: null }
  return { text: view.text, note: null, loading: false, error: null }
}

const WHERE: Record<BranchFileChange['status'], string> = { added: 'new', modified: 'changed', deleted: 'deleted', renamed: 'renamed' }

/** "changed on this branch", "new in v12": what the open file's header says of it. */
export function changeWords(status: BranchFileChange['status'], where: string): string {
  return `${WHERE[status]} ${where}`
}

/**
 * A changed file opened whole, its changes in place (board *Files and changes, one view*): every line, the removed
 * and added ones marked where they are, ↑↓ to step between the changes, and *Changes only* to fold the unchanged
 * lines. The text at the base against the tip; an added file has no base side, a deleted one no tip side, and a
 * renamed one is read under its old path at the base. Narrow, the file is its own screen with ↑↓ at the foot.
 */
export function DiffMiddle({ workspaceId, gitRef, baseRef, change, where, layout, onBack }: {
  workspaceId: string
  gitRef: BranchRef
  /** Where the base side is read, at its tip: the version before an older version of main. Absent, `gitRef`'s base. */
  baseRef?: BranchRef
  change: BranchFileChange
  /** "on this branch": where the change was made, for the header. */
  where: string
  layout: 'wide' | 'narrow'
  onBack: () => void
}) {
  const basePath = change.status === 'added' ? null : change.from ?? change.path
  const tipPath = change.status === 'deleted' ? null : change.path
  const before = useSide(workspaceId, baseRef ?? gitRef, baseRef ? 'tip' : 'base', basePath)
  const after = useSide(workspaceId, gitRef, 'tip', tipPath)
  const failed = before.error ?? after.error
  const note = before.note ?? after.note
  const ready = !failed && !note && !before.loading && !after.loading
  const [mode, setMode] = useState<FileMode>('whole')
  const { rows, changes } = useMemo(
    () => (ready ? fileRows(before.text, after.text, mode) : { rows: [] as DiffRow[], changes: [] as number[] }),
    [ready, before.text, after.text, mode],
  )
  const [at, setAt] = useState(0)
  useEffect(() => { setAt(0) }, [change.path, mode])
  const rowRefs = useRef(new Map<number, HTMLTableRowElement>())
  const current = changes[at] ?? -1
  useEffect(() => {
    const row = current >= 0 ? rowRefs.current.get(current) : undefined
    // jsdom has no scrollIntoView; a browser always does.
    row?.scrollIntoView?.({ block: 'center' })
  }, [current])
  const step = (by: 1 | -1) => setAt(a => stepTo(changes.length, a, by))
  const narrow = layout === 'narrow'
  const said = changeWords(change.status, where)
  const count = changes.length

  const stepper = count > 0 && (
    <span className="flex items-center gap-1" data-testid="change-stepper">
      <button type="button" aria-label="Previous change" disabled={at <= 0} onClick={() => step(-1)}
        className="flex h-7 w-7 items-center justify-center rounded text-text-secondary hover:bg-surface-hover disabled:opacity-40"><ArrowUp size={14} aria-hidden /></button>
      <button type="button" aria-label="Next change" disabled={at >= count - 1} onClick={() => step(1)}
        className="flex h-7 w-7 items-center justify-center rounded text-text-secondary hover:bg-surface-hover disabled:opacity-40"><ArrowDown size={14} aria-hidden /></button>
      <span className="text-micro text-text-muted">{at + 1} of {count} {count === 1 ? 'change' : 'changes'}</span>
    </span>
  )
  const modes = (
    <span role="group" aria-label="Show" className="flex items-center gap-1 text-micro">
      {(['whole', 'changes'] as const).map((m, i) => (
        <span key={m} className="flex items-center gap-1">
          {i > 0 && <span aria-hidden className="text-text-muted">·</span>}
          <button type="button" aria-pressed={mode === m} onClick={() => setMode(m)}
            className={mode === m ? 'font-semibold text-text-primary' : 'text-text-secondary hover:text-text-primary'}>
            {m === 'whole' ? 'Whole file' : 'Changes only'}
          </button>
        </span>
      ))}
    </span>
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="changed-file">
      {narrow ? (
        <div className="flex shrink-0 items-center gap-2 border-b border-border-subtle px-2 py-1.5">
          <button type="button" aria-label="Back to the files" onClick={onBack}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-text-secondary hover:bg-surface-hover"><ChevronLeft size={18} aria-hidden /></button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-body font-semibold text-text-primary">{baseName(change.path)}</p>
            <p className="truncate text-micro text-text-muted">{parentOf(change.path) ? `${parentOf(change.path)}/ · ` : ''}{said}</p>
          </div>
        </div>
      ) : (
        <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-border-subtle px-4 py-2 text-small text-text-secondary">
          <span title={MARK_HINT[change.status]}><ChangeMarker status={markerStatus(change.status)} added={change.additions ?? 0} removed={change.deletions ?? 0} /></span>
          <b className="font-mono text-text-primary">{change.path}</b>
          <span>{said}{change.from && ` from ${change.from}`}</span>
          {stepper}
          <span className="ml-auto">{modes}</span>
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-auto py-1" data-testid="workspace-diff">
        {failed ? <FilesQuietLine role="status">{failed.message}</FilesQuietLine>
          : note ? <FilesQuietLine role="status">{note}</FilesQuietLine>
          : !ready ? <FilesQuietLine>Loading…</FilesQuietLine>
          : <Lines rows={rows} current={current} wrap={narrow} rowRefs={rowRefs.current} empty={count === 0} />}
      </div>
      {narrow && count > 0 && (
        <div className="flex shrink-0 items-center justify-between border-t border-border-subtle px-3 py-2 text-small">
          <button type="button" disabled={at <= 0} onClick={() => step(-1)} className="flex items-center gap-1 text-accent disabled:text-text-muted">
            <ArrowUp size={14} aria-hidden /> Previous change
          </button>
          <span className="text-micro text-text-muted">{at + 1} of {count}</span>
          <button type="button" disabled={at >= count - 1} onClick={() => step(1)} className="flex items-center gap-1 text-accent disabled:text-text-muted">
            Next change <ArrowDown size={14} aria-hidden />
          </button>
        </div>
      )}
    </div>
  )
}

const LOOK = {
  add: { sign: '+', word: 'added', row: 'bg-success/10', tone: 'text-success' },
  del: { sign: '−', word: 'removed', row: 'bg-danger/10', tone: 'text-danger' },
  same: { sign: ' ', word: 'unchanged', row: '', tone: 'text-text-muted' },
} as const

/** The lines, each with its number (the old one for a removed line), a sign and the text, drawn as text only. */
function Lines({ rows, current, wrap, rowRefs, empty }: {
  rows: DiffRow[]
  current: number
  wrap: boolean
  rowRefs: Map<number, HTMLTableRowElement>
  empty: boolean
}) {
  return (
    <>
      {empty && <FilesQuietLine role="status">No lines changed.</FilesQuietLine>}
      <table className="w-full border-collapse font-mono text-small" aria-label="The file, its changes in place">
        <tbody>
          {rows.map((r, i) => {
            if (r.kind === 'gap') {
              return (
                <tr key={i} className="bg-surface-2 text-text-muted">
                  <td colSpan={3} className="px-3 py-0.5 text-center">{r.hidden} unchanged {r.hidden === 1 ? 'line' : 'lines'}</td>
                </tr>
              )
            }
            const look = LOOK[r.kind]
            return (
              <tr key={i} ref={el => { if (el) rowRefs.set(i, el); else rowRefs.delete(i) }} data-line={r.kind}
                data-current={i === current ? 'true' : undefined} className={`${look.row} ${i === current ? 'outline outline-1 outline-accent/40' : ''}`}>
                <td className="w-10 select-none px-2 text-right align-top text-text-muted">{r.newNo ?? r.oldNo}</td>
                <td className={`w-5 select-none text-center align-top ${look.tone}`}>
                  <span aria-hidden="true">{look.sign}</span>
                  <span className="sr-only">{look.word}</span>
                </td>
                <td className={`pr-3 text-text-primary ${wrap ? 'whitespace-pre-wrap break-words' : 'whitespace-pre'}`}>{r.text === '' ? ' ' : r.text}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </>
  )
}
