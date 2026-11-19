/**
 * The "Badges" button at the end of the Log's tab bar: a popover with who does what in a turn, as a short flow; the
 * light model's five actions; the fallback; Adaptive voice off; and each actor with its tags, one line each.
 */
import { useState } from 'react'
import { Info } from 'lucide-react'
import { FOCUS_RING, MenuHeading, PopSheet } from '@agenthix/ui/primitives'
import { ACTOR_HELP, ACTOR_TAGS, LIGHT_ACTIONS, tagHelp } from './badgeHelp'
import type { LogActor } from './logModel'

const FLOW = [
  'YOU speak; BACKCHANNEL may hum in a pause, by rule, with no model asked',
  "SOUND decides whether you've finished",
  'LIGHT is asked, and why (SOUND said finished; a long quiet after a “not yet”; the heavy model still working)',
  'LIGHT picks one of five actions, and may say a line',
  'the turn stays open, LIGHT closes it, or HEAVY answers',
]

const Heading = ({ children }: { children: string }) => <h3 className="mb-1 text-micro font-medium uppercase tracking-wide text-text-muted">{children}</h3>

export function BadgeKey({ tone }: { tone: Record<LogActor, string> }) {
  const [open, setOpen] = useState(false)
  return (
    <span className="relative ml-auto shrink-0">
      <button
        type="button" data-testid="badge-key" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(o => !o)}
        className={`inline-flex items-center gap-1 rounded-button px-2 py-1 text-micro text-text-secondary hover:bg-surface-hover hover:text-text-primary ${FOCUS_RING} max-sm:min-h-10`}
      >
        <Info size={12} aria-hidden />Badges
      </button>
      {open && (
        <PopSheet label="What the badges mean" onClose={() => setOpen(false)} width="sm:w-[32rem]">
          <MenuHeading label="What the badges mean" />
          <div data-testid="badge-key-list" className="flex max-h-[70vh] flex-col gap-3 overflow-y-auto px-2 pb-1 text-small text-text-secondary">
            <section aria-label="Who does what in a turn">
              <Heading>Who does what in a turn</Heading>
              <ol className="m-0 flex list-none flex-col gap-0.5 p-0">{FLOW.map((f, i) => <li key={f}>{i > 0 && '→ '}{f}</li>)}</ol>
            </section>
            <section aria-label="LIGHT's five actions">
              <Heading>LIGHT's five actions</Heading>
              <table className="w-full border-collapse text-micro">
                <thead><tr className="text-text-muted">{['Action', 'What it means', 'What you hear', 'The turn'].map(h => <th key={h} className="py-0.5 pr-2 text-left font-medium">{h}</th>)}</tr></thead>
                <tbody>
                  {LIGHT_ACTIONS.map(a => (
                    <tr key={a.action} className="border-t border-border-subtle align-top">
                      <td className="py-0.5 pr-2 font-mono text-text-primary">{a.action}</td><td className="py-0.5 pr-2">{a.means}</td>
                      <td className="py-0.5 pr-2">{a.hear}</td><td className="py-0.5">{a.turn}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
            <section aria-label="The fallback">
              <Heading>The fallback</Heading>
              <p className="m-0">If LIGHT doesn't answer within 2 s of SOUND saying you finished, SYSTEM hands over and plays a stored hold. A turn kept open after a "not yet" is closed the same way at 60 s.</p>
            </section>
            <section aria-label="Adaptive voice off">
              <Heading>Adaptive voice off</Heading>
              <p className="m-0">Plain voice: SOUND alone ends your turn, nothing is said before HEAVY's reply, and a card has no LIGHT steps.</p>
            </section>
            <section aria-label="Each actor and its tags">
              <Heading>Each actor and its tags</Heading>
              <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
                {ACTOR_TAGS.map(({ actor, tags }) => (
                  <li key={actor} data-actor={actor}>
                    <span className={`mr-1.5 inline-block w-16 rounded px-1.5 text-center text-micro font-medium tracking-wide ${tone[actor]}`}>{actor}</span>
                    <span>{ACTOR_HELP[actor]}</span>
                    <ul className="m-0 mt-0.5 flex list-none flex-col gap-0.5 pl-[4.75rem]">
                      {tags.map(t => <li key={t} className="text-micro"><span className="font-mono text-text-primary">{t}</span> {tagHelp(actor, t)}</li>)}
                    </ul>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </PopSheet>
      )}
    </span>
  )
}
