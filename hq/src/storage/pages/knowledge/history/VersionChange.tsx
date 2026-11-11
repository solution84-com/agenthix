import { diffPages, withContext } from './lineDiff'
import { useVersionText } from './useKnowledgeHistory'
import type { KnowledgeOwner, VersionRow } from './types'
import { ShowAttention } from '@agenthix/ui/attention'

const LINE = {
  add: 'bg-success/10 text-text-primary',
  del: 'bg-danger/10 text-text-primary',
  same: 'text-text-muted',
} as const
const MARK = { add: '+', del: '-', same: ' ' } as const

/** What one version changed: the fields of the front matter first, then the text line by line. */
export function VersionChange({ owner, page, row, before }: { owner: KnowledgeOwner; page: string; row: VersionRow; before: VersionRow | undefined }) {
  const after = useVersionText(owner, page, row.id)
  const earlier = useVersionText(owner, page, before?.id, Boolean(before))
  if (after.error) return <ShowAttention title="This version could not be read" text={after.error.message} />
  if (after.data === undefined || (before && earlier.data === undefined)) return <p className="text-small text-text-muted">Loading…</p>
  const { fields, lines } = diffPages(before ? earlier.data ?? '' : '', after.data)
  const shown = withContext(lines)
  return (
    <div data-testid="version-change" className="space-y-3">
      {fields.length > 0 && (
        <ul data-testid="field-changes" className="space-y-0.5 text-small">
          {fields.map(f => (
            <li key={f.name} className="break-words">
              <span className="font-mono text-text-primary">{f.name}: {f.after ?? '(removed)'}</span>
              {f.before !== undefined && f.after !== undefined && <span className="text-text-muted"> (was: {f.before})</span>}
              {f.before === undefined && <span className="text-text-muted"> (new)</span>}
            </li>
          ))}
        </ul>
      )}
      {lines.every(l => l.kind === 'same') ? (
        fields.length === 0 && <p className="text-small text-text-muted">No change to the text.</p>
      ) : (
        <pre className="overflow-x-auto rounded-lg border border-border-subtle bg-surface-1 py-1 text-small">
          {shown.map((l, i) => l === null
            ? <div key={i} className="px-3 text-text-muted" aria-hidden>…</div>
            : <div key={i} data-testid={`diff-${l.kind}`} className={`whitespace-pre-wrap break-words px-3 ${LINE[l.kind]}`}>{MARK[l.kind]} {l.text}</div>)}
        </pre>
      )}
    </div>
  )
}
