import type { EditorCheck } from './editorChecks'

const MARK: Record<EditorCheck['level'], { sign: string; word: string; tone: string }> = {
  ok: { sign: '✓', word: 'Passes', tone: 'text-success' },
  warning: { sign: '!', word: 'Warning', tone: 'text-warning' },
  error: { sign: '✕', word: 'Problem', tone: 'text-danger' },
}

/** Checks as the person edits (board U3b, E5): a sign and a word with each, so no state is told by colour alone. */
export function ChecksPanel({ checks }: { checks: readonly EditorCheck[] }) {
  return (
    <ul className="mt-3 flex flex-col gap-1 border-t border-border-subtle pt-3 text-small" aria-label="Checks" data-testid="editor-checks">
      {checks.map((c, i) => (
        <li key={i} className="flex gap-2">
          <span className={`w-4 shrink-0 text-center font-mono font-bold ${MARK[c.level].tone}`} aria-hidden>{MARK[c.level].sign}</span>
          <span className="sr-only">{MARK[c.level].word}: </span>
          <span className="text-text-primary">{c.text}</span>
        </li>
      ))}
    </ul>
  )
}
