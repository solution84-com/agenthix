import { useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@agenthix/ui/primitives'
import { changedLabel } from '@agenthix/ui/projects'
import { RefusedAction } from '../../../../shared/components/RefusedAction'
import { refusalText } from '../../../../shared/refusal'
import { AuthorLine } from './AuthorLine'
import { ConfirmForGood } from './ConfirmForGood'
import { useDeletedPages, useHistoryActions } from './useKnowledgeHistory'
import type { DeletedRow, KnowledgeOwner } from './types'

/** "removed in 27 days" from now to `removeAfter`. */
export function removedIn(removeAfter: string, now: Date): string {
  const days = Math.ceil((new Date(removeAfter).getTime() - now.getTime()) / 86_400_000)
  if (days <= 0) return 'removed today'
  return days === 1 ? 'removed in 1 day' : `removed in ${days} days`
}

/** Recently deleted (U4): pages with who deleted them and when they go for good, with Restore and Delete permanently. */
export function RecentlyDeleted({ owner, canChange, onBack, now = new Date() }: {
  owner: KnowledgeOwner
  canChange: boolean
  /** The way back, where the screen has no navigation of its own around it. */
  onBack?: () => void
  now?: Date
}) {
  const deleted = useDeletedPages(owner)
  const { restore, deleteForGood } = useHistoryActions()
  const [asking, setAsking] = useState<DeletedRow | null>(null)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)

  const run = async (act: () => Promise<{ outcome: string; message?: string } | void>): Promise<boolean> => {
    setBusy(true)
    setProblem(null)
    try {
      const result = await act()
      if (result && result.outcome === 'refused') { setProblem(result.message ?? 'That was refused. Nothing was changed.'); return false }
      return true
    } catch (err) {
      setProblem(refusalText(err))
      return false
    } finally {
      setBusy(false)
    }
  }

  const rows = deleted.data ?? []
  return (
    <div className="bg-surface-1" data-testid="recently-deleted">
      {onBack && (
        <div className="flex items-center gap-2 px-4 py-2.5">
          <button type="button" onClick={onBack} className="inline-flex items-center gap-1 text-small text-text-secondary hover:text-text-primary max-lg:min-h-10">
            <ArrowLeft size={14} aria-hidden /> Knowledge
          </button>
          <h2 className="text-h3 font-semibold text-text-primary">Recently deleted</h2>
        </div>
      )}
      <p className="px-4 pb-2 text-small text-text-muted">Deleted pages are kept 30 days, then removed with their history.</p>
      <RefusedAction reason={problem} onDismiss={() => setProblem(null)} className="px-4 pb-2" />
      {deleted.error ? (
        <p role="status" className="px-4 py-3 text-small text-text-muted">{deleted.error.message}</p>
      ) : !deleted.data ? (
        <p className="px-4 py-3 text-small text-text-muted">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="px-4 py-3 text-small text-text-muted">Nothing was deleted lately.</p>
      ) : (
        <ul className="divide-y divide-border-subtle border-t border-border-subtle">
          {rows.map(r => (
            <li key={`${r.page}:${r.versionId}`} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5" data-testid="deleted-row">
              <div className="min-w-0 text-small">
                <p className="break-words font-medium text-text-primary">{r.page}</p>
                <p className="break-words text-micro text-text-muted">
                  deleted {changedLabel(r.deletedAt, now)} by <AuthorLine by={r.by} /> · {removedIn(r.removeAfter, now)}
                </p>
              </div>
              {canChange && (
                <div className="flex gap-2">
                  <Button size="sm" disabled={busy} className="max-lg:min-h-10" onClick={() => run(() => restore({ owner, page: r.page, versionId: r.versionId }))}>Restore</Button>
                  <Button size="sm" variant="danger" disabled={busy} className="max-lg:min-h-10" onClick={() => setAsking(r)}>Delete permanently</Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {deleted.truncated && (
        <p role="status" data-testid="deleted-truncated" className="px-4 py-3 text-small text-text-muted">
          More pages were deleted than are listed here. Only the newest {rows.length} are shown; the rest cannot be restored from this screen.
        </p>
      )}
      <p className="px-4 py-3 text-micro text-text-muted">Restore puts the page back at its path, or beside it if a page has taken the path since.</p>
      <ConfirmForGood
        open={asking !== null}
        title="Delete this page permanently?"
        what={`${asking?.page ?? 'The page'} and its history are removed at once, with no way back.`}
        busy={busy}
        onCancel={() => setAsking(null)}
        onConfirm={async () => {
          const page = asking
          if (!page) return
          await run(() => deleteForGood({ owner, page: page.page, permanently: true }))
          setAsking(null)
        }}
      />
    </div>
  )
}
