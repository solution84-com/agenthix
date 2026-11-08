import type { ReactNode } from 'react'
import type { RunPageView } from '../runPageTypes'
import { clockText } from './runFormat'
import { limitText, tokensText } from './historyWords'

const KIND_WORDS = { task: 'a task’s run', reply: 'a reply in a conversation', routine: 'a routine’s run' } as const

/** A thin bar of how much of a limit a run has used; the words beside it say the same. */
function Meter({ used }: { used: number }) {
  const width = `${Math.max(0, Math.min(100, Math.round(used * 100)))}%`
  return (
    <span aria-hidden className="mt-1 block h-1 overflow-hidden rounded-sm bg-surface-3">
      <span className="block h-full rounded-sm bg-accent" style={{ width }} />
    </span>
  )
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-text-muted">{label}</dt>
      <dd className="min-w-0 break-words text-text-primary">{children}</dd>
    </>
  )
}

/**
 * What a run runs on and costs (RN1), the same on a phone: its kind, who started it and for whom, its model and
 * site, its time against its limit, its turn limit where turns count, and its tokens with an estimated cost.
 */
export function RunFacts({ view }: { view: RunPageView }) {
  const { detail, limits } = view
  const started = detail.startedAt ?? detail.createdAt
  return (
    <section aria-label="This run" className="rounded-xl border border-border bg-card px-4 py-3">
      <h3 className="text-h3 font-semibold text-text-primary">This run</h3>
      <dl className="mt-2 grid grid-cols-[6.5rem_minmax(0,1fr)] gap-x-3 gap-y-2 text-small">
        <Fact label="Kind">{KIND_WORDS[view.kind]}{detail.ref && <> · <span className="font-mono text-micro text-text-muted">{detail.ref}</span></>}</Fact>
        <Fact label="Started by">{view.startedBy}, {clockText(started)}</Fact>
        {view.onBehalfOf && <Fact label="On behalf of">{view.onBehalfOf}</Fact>}
        <Fact label="Model">{[detail.runtime, detail.model].filter(Boolean).join(' · ')}</Fact>
        {detail.site && <Fact label="Site">{detail.site}</Fact>}
        <Fact label="Time">
          {limits ? (
            <>{limitText(view.tookMs, limits.timeLimitMinutes)}<Meter used={(view.tookMs ?? 0) / (limits.timeLimitMinutes * 60_000)} /></>
          ) : 'no limit recorded'}
        </Fact>
        {limits && <Fact label="Turns">{limits.turnLimit === null ? 'no limit: a person started it' : `up to ${limits.turnLimit}`}</Fact>}
        <Fact label="Tokens">{tokensText(view.tokens, view.cost)}</Fact>
      </dl>
    </section>
  )
}
