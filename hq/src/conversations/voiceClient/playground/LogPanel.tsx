/**
 * The Log tab: its filter chips in one row (the key to the badges sits in the tab bar), then one card per turn, newest
 * first, each with its steps in time order (`logTurns.ts`); steps that belong to no turn in a small group of their
 * own. A filter hides steps, and a card only when none is left in it. The backchannel's near misses (pauses with no hum)
 * are folded under a count on their card, and the hum service's answers under one line of them, each shown on a press.
 */
import { useState } from 'react'
import { FilterTabs } from '@agenthix/ui'
import { FOCUS_RING } from '@agenthix/ui/primitives'
import { tagHelp, ACTOR_HELP } from './badgeHelp'
import { RULES } from './logRules'
import { LOG_FILTERS, exactTime, secs, shows, timeOfDay, type CardStep, type LogActor, type LogCard, type LogFilter } from './logModel'
import type { LogView } from './logTurns'
import { serviceLine } from './serviceLine'

// The tone only repeats the badge's word.
export const BADGE: Record<LogActor, string> = {
  YOU: 'bg-selected text-text-primary',
  SOUND: 'bg-surface-3 text-text-primary',
  LIGHT: 'bg-chip text-text-primary',
  HEAVY: 'bg-surface-3 text-text-secondary',
  SYSTEM: 'bg-warning/15 text-warning',
  BACKCHANNEL: 'bg-chip text-text-secondary',
  PACE: 'bg-surface-3 text-text-secondary',
  VOICE: 'bg-chip text-text-secondary',
  TONE: 'bg-selected text-text-secondary',
}

/** The newest cards shown. */
export const SHOWN = 100

const attrsOf = (s: CardStep) => Object.fromEntries(Object.entries(s.attrs ?? {}).map(([k, v]) => [`data-${k}`, v]))

function Step({ step }: { step: CardStep }) {
  return (
    <li
      data-testid="log-row" data-badge={step.actor} data-tag={step.tag} {...attrsOf(step)}
      {...(step.ruleBroken && { 'data-rule-broken': String(step.ruleBroken) })}
      className="grid grid-cols-[3.25rem_minmax(0,1fr)] gap-2 text-small"
    >
      <time title={exactTime(step.at)} className="pt-px text-right font-mono text-micro text-text-muted">{secs(step.rel)}</time>
      <div className="min-w-0">
        <span title={ACTOR_HELP[step.actor]} className={`mr-1 inline-block rounded px-1.5 align-[1px] text-micro font-medium tracking-wide ${BADGE[step.actor]}`}>{step.actor}</span>
        <span title={tagHelp(step.actor, step.tag)} className={`mr-1.5 inline-block rounded-full border border-border px-1.5 align-[1px] font-mono text-micro ${step.error ? 'text-danger' : 'text-text-secondary'}`}>{step.tag}</span>
        {step.ruleBroken && (
          <span title={RULES[step.ruleBroken]} className="mr-1.5 inline-block rounded bg-danger/15 px-1.5 align-[1px] text-micro font-medium text-danger">should not happen</span>
        )}
        <span className={`break-words ${step.error ? 'text-danger' : 'text-text-primary'}`}>{step.title}</span>
        {step.why && <small data-testid="log-why" className="block text-micro text-text-muted">why: {step.why}</small>}
        {(step.detail || step.ruleBroken) && (
          <small className="block text-micro text-text-muted">{[step.detail, step.ruleBroken && `Rule: ${RULES[step.ruleBroken]}`].filter(Boolean).join(' · ')}</small>
        )}
      </div>
    </li>
  )
}

function Card({ card, steps }: { card: LogCard; steps: CardStep[] }) {
  const [unfolded, setUnfolded] = useState(false)
  const [answersShown, setAnswersShown] = useState(false)
  const misses = steps.filter(s => s.nearMiss).length
  const service = serviceLine(steps)
  const shown = steps.filter(s => (unfolded || !s.nearMiss) && (answersShown || !s.service))
  return (
    <li data-testid="log-turn" className="shrink-0 overflow-hidden rounded-md border border-border bg-card">
      <header className="bg-surface-2 px-2 py-1.5 text-small">
        <span className="break-words text-text-primary">You: “{card.message}”</span>
        <span className="text-text-muted"> · {timeOfDay(card.zero)}</span>
        {card.reasonOn && (
          <span data-testid="log-reason-on" title="The light model gave its reason on these calls, which makes them slower: the timings here are not production's." className="ml-1.5 inline-block rounded border border-border px-1.5 align-[1px] text-micro text-text-secondary">reason on</span>
        )}
        <small data-testid="log-turn-outcome" className="block text-micro text-text-secondary">{[card.outcome, ...card.timings].join(' · ')}</small>
        {misses > 0 && (
          <button
            type="button" data-testid="log-near-misses" aria-expanded={unfolded} onClick={() => setUnfolded(u => !u)}
            title="Pauses in this turn with no hum, each with the one rule that held it back"
            className={`mt-0.5 rounded px-1 text-micro text-text-muted hover:bg-surface-hover hover:text-text-secondary ${FOCUS_RING}`}
          >
            {misses} near {misses === 1 ? 'miss' : 'misses'}
          </button>
        )}
        {service && (
          <button
            type="button" data-testid="log-hum-service" aria-expanded={answersShown} onClick={() => setAnswersShown(u => !u)}
            title="The hum service's answers in this turn: the kinds and tones over time, and each call's speed"
            className={`mt-0.5 block rounded px-1 text-left text-micro text-text-muted hover:bg-surface-hover hover:text-text-secondary ${FOCUS_RING}`}
          >
            {service}
          </button>
        )}
      </header>
      {shown.length > 0 && <ol className="m-0 flex list-none flex-col gap-1.5 px-2 py-1.5">{shown.map(s => <Step key={s.id} step={s} />)}</ol>}
    </li>
  )
}

export function LogPanel({ view }: { view: LogView }) {
  const [filter, setFilter] = useState<LogFilter>('all')
  const cards = view.cards.map(card => ({ card, steps: card.steps.filter(s => shows(filter, s)) })).filter(c => c.steps.length > 0)
  // A near miss outside any turn is a pause in no telling: not shown.
  const loose = view.loose.filter(s => shows(filter, s) && !s.nearMiss && !s.service)
  const empty = cards.length === 0 && loose.length === 0
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div data-testid="log-filters" className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-border-subtle px-3 py-1.5">
        <FilterTabs label="Show in the log" tabs={LOG_FILTERS} value={filter} onChange={setFilter} />
        <span className="text-micro text-text-muted">{cards.length > SHOWN ? `Showing the newest ${SHOWN} turns` : 'newest turn first'}</span>
      </div>
      <ol className="m-0 flex min-h-0 flex-1 list-none flex-col gap-2 overflow-y-auto p-3" data-testid="playground-log">
        {empty && <li className="text-small text-text-muted">Nothing yet. Each turn shows here as a card: who did what, and when.</li>}
        {cards.slice(0, SHOWN).map(({ card, steps }) => <Card key={card.id} card={card} steps={steps} />)}
        {loose.length > 0 && (
          <li data-testid="log-loose" className="shrink-0 rounded-md border border-dashed border-border px-2 py-1.5">
            <h3 className="mb-1 text-micro font-medium uppercase tracking-wide text-text-muted">Not in a turn</h3>
            <ol className="m-0 flex list-none flex-col gap-1.5 p-0">{loose.map(s => <Step key={s.id} step={s} />)}</ol>
          </li>
        )}
      </ol>
    </div>
  )
}
