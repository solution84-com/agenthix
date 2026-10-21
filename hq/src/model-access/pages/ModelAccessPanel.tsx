import { useEffect, useRef, useState } from 'react'
import { ClaudeSignIn } from './ClaudeSignIn'
import { CompatibleEndpointBlock } from './CompatibleEndpointBlock'
import { ModelAccessRows } from './ModelAccessRows'
import { ProviderKeyBlock, type KeyProvider } from './ProviderKeyBlock'
import { CancelButton } from './modelAccessParts'
import { ACCESS_LINE, ACCESS_ORDER, menuLabel, useModelAccess, type AccessId, type Owner } from './useModelAccess'

const ADD = 'inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-1 px-4 py-2 text-body font-medium text-text-primary transition-colors hover:bg-surface-hover cursor-pointer'

function menuLine(id: AccessId) {
  return id === 'subscription' ? `${ACCESS_LINE[id]} · yours, for your own runs` : ACCESS_LINE[id]
}

function Menu({ ids, onChoose }: { ids: AccessId[]; onChoose: (id: AccessId) => void }) {
  const item = (id: AccessId) => (
    <button key={id} type="button" role="menuitem" onClick={() => onChoose(id)} className="block w-full rounded-lg px-3 py-2 text-left hover:bg-surface-hover cursor-pointer">
      <span className="block text-body font-medium text-text-primary">{menuLabel(id)}{id === 'subscription' && <span className="font-normal text-text-muted"> · recommended</span>}</span>
      <span className="block text-small text-text-muted">{menuLine(id)}</span>
    </button>
  )
  const other = ids.filter(i => i !== 'subscription' && i !== 'anthropic')
  return (
    <div role="menu" aria-label="Add model access" className="absolute left-0 top-full z-20 mt-1 w-[min(22rem,calc(100vw-2rem))] rounded-xl border border-border bg-surface-1 p-1.5 shadow-lg">
      {ids.filter(i => i === 'subscription' || i === 'anthropic').map(item)}
      {other.length > 0 && <div className="px-3 pb-1 pt-2 text-micro font-medium uppercase tracking-wide text-text-muted">Other providers</div>}
      {other.map(item)}
    </div>
  )
}

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [onClose])
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-scrim backdrop-blur-sm" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-label={title} className="relative w-full max-w-md rounded-t-2xl border border-border bg-surface-1 p-5 shadow-2xl sm:rounded-2xl">
        <h2 className="mb-3 text-h2 font-semibold text-text-primary">{title}</h2>
        {children}
      </div>
    </div>
  )
}

/**
 * Model access in one place: what is set, then one "Add model access" menu of
 * what is not. A Claude subscription is offered only when `subscriptionOwner`
 * is given (a person's own login); keys go to `keyOwner`. `only` narrows what
 * is offered and listed (onboarding offers an invited person just their own subscription).
 */
export function ModelAccessPanel({ keyOwner, subscriptionOwner, only }: { keyOwner: Owner; subscriptionOwner?: Owner; only?: AccessId[] }) {
  const all = useModelAccess(keyOwner, subscriptionOwner)
  const { loaded, refetch } = all
  const set = only ? all.set.filter(s => only.includes(s.id)) : all.set
  const [open, setOpen] = useState(false)
  const [adding, setAdding] = useState<AccessId | null>(null)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const h = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [open])

  const isSet = new Set(set.map(s => s.id))
  const offered = ACCESS_ORDER.filter(id => !isSet.has(id) && (id !== 'subscription' || subscriptionOwner) && (!only || only.includes(id)))
  const done = () => { setAdding(null); refetch() }
  const cancel = () => setAdding(null)
  return (
    <div>
      {!loaded ? <p className="mb-3 text-small text-text-muted">Checking…</p> : <ModelAccessRows items={set} onRemoved={refetch} />}
      {offered.length > 0 && (
        <div ref={box} className="relative inline-block">
          <button type="button" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(o => !o)} className={ADD}>Add model access <span aria-hidden>▾</span></button>
          {open && <Menu ids={offered} onChoose={id => { setOpen(false); setAdding(id) }} />}
        </div>
      )}
      {adding === 'subscription' && subscriptionOwner && (
        <Sheet title="Add a Claude subscription" onClose={cancel}>
          <ClaudeSignIn ownerType={subscriptionOwner.ownerType} ownerId={subscriptionOwner.ownerId} onSignedIn={done} />
          <div className="mt-3 flex justify-end"><CancelButton onClick={cancel} /></div>
        </Sheet>
      )}
      {adding === 'openai_compatible' && (
        <Sheet title="Add your own endpoint" onClose={cancel}>
          <CompatibleEndpointBlock {...keyOwner} onSaved={done} onCancel={cancel} />
        </Sheet>
      )}
      {adding && adding !== 'subscription' && adding !== 'openai_compatible' && (
        <Sheet title={`Add ${menuLabel(adding)}${adding === 'anthropic' ? '' : ' key'}`} onClose={cancel}>
          <ProviderKeyBlock {...keyOwner} provider={adding as KeyProvider} onSaved={done} onCancel={cancel} />
        </Sheet>
      )}
    </div>
  )
}
