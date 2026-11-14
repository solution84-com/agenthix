import { useEffect, useState } from 'react'
import { FOCUS_RING } from '@agenthix/ui/primitives'
import type { AiProviderSummary } from '@agenthix/core'
import { ImpactDialog } from '../../../providers/components/ImpactDialog'
import { ProviderCardCore } from '../../../providers/components/ProviderCardCore'
import { ProviderRow } from '../../../providers/components/ProviderRow'
import { providerAnchor } from '../../../admin/aiPage'

/** The provider What agents can do opened (Open its provider); `n` changes with every press, so a second press opens it again. */
export type OpenedProvider = { id: string; n: number } | null

/**
 * The organisation's providers, one line each as on the AI page, opening in place (one at a time) into the state, the
 * runtime, the vendor's message and Remove. "None yet" when empty. `current` is the line What agents can do opened: it
 * is opened, scrolled to and marked.
 */
export function ProviderCards({ providers, onChanged, current = null }: { providers: AiProviderSummary[]; onChanged: () => void; current?: OpenedProvider }) {
  const [removing, setRemoving] = useState<AiProviderSummary | null>(null)
  const [expanded, setExpanded] = useState<string | null>(current?.id ?? null)
  useEffect(() => {
    if (!current) return
    setExpanded(current.id)
    document.getElementById(providerAnchor(current.id))?.scrollIntoView?.({ block: 'start', behavior: 'smooth' })
  }, [current])
  return (
    <section aria-label="Your providers" className="mb-3">
      <h2 className="mb-1.5 text-small font-medium text-text-muted">Your providers</h2>
      {providers.length === 0 && <p className="rounded-xl border border-dashed border-border-strong px-4 py-3 text-center text-small text-text-muted">None yet</p>}
      <ul className="space-y-2">
        {providers.map(p => (
          <ProviderRow key={p.id} provider={p} current={p.id === current?.id} open={expanded === p.id} frame={p.id === current?.id ? 'border-warning' : 'border-border'}
            onToggle={() => setExpanded(e => (e === p.id ? null : p.id))}>
            <ProviderCardCore provider={p} stateNote={p.state === 'works' && p.vendor !== 'cloud' ? 'Added by you.' : undefined}
              actions={p.vendor !== 'cloud' && (
                <button type="button" onClick={() => setRemoving(p)} aria-label={`Remove ${p.name}`} className={`rounded shrink-0 text-small font-medium text-link hover:underline ${FOCUS_RING}`}>Remove</button>
              )} />
          </ProviderRow>
        ))}
      </ul>
      {removing && <ImpactDialog kind="remove" adminNotice={false} provider={removing} onClose={() => { setRemoving(null); onChanged() }} />}
    </section>
  )
}
