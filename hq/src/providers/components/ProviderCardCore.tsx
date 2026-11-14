import type { ReactNode } from 'react'
import { AI_PROVIDER_VENDOR_INFO, type AiProviderSummary } from '@agenthix/core'
import { StateLine } from '../../auth/pages/parts/authUi'
import { runtimeLine } from '../../capabilities/runtimes'
import { STATE_SENTENCES } from './providerWords'

export type ProviderCardProvider = Pick<AiProviderSummary, 'id' | 'name' | 'vendor' | 'credential' | 'types' | 'state' | 'stateDetail'>

export interface ProviderCardCoreProps {
  provider: ProviderCardProvider
  /** Words after the state, such as "Added by you." in setup, or since when on the AI page. */
  stateNote?: string
  /** The place's own buttons, under the core: Remove in setup; Settings' tools on the AI page. */
  actions?: ReactNode
  /** What the place adds between the core and its buttons: the key, what depends on it. */
  children?: ReactNode
  /** What the place shows under its buttons, such as the history they opened. */
  after?: ReactNode
}

/**
 * One provider opened, as setup and the AI page both draw it under its line (`ProviderRow`): its state in words (with
 * the vendor's own message when it is not working), which runtime agents run its models on, then the place's own parts.
 */
export function ProviderCardCore({ provider: p, stateNote, actions, children, after }: ProviderCardCoreProps) {
  const runs = runtimeLine(p)
  const works = p.state === 'works'
  const says = !works && p.stateDetail ? ` ${AI_PROVIDER_VENDOR_INFO[p.vendor].label} says: ${p.stateDetail}` : ''
  return (
    <div>
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
      {actions && <div className="mt-3 flex flex-wrap items-center gap-2">{actions}</div>}
      {after}
    </div>
  )
}
