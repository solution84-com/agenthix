import { useState } from 'react'
import { useAction, restoreLibraryAsset } from 'wasp/client/operations'
import { SMALL_BUTTON } from '../../components/Section'
import { messageOf } from '../../components/messageOf'
import type { RemovedTemplate } from './shelf'

const KIND_WORD = { agent: 'Agent template', team: 'Team template' } as const

/**
 * Agenthix's templates an administrator removed (board U3): HQ doesn't install them again when it starts, so this is
 * where one is put back, as it was, with its history.
 */
export function RemovedTemplates({ items }: { items: RemovedTemplate[] }) {
  const restore = useAction(restoreLibraryAsset)
  const [back, setBack] = useState<string[]>([])
  const [failed, setFailed] = useState<string | null>(null)
  const shown = items.filter(i => !back.includes(i.assetId))
  if (shown.length === 0 && back.length === 0) return null
  const putBack = (i: RemovedTemplate) => {
    setFailed(null)
    restore({ assetId: i.assetId }).then(() => setBack(b => [...b, i.assetId]), err => setFailed(messageOf(err)))
  }
  return (
    <section className="space-y-2" aria-label="Removed from the Library" data-testid="removed-templates">
      <h2 className="text-small font-semibold uppercase tracking-wide text-text-muted">Removed from the Library</h2>
      <p className="text-small text-text-secondary">HQ doesn't install these again when it starts. Putting one back brings it back as it was.</p>
      {back.length > 0 && <p role="status" className="text-small text-text-primary">Put back in the Library.</p>}
      <ul className="divide-y divide-border-subtle rounded-xl border border-border-subtle bg-surface-1">
        {shown.map(i => (
          <li key={i.assetId} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
            <p className="min-w-0 flex-1 basis-64 truncate">
              <span className="text-body font-medium text-text-primary">{i.title}</span>
              <span className="ml-2 text-small text-text-muted">{KIND_WORD[i.kind]} · {i.identity}</span>
            </p>
            <button type="button" className={SMALL_BUTTON} onClick={() => putBack(i)}>Put back</button>
          </li>
        ))}
      </ul>
      {failed && <p role="alert" className="text-small text-danger">{failed}</p>}
    </section>
  )
}
