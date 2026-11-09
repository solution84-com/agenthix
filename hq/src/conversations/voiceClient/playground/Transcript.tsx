/**
 * The playground's conversation, as its server side keeps it, with the marks that change how a message reads (interrupted, withdrawn, an error).
 * A turn the lead held is one quiet line in its place: held, its reason, and how long after the turn was sent.
 */
import type { PlaygroundEntry } from '../../../shared/voicePlayground'
import type { DecisionRow } from './decisions'

/** Only what changes how the message reads; sent, spoken and timing marks are in the Log. */
export function entryMarks(e: PlaygroundEntry): string {
  const out: string[] = []
  if (e.interrupted) out.push('interrupted')
  if (e.withdrawn) out.push('withdrawn')
  return out.join(' · ')
}

const SOUND_WORDS = { hum: 'hum', word: 'listening word', invitation: 'invitation', phrase: 'phrase' } as const

/** How much of a reply's text may show: the part heard so far while it is being spoken, null for all of it. */
export type RevealLimit = (turnId: string | undefined, text: string) => number | null

export function Transcript({ entries, decisions = [], reveal }: { entries: readonly PlaygroundEntry[]; decisions?: readonly DecisionRow[]; reveal?: RevealLimit }) {
  if (entries.length === 0) return <p className="text-small text-text-muted">Nothing said yet.</p>
  const held = new Map(decisions.filter(d => d.held).map(d => [d.turnId, d]))
  return (
    <ol className="m-0 flex list-none flex-col gap-2 p-0" data-testid="playground-transcript">
      {entries.map(e => {
        const hold = e.role === 'agent' && e.turnId ? held.get(e.turnId) : undefined
        if (hold && !e.text) {
          return (
            <li key={e.id} data-role="held" className="self-center rounded-lg border border-dashed border-warning/40 bg-warning/10 px-2 py-0.5 text-micro text-text-secondary">
              held · “{hold.detail}” · {hold.gap}
            </li>
          )
        }
        if (e.sound) {
          return (
            <li key={e.id} data-role="agent" data-sound={e.sound} className="self-start rounded-lg bg-surface-2 px-3 py-1 text-small text-text-secondary">
              <span className="italic">{e.text}</span> <span className="text-micro text-text-muted">Agent · {SOUND_WORDS[e.sound]}</span>
            </li>
          )
        }
        const limit = e.role === 'agent' ? reveal?.(e.turnId, e.text) ?? null : null
        const shown = limit === null ? e.text : e.text.slice(0, limit)
        // A reply that was withdrawn, or stopped before a word was heard, leaves nothing: the record is what was heard.
        if (e.role === 'agent' && !shown && (e.withdrawn || e.interrupted || e.state === 'CANCELLED')) return null
        const marks = entryMarks(e)
        return (
          <li key={e.id} data-role={e.role} className={`max-w-[85%] rounded-lg px-3 py-2 ${e.role === 'person' ? 'self-end bg-accent-subtle' : 'self-start bg-surface-2'}`}>
            <div className="whitespace-pre-wrap text-body">{shown || '…'}</div>
            <div className="text-micro text-text-muted">{e.role === 'person' ? 'You' : 'Agent'}{marks && ` · ${marks}`}{e.error && ` · ${e.error}`}</div>
          </li>
        )
      })}
    </ol>
  )
}
