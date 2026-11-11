/**
 * The playground's conversation, as its server side keeps it, with the marks that change how a message reads (interrupted, withdrawn, an error).
 * A turn the lead held is one quiet line in its place: held, its reason, and how long after the turn was sent.
 */
import type { PlaygroundEntry } from '../../../shared/voicePlayground'
import type { DecisionRow } from './decisions'
import { revealedText } from '../reveal'
import { RevealText } from '../../../shared/components/reveal/RevealText'
import { PersonWords } from '../../components/PersonWords'
import type { LiveWords } from '../../hooks/useLiveWords'

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

/** A message's words as the conversation draws them: a reply's newly revealed words ease in and fade in. */
function EntryText({ text, arriving }: { text: string; arriving: boolean }) {
  return <div className="whitespace-pre-wrap text-body">{text ? <RevealText text={text} arriving={arriving} /> : '…'}</div>
}

/** The person's words in the bubble the conversation draws them in, the words being said as the message they become. */
function PersonEntry({ text, marks, error, live }: { text: string; marks: string; error?: string; live?: boolean }) {
  return (
    <li data-role="person" data-live={live || undefined} className="flex max-w-[85%] flex-col items-end gap-1 self-end">
      <PersonWords>{text || '…'}</PersonWords>
      <div className="text-micro text-text-muted">You{marks && ` · ${marks}`}{error && ` · ${error}`}</div>
    </li>
  )
}

export function Transcript({ entries, decisions = [], reveal, live }: {
  entries: readonly PlaygroundEntry[]
  decisions?: readonly DecisionRow[]
  reveal?: RevealLimit
  /** What the person is saying, before it is sent. */
  live?: LiveWords | null
}) {
  if (entries.length === 0 && !live) return <p className="text-small text-text-muted">Nothing said yet.</p>
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
        const shown = revealedText(e.text, limit)
        // A reply that was withdrawn, or stopped before a word was heard, leaves nothing: the record is what was heard.
        if (e.role === 'agent' && !shown && (e.withdrawn || e.interrupted || e.state === 'CANCELLED')) return null
        const marks = entryMarks(e)
        if (e.role === 'person') return <PersonEntry key={e.id} text={e.text} marks={marks} error={e.error} />
        return (
          <li key={e.id} data-role={e.role} className="max-w-[85%] self-start rounded-lg bg-surface-2 px-3 py-2">
            <EntryText text={shown} arriving={limit !== null} />
            <div className="text-micro text-text-muted">Agent{marks && ` · ${marks}`}{e.error && ` · ${e.error}`}</div>
          </li>
        )
      })}
      {live && <PersonEntry key="live" text={live.text} marks="" live />}
    </ol>
  )
}
