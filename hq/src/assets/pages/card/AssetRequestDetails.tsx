import { useQuery, getAssetRequestChange } from 'wasp/client/operations'
import { ChangesList, type FileChange } from '@agenthix/ui/files'
import { changeEffect, changeHeading, staleOf } from './assetRequestWords'
import type { AssetRequestChange as Change } from './assetRequestChange'

const asFileChanges = (changes: Extract<Change, { changes: unknown }>['changes']): FileChange[] =>
  changes.map(c => ({ path: c.path, status: c.status, before: c.before, after: c.after, binary: c.binary }))

/**
 * What an agent's request to publish, roll back, switch on or install would change, under its approval card in the work
 * bar (spec part 5, D31). Read from HQ's records when the person looks, so what they approve is what is shown; shown to
 * the person the agent asked and to no one else. For any other waiting request it draws nothing.
 */
export function AssetRequestDetails({ operationId }: { operationId: string }) {
  const { data } = useQuery(getAssetRequestChange, { operationId })
  if (!data || data.kind === 'none') return null
  const stale = staleOf(data)
  const note = data.kind === 'publish' ? data.note : data.kind === 'rollBack' ? data.reason : data.kind === 'install' ? data.note : null
  return (
    <div className="mt-2 space-y-1.5" data-testid="asset-request-change">
      <p className="break-words text-small font-medium text-text-primary">{changeHeading(data)}</p>
      {note && <p className="break-words text-micro text-text-secondary">Its note: “{note}”</p>}
      {(data.kind === 'publish' || data.kind === 'rollBack') && (
        <div className="max-h-72 overflow-y-auto"><ChangesList files={asFileChanges(data.changes)} /></div>
      )}
      <p className="text-micro text-text-muted">{changeEffect(data)}</p>
      {stale && <p role="alert" className="text-micro text-danger" data-testid="asset-request-stale">{stale}</p>}
    </div>
  )
}
