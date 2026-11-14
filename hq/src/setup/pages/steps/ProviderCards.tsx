import { useEffect, useState } from 'react'
import { FOCUS_RING } from '@agenthix/ui/primitives'
import type { AiProviderSummary } from '@agenthix/core'
import { ImpactDialog } from '../../../providers/components/ImpactDialog'
import { ProviderCardCore } from '../../../providers/components/ProviderCardCore'
import { providerAnchor } from '../../../admin/aiPage'

const CARD = 'scroll-mt-4 rounded-xl border px-3.5 py-2.5'

/**
 * The organisation's providers as cards, each drawn by the core the AI page uses, keeping only Remove. "None yet" when
 * empty. `current` is the card What agents can do opened (Open its provider): it is scrolled to and marked.
 */
export function ProviderCards({ providers, onChanged, current = null }: { providers: AiProviderSummary[]; onChanged: () => void; current?: string | null }) {
  const [removing, setRemoving] = useState<AiProviderSummary | null>(null)
  useEffect(() => {
    if (current) document.getElementById(providerAnchor(current))?.scrollIntoView?.({ block: 'start', behavior: 'smooth' })
  }, [current])
  return (
    <section aria-label="Your providers" className="mb-3">
      <h2 className="mb-1.5 text-small font-medium text-text-muted">Your providers</h2>
      {providers.length === 0 && <p className="rounded-xl border border-dashed border-border-strong px-4 py-3 text-center text-small text-text-muted">None yet</p>}
      <ul className="space-y-2">
        {providers.map(p => (
          <ProviderCardCore key={p.id} provider={p} current={p.id === current}
            className={`${CARD} ${p.id === current ? 'border-warning' : 'border-border'}`} stateNote={p.state === 'works' && p.vendor !== 'cloud' ? 'Added by you.' : undefined}
            actions={p.vendor !== 'cloud' && (
              <button type="button" onClick={() => setRemoving(p)} aria-label={`Remove ${p.name}`} className={`rounded shrink-0 text-small font-medium text-link hover:underline ${FOCUS_RING}`}>Remove</button>
            )} />
        ))}
      </ul>
      {removing && <ImpactDialog kind="remove" adminNotice={false} provider={removing} onClose={() => { setRemoving(null); onChanged() }} />}
    </section>
  )
}
