import type { ReactNode } from 'react'
import type { ApprovalItem } from '@agenthix/core'
import { RequestCard, type RequestCardAnswer, type RequestCardState } from './RequestCard'

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1)

function joined(parts: string[]): string {
  return parts.length <= 1 ? parts.join('') : `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`
}

/** What a run's request asks, as the end of "Writer asks to …": "fetch a web page and run one command". */
export function requestPhrase(items: ApprovalItem[]): string {
  const tools = [...new Set(items.filter(i => !i.command).map(i => lowerFirst(i.does)))]
  const commands = items.filter(i => i.command).length
  const parts = commands === 0 ? tools : [...tools, commands === 1 ? 'run one command' : `run ${commands} commands`]
  return parts.length > 0 ? joined(parts) : 'go on'
}

/** A run's request for more than its agent may do on its own, as the one request card: each item whole, never folded. */
export function ManifestRequestCard({ agentName, items, summary, state, answer, waitingFor, error, footer }: {
  agentName: string
  /** The run's own words about what it is doing, when it gave any. */
  summary?: ReactNode
  items: ApprovalItem[]
  state: RequestCardState
  answer?: Omit<RequestCardAnswer, 'scope'>
  waitingFor?: string
  error?: string | null
  footer?: ReactNode
}) {
  const asks = state.kind === 'waiting' ? 'asks' : 'asked'
  return (
    <RequestCard
      heading={`${agentName} ${asks} to ${requestPhrase(items)}`}
      state={state}
      answer={answer && { ...answer, scope: 'Only this, for the next run' }}
      waitingFor={waitingFor}
      error={error}
      footer={footer}
    >
      {summary}
      <ul className="space-y-1">
        {items.map((item, i) => (
          <li key={i} className="break-words">
            {item.command ? (
              <>Run <code className="whitespace-pre-wrap break-all font-mono text-micro text-text-primary">{item.does}</code><span className="text-text-muted"> · exactly as shown</span></>
            ) : (
              <><span className="font-medium text-text-primary">{item.does}</span>{item.why && <span className="text-text-muted"> · {item.why}</span>}</>
            )}
          </li>
        ))}
      </ul>
    </RequestCard>
  )
}
