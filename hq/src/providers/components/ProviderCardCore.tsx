import type { ReactNode } from 'react'
import { AI_PROVIDER_VENDOR_INFO, type AiProviderSummary } from '@agenthix/core'
import { StateLine } from '../../auth/pages/parts/authUi'
import { runtimeLine } from '../../capabilities/runtimes'
import { STATE_SENTENCES } from './providerWords'
import { TypeChips } from './TypeChips'

export type ProviderCardProvider = Pick<AiProviderSummary, 'id' | 'name' | 'vendor' | 'credential' | 'types' | 'state' | 'stateDetail'>

export interface ProviderCardCoreProps {
  provider: ProviderCardProvider
  /** Words after the state, such as "Added by you." in setup, or since when on the AI page. */
  stateNote?: string
  /** The place's own buttons, beside the name: Remove in setup; Settings' tools on the AI page. */
  actions?: ReactNode
  /** What the place adds under the card's core: the key, what depends on it, its history. */
  children?: ReactNode
  /** The card's frame; setup's by default. */
  className?: string
  /** The line a notification linked to. */
  current?: boolean
}

/**
 * One provider, as setup and the AI page both draw it: its name, what it lets agents do, its state in words (with the
 * vendor's own message when it is not working), and which runtime agents run its models on.
 */
export function ProviderCardCore({ provider: p, stateNote, actions, children, className = 'rounded-xl border border-border px-3.5 py-2.5', current }: ProviderCardCoreProps) {
  const runs = runtimeLine(p)
  const works = p.state === 'works'
  const says = !works && p.stateDetail ? ` ${AI_PROVIDER_VENDOR_INFO[p.vendor].label} says: ${p.stateDetail}` : ''
  return (
    <li id={`provider-${p.id}`} aria-current={current ? 'true' : undefined} className={className}>
      <div className="flex items-start justify-between gap-2 max-sm:flex-col">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-body font-medium text-text-primary">{p.name}</span>
          <TypeChips types={p.types} />
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
      <StateLine tone={works ? 'ok' : 'warn'}>{STATE_SENTENCES[p.state]}{says}{stateNote ? ` ${stateNote}` : ''}</StateLine>
      {runs && (
        <p className="mt-1.5 text-small text-text-secondary">
          {runs.lead}{' '}
          {runs.runtimes.map((name, i) => (
            <span key={name}>{i > 0 && (i === runs.runtimes.length - 1 ? ' and ' : ', ')}<strong className="font-medium text-text-primary">{name}</strong></span>
          ))}
        </p>
      )}
      {children}
    </li>
  )
}
