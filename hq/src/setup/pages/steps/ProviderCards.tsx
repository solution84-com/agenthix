import { useState } from 'react'
import { FOCUS_RING } from '@agenthix/ui/primitives'
import { AI_PROVIDER_VENDOR_INFO, type AiProviderState, type AiProviderSummary } from '@agenthix/core'
import { StateLine } from '../../../auth/pages/parts/authUi'
import { ImpactDialog } from '../../../providers/components/ImpactDialog'
import { TypeChips } from '../../../providers/components/TypeChips'

const NOT_WORKING_WORDS: Record<Exclude<AiProviderState, 'works'>, string> = {
  key_refused: 'The key was refused.',
  out_of_credit: 'Out of credit.',
  unreachable: 'Cannot be reached.',
  not_available: 'Not available yet.',
  disconnected: 'Disconnected.',
}

function State({ p }: { p: AiProviderSummary }) {
  if (p.state === 'works') return <StateLine tone="ok">Works.{p.vendor === 'cloud' ? '' : ' Added by you.'}</StateLine>
  return (
    <StateLine tone="warn">
      {NOT_WORKING_WORDS[p.state]}{p.stateDetail ? ` ${AI_PROVIDER_VENDOR_INFO[p.vendor].label} says: ${p.stateDetail}` : ''}
    </StateLine>
  )
}

/** The organisation's providers as cards: its name, what it covers, its state in words, and Remove. "None yet" when empty. */
export function ProviderCards({ providers, onChanged }: { providers: AiProviderSummary[]; onChanged: () => void }) {
  const [removing, setRemoving] = useState<AiProviderSummary | null>(null)
  return (
    <section aria-label="Your providers" className="mb-3">
      <h2 className="mb-1.5 text-small font-medium text-text-muted">Your providers</h2>
      {providers.length === 0 && <p className="rounded-xl border border-dashed border-border-strong px-4 py-3 text-center text-small text-text-muted">None yet</p>}
      <ul className="space-y-2">
        {providers.map(p => (
          <li key={p.id} className="rounded-xl border border-border px-3.5 py-2.5">
            <div className="flex items-start justify-between gap-2 max-sm:flex-col">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-body font-medium text-text-primary">{p.name}</span>
                <TypeChips types={p.types} />
              </div>
              {p.vendor !== 'cloud' && (
                <button type="button" onClick={() => setRemoving(p)} aria-label={`Remove ${p.name}`} className={`rounded shrink-0 text-small font-medium text-link hover:underline ${FOCUS_RING}`}>Remove</button>
              )}
            </div>
            <State p={p} />
          </li>
        ))}
      </ul>
      {removing && <ImpactDialog kind="remove" adminNotice={false} provider={removing} onClose={() => { setRemoving(null); onChanged() }} />}
    </section>
  )
}
