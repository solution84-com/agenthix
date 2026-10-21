import type { ElementType, ReactNode } from 'react'

export type PlaceCardState = 'needsYou' | 'running' | 'idle' | 'quiet'

export const PLACE_CARD_STATE_LABEL: Record<PlaceCardState, string> = {
  needsYou: 'Needs you',
  running: 'Running',
  idle: 'Idle',
  quiet: 'Quiet',
}

const STATE_TONE: Record<PlaceCardState, string> = {
  needsYou: 'text-warning',
  running: 'text-success',
  idle: 'text-text-muted',
  quiet: 'text-text-muted',
}

export interface PlaceCardProps {
  /** An agent's cover; a project has none. Shown across the top of the card on wide screens. */
  cover?: ReactNode
  /** The round avatar of an agent, or a project's avatar. */
  avatar: ReactNode
  name: string
  /** A line about it: an agent's role and handle, a project's description. */
  line?: string | null
  /** What is happening now, led by its state in the state's colour. */
  now: { state: PlaceCardState; detail?: string | null }
  /** Its numbers, in order. A fact given with `onSelect` is a link of its own: it does that, and does not open the card. */
  facts: Array<string | { text: string; onSelect: () => void }>
  /** The card's one action, e.g. "Talk to it →" or "Open →". */
  action: string
  /** When set, the action does this on its own (a click on it does not open the card); else it only labels the card. */
  onAction?: () => void
  /** Wraps the card, e.g. a router `Link`; a plain element by default. */
  as?: ElementType
  [wrapperProp: string]: unknown
}

/** The state that matters most, in its colour, then the detail: "Needs you · WEB-27 wants to run a command". */
export function PlaceCardNow({ state, detail }: { state: PlaceCardState; detail?: string | null }) {
  return (
    <span data-testid="place-card-now" data-state={state}>
      <span className={`font-semibold ${STATE_TONE[state]}`}>{PLACE_CARD_STATE_LABEL[state]}</span>
      {detail ? <span className="text-text-secondary"> · {detail}</span> : null}
    </span>
  )
}

/**
 * The one card of the Agents and Projects screens (every screen reviewed spec §3): its picture on top, name and a
 * line about it, what is happening now, its numbers, and one action. Below `md` the same item is a compact row —
 * avatar, then three single lines cut short and never wrapped.
 */
const factText = (f: PlaceCardProps['facts'][number]) => (typeof f === 'string' ? f : f.text)

function Fact({ fact }: { fact: PlaceCardProps['facts'][number] }) {
  if (typeof fact === 'string') return <span>{fact}</span>
  const select = () => fact.onSelect()
  return (
    <span
      role="link" tabIndex={0}
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); select() }}
      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); select() } }}
      className="rounded underline decoration-border underline-offset-2 hover:text-text-primary hover:decoration-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
    >
      {fact.text}
    </span>
  )
}

export function PlaceCard({ cover, avatar, name, line, now, facts, action, onAction, as: Wrapper = 'div', ...rest }: PlaceCardProps) {
  return (
    <Wrapper {...rest} className="group block min-w-0">
      <div
        data-testid="place-card"
        className="hidden md:flex h-full flex-col overflow-hidden rounded-2xl border border-border-subtle bg-surface-1 transition-colors group-hover:border-accent"
      >
        {cover !== undefined && <div className="relative h-24 shrink-0 overflow-hidden">{cover}</div>}
        <div className={`px-4 ${cover !== undefined ? '-mt-5' : 'pt-4'} relative`}>{avatar}</div>
        <div className="flex flex-1 flex-col gap-2 px-4 pb-4 pt-2">
          <div className="min-w-0">
            <div className="truncate text-h3 font-semibold text-text-primary">{name}</div>
            {line && <p className="mt-0.5 line-clamp-2 text-small text-text-muted">{line}</p>}
          </div>
          <div className="text-small"><PlaceCardNow {...now} /></div>
          <div className="mt-auto flex items-center justify-between gap-3 border-t border-border-subtle pt-2.5 text-micro text-text-muted">
            <span className="flex min-w-0 flex-wrap gap-x-3 gap-y-0.5">
              {facts.map((f) => <Fact key={factText(f)} fact={f} />)}
            </span>
            {onAction ? (
              <span
                role="button" tabIndex={0}
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); onAction() }}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); onAction() } }}
                className="shrink-0 rounded text-body font-medium text-accent hover:text-accent-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
              >
                {action}
              </span>
            ) : <span className="shrink-0 text-body font-medium text-accent">{action}</span>}
          </div>
        </div>
      </div>

      <div data-testid="place-card-row" className="flex items-center gap-3 rounded-lg px-1 py-2 ring-inset hover:ring-1 hover:ring-accent md:hidden">
        <span className="shrink-0">{avatar}</span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-body font-semibold text-text-primary">{name}</div>
          <div className="truncate text-small"><PlaceCardNow {...now} /></div>
          <div className="truncate text-small text-text-muted">{[line, ...facts.map(factText)].filter(Boolean).join(' · ')}</div>
        </div>
      </div>
    </Wrapper>
  )
}
