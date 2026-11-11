import { useEffect, useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { Button, ROW_CHOSEN, ROW_ITEM } from '@agenthix/ui/primitives'
import { changedLabel } from '@agenthix/ui/projects'
import { refusalText } from '../../../../shared/refusal'
import { AuthorLine } from './AuthorLine'
import { ConfirmForGood } from './ConfirmForGood'
import { VersionChange } from './VersionChange'
import { useHistoryActions, useVersionRows } from './useKnowledgeHistory'
import type { KnowledgeOwner, VersionRow } from './types'
import { ShowAttention } from '@agenthix/ui/attention'

const rowKey = (r: VersionRow) => r.id ?? 'now'

/**
 * A page's history (U4): its versions newest first, each with when and who; beside them, what the chosen one changed,
 * with Restore this version (saved as a new version) and Delete this version permanently. `initialVersionId` opens
 * at a version (a kept version's id, or a page's version), as See change in a conversation does. `canChange` is whether the person may change the place's files.
 */
export function PageHistory({ owner, page, canChange, initialVersionId, onBack, now = new Date() }: {
  owner: KnowledgeOwner
  page: string
  canChange: boolean
  initialVersionId?: string
  onBack: () => void
  now?: Date
}) {
  const versions = useVersionRows(owner, page)
  const { restore, deleteForGood } = useHistoryActions()
  const [chosen, setChosen] = useState<string | undefined>(initialVersionId)
  const [asking, setAsking] = useState(false)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  useEffect(() => setChosen(initialVersionId), [initialVersionId])

  const rows = versions.data ?? []
  const index = Math.max(0, rows.findIndex(r => chosen !== undefined && (r.id === chosen || r.version === chosen)))
  const row = rows[index]
  const isNow = row !== undefined && row.id === undefined

  const run = async (act: () => Promise<{ outcome: string; message?: string } | void>, after?: () => void) => {
    setBusy(true)
    setProblem(null)
    try {
      const result = await act()
      if (result && result.outcome === 'refused') setProblem(result.message ?? 'That was refused. Nothing was changed.')
      else after?.()
    } catch (err) {
      setProblem(refusalText(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="bg-surface-1" data-testid="page-history">
      <div className="flex items-center gap-2 px-4 py-2.5">
        <button type="button" onClick={onBack} className="inline-flex items-center gap-1 text-small text-text-secondary hover:text-text-primary max-lg:min-h-10">
          <ArrowLeft size={14} aria-hidden /> {page}
        </button>
        <h2 className="text-h3 font-medium text-text-primary">History</h2>
      </div>
      <p className="px-4 pb-2 text-small text-text-muted">Each version is the whole page as it was. Kept 30 days, and the last 20 always.</p>
      {versions.error ? (
        <ShowAttention kind="alert" title="The history could not be read" text={versions.error.message} />
      ) : !versions.data ? (
        <p className="px-4 py-3 text-small text-text-muted">Loading…</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 px-4 pb-4 lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]">
          <ol aria-label="Versions" className="divide-y divide-border-subtle rounded-lg border border-border-subtle">
            {rows.map(r => (
              <li key={rowKey(r)}>
                <button
                  type="button"
                  aria-current={r === row}
                  onClick={() => { setChosen(r.id ?? r.version); setProblem(null) }}
                  className={`block w-full px-3 py-2 text-left text-small max-lg:min-h-10 ${r === row ? ROW_CHOSEN : ROW_ITEM}`}
                >
                  <span className="block font-medium text-text-primary">
                    {[r.at ? changedLabel(r.at, now) : '', r.id === undefined ? 'now' : '', r.created ? 'created' : ''].filter(Boolean).join(' · ') || 'Earlier'}
                  </span>
                  <span className="block break-words text-micro text-text-muted"><AuthorLine by={r.by} /></span>
                </button>
              </li>
            ))}
          </ol>
          {row && (
            <section aria-label="Changes in this version" className="min-w-0 space-y-3">
              <h3 className="text-small font-medium text-text-primary">Changes in this version</h3>
              <VersionChange owner={owner} page={page} row={row} before={rows[index + 1]} />
              {canChange && !isNow && (
                <div className="flex flex-wrap gap-2">
                  <Button disabled={busy} className="max-lg:min-h-10" onClick={() => run(() => restore({ owner, page, versionId: row.id! }), () => setChosen(undefined))}>
                    Restore this version
                  </Button>
                  <Button variant="danger" disabled={busy} className="max-lg:min-h-10" onClick={() => setAsking(true)}>
                    Delete this version permanently
                  </Button>
                </div>
              )}
              {problem && <ShowAttention kind="alert" text={problem} />}
            </section>
          )}
        </div>
      )}
      <ConfirmForGood
        open={asking}
        title="Delete this version permanently?"
        what="It is removed at once, with no way back. Use this for something pasted by mistake, such as a password. The other versions stay."
        busy={busy}
        onCancel={() => setAsking(false)}
        onConfirm={async () => {
          await run(() => deleteForGood({ owner, page, permanently: true, versionId: row?.id }), () => setChosen(undefined))
          setAsking(false)
        }}
      />
    </div>
  )
}
