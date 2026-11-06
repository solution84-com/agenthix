import { useState, type ReactNode } from 'react'
import { checksLine, type EditorCheck } from './editorChecks'

const MARK: Record<EditorCheck['level'], { sign: string; word: string; tone: string }> = {
  ok: { sign: '✓', word: 'Passes', tone: 'text-success' },
  warning: { sign: '!', word: 'Warning', tone: 'text-warning' },
  error: { sign: '✕', word: 'Problem', tone: 'text-danger' },
}

/**
 * The checks as one line at the editor's foot (board *The editor*), opened into the list: a sign and a word with each,
 * so no state is told by colour alone, and a problem's *Show it* opening its file where it is. `status` is the draft's
 * saving, beside them.
 */
export function ChecksPanel({ checks, status, onShow }: { checks: readonly EditorCheck[]; status?: ReactNode; onShow: (path: string) => void }) {
  const [open, setOpen] = useState(false)
  const failing = checks.some(c => c.level === 'error')
  return (
    <div className="shrink-0 border-t border-border-subtle bg-surface-1 px-4 py-1.5 text-small" data-testid="editor-checks">
      {open && (
        <ul className="mb-1.5 flex flex-col gap-1" aria-label="Checks">
          {checks.map((c, i) => (
            <li key={i} className="flex gap-2">
              <span className={`w-4 shrink-0 text-center font-mono font-bold ${MARK[c.level].tone}`} aria-hidden>{MARK[c.level].sign}</span>
              <span className="sr-only">{MARK[c.level].word}: </span>
              <span className="text-text-primary">{c.text}</span>
              {c.level === 'error' && c.path && (
                <button type="button" className="text-accent hover:underline" onClick={() => onShow(c.path!)}>Show it</button>
              )}
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-center gap-3">
        <button type="button" aria-expanded={open} onClick={() => setOpen(o => !o)}
          className={`min-w-0 truncate text-left hover:underline ${failing ? 'text-danger' : 'text-text-secondary'}`} data-testid="checks-line">
          {checksLine(checks)}
        </button>
        <span className="flex-1" />
        {status}
      </div>
    </div>
  )
}
