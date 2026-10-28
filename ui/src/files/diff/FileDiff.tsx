import { useMemo } from 'react'
import { diffLines, diffStats, withContext, type DiffRow } from './diffLines'

export interface FileDiffProps {
  /** The version being compared with; null for an added file. */
  before: string | null
  /** The new version; null for a removed file. */
  after: string | null
  /** Unchanged lines kept around each change. */
  context?: number
}

const ROW: Record<'add' | 'del' | 'same', { sign: string; word: string; row: string; sign_: string }> = {
  add: { sign: '+', word: 'added', row: 'bg-success/10', sign_: 'text-success' },
  del: { sign: '−', word: 'removed', row: 'bg-danger/10', sign_: 'text-danger' },
  same: { sign: ' ', word: 'unchanged', row: '', sign_: 'text-text-muted' },
}

/**
 * One file's two versions in one column, as a git diff reads: old and new line numbers, then a sign and the line.
 * Added and removed lines carry a + or − and a token colour, never colour alone. Text is drawn as text, never as HTML.
 */
export function FileDiff({ before, after, context = 3 }: FileDiffProps) {
  const rows = useMemo<DiffRow[]>(() => withContext(diffLines(before ?? '', after ?? ''), context), [before, after, context])
  if (!rows.some(r => r.kind === 'add' || r.kind === 'del')) {
    return <p className="text-small text-text-secondary">No lines changed.</p>
  }
  return (
    <table className="w-full border-collapse font-mono text-small" aria-label="Changes">
      <tbody>
        {rows.map((r, i) => {
          if (r.kind === 'gap') {
            return (
              <tr key={i} className="bg-surface-2 text-text-muted">
                <td colSpan={4} className="px-3 py-0.5 text-center">
                  {r.hidden} unchanged {r.hidden === 1 ? 'line' : 'lines'}
                </td>
              </tr>
            )
          }
          const look = ROW[r.kind]
          return (
            <tr key={i} className={look.row} data-line={r.kind}>
              <td className="w-10 select-none px-2 text-right text-text-muted">{r.oldNo ?? ''}</td>
              <td className="w-10 select-none px-2 text-right text-text-muted">{r.newNo ?? ''}</td>
              <td className={`w-5 select-none text-center ${look.sign_}`}>
                <span aria-hidden="true">{look.sign}</span>
                <span className="sr-only">{look.word}</span>
              </td>
              <td className="whitespace-pre-wrap break-words pr-3 text-text-primary">{r.text === '' ? ' ' : r.text}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

export { diffStats }
