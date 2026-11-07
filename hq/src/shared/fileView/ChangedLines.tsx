import { FilesQuietLine } from '@agenthix/ui/projects'
import type { DiffRow } from '@agenthix/ui/files'

const LOOK = {
  add: { sign: '+', word: 'added', row: 'bg-success/10', tone: 'text-success' },
  del: { sign: '−', word: 'removed', row: 'bg-danger/10', tone: 'text-danger' },
  same: { sign: ' ', word: 'unchanged', row: '', tone: 'text-text-muted' },
} as const

/** The lines, each with its number (the old one for a removed line), a sign and the text, drawn as text only. */
export function ChangedLines({ rows, current, wrap, rowRefs, empty }: {
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
