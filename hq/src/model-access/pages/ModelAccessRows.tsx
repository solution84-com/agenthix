import { useState } from 'react'
import { useAction, deleteModelCredential } from 'wasp/client/operations'
import { COMPATIBLE_ENDPOINT } from '../../shared/modelProviders'
import { REMOVE, useCredentialCall } from './modelAccessParts'
import type { SetAccess } from './useModelAccess'

const LINK = 'text-small font-medium text-accent hover:text-accent-hover cursor-pointer'

function Row({ item, onRemoved }: { item: SetAccess; onRemoved?: () => void }) {
  const remove = useAction(deleteModelCredential)
  const { busy, problem, run } = useCredentialCall()
  const [confirming, setConfirming] = useState(false)
  const { ownerType, ownerId } = item.owner
  const kind = item.id === 'subscription' ? 'SUBSCRIPTION' : 'API_KEY'
  const provider = item.id === 'subscription' ? 'anthropic' : item.id === COMPATIBLE_ENDPOINT ? COMPATIBLE_ENDPOINT : item.id
  return (
    <li className="text-small text-text-primary">
      <div className="flex items-start justify-between gap-3">
        <div>
          <span className="text-success">✓</span> <b className="font-medium">{item.label}</b> — {item.whose}
          <div className="text-text-muted">{item.line}</div>
          {item.idle && <div className="text-warning">Stored but not in use while the organisation has more than one person.</div>}
        </div>
        {!confirming && <button type="button" onClick={() => setConfirming(true)} aria-label={`Remove ${item.label}`} className={LINK}>Remove</button>}
      </div>
      {confirming && (
        <div role="group" aria-label={`Remove ${item.label}`} className="mt-2 rounded-lg border border-border px-3 py-2">
          <p>Remove {item.label}? Runs that use it stop until access is set again.</p>
          <div className="mt-2 flex gap-3">
            <button type="button" disabled={busy} onClick={() => void run(() => remove({ ownerType, ownerId, kind, provider })).then(ok => { if (ok) { setConfirming(false); onRemoved?.() } })} className={REMOVE}>Remove</button>
            <button type="button" onClick={() => setConfirming(false)} className={LINK}>Cancel</button>
          </div>
        </div>
      )}
      {problem && <p role="alert" className="mt-1 text-danger">{problem}</p>}
    </li>
  )
}

/** What model access is set, each with whose it is and what it reaches; Remove, confirmed in place, when `onRemoved` is given. */
export function ModelAccessRows({ items, onRemoved }: { items: SetAccess[]; onRemoved?: () => void }) {
  if (items.length === 0) return null
  return <ul className="mb-3 space-y-3">{items.map(i => (onRemoved ? <Row key={i.id} item={i} onRemoved={onRemoved} /> : <ReadRow key={i.id} item={i} />))}</ul>
}

function ReadRow({ item }: { item: SetAccess }) {
  return (
    <li className="text-small text-text-primary">
      <span className="text-success">✓</span> <b className="font-medium">{item.label}</b> — {item.whose}
      <div className="text-text-muted">{item.line}</div>
    </li>
  )
}
