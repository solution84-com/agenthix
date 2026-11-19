/**
 * The playground's conversation, as its server side keeps it, with the marks that change how a message reads (interrupted, withdrawn, an error).
 * A turn the lead held is one quiet line in its place: held, its reason, and how long after the turn was sent.
 */
import type { PlaygroundEntry } from '../../../shared/voicePlayground'
import type { DecisionRow } from './decisions'
import { openLinesOf, revealedText, type Heading } from '../reveal'
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
/** The text a reply's bubble draws: under the light model, headed by the lines heard before hq stores them. */
export type ReplyText = (turnId: string | undefined, text: string) => string

/** How much of a reply's bubble was already on screen in the bubble of the lines said while its turn was open. */
export type ReplySettled = (turnId: string | undefined, text: string) => number

/** A message's words as the conversation draws them: a reply's newly revealed words ease in and fade in. */
function EntryText({ text, arriving, settled }: { text: string; arriving: boolean; settled?: number }) {
  return <div className="whitespace-pre-wrap text-body">{text ? <RevealText text={text} arriving={arriving} settled={settled} /> : '…'}</div>
}

function AgentBubble({ text, arriving, settled, marks = '', error, open }: { text: string; arriving: boolean; settled?: number; marks?: string; error?: string; open?: boolean }) {
  return (
    <li data-role="agent" data-turn data-open-lines={open || undefined} className="max-w-[85%] self-start rounded-lg bg-surface-2 px-3 py-2">
      <EntryText text={text} arriving={arriving} settled={settled} />
      <div className="text-micro text-text-muted">Agent{marks && ` · ${marks}`}{error && ` · ${error}`}</div>
    </li>
  )
}

/** The person's words in the bubble the conversation draws them in, the words being said as the message they become. */
function PersonEntry({ text, marks, error, live }: { text: string; marks: string; error?: string; live?: boolean }) {
  return (
    <li data-role="person" data-person-words data-live={live || undefined} className="flex max-w-[85%] flex-col items-end gap-1 self-end">
      <PersonWords>{text || '…'}</PersonWords>
      <div className="text-micro text-text-muted">You{marks && ` · ${marks}`}{error && ` · ${error}`}</div>
    </li>
  )
}

export function Transcript({ entries, decisions = [], reveal, textOf, settledOf, heading, live }: {
  entries: readonly PlaygroundEntry[]
  decisions?: readonly DecisionRow[]
  reveal?: RevealLimit
  textOf?: ReplyText
  settledOf?: ReplySettled
  /** Under the light model, the lines heard: those no reply's bubble draws yet are a bubble of their own. */
  heading?: Heading | null
  /** What the person is saying, before it is sent. */
  live?: LiveWords | null
}) {
  const open = openLinesOf(heading, turnId => entries.some(e => e.role === 'agent' && e.turnId === turnId), live?.text)
  if (entries.length === 0 && !live && !open) return <p className="text-small text-text-muted">Nothing said yet.</p>
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
        const text = e.role === 'agent' ? textOf?.(e.turnId, e.text) ?? e.text : e.text
        const limit = e.role === 'agent' ? reveal?.(e.turnId, text) ?? null : null
        const shown = revealedText(text, limit)
        // A reply that was withdrawn, or stopped before a word was heard, leaves nothing: the record is what was heard.
        if (e.role === 'agent' && !shown && (e.withdrawn || e.interrupted || e.state === 'CANCELLED')) return null
        const marks = entryMarks(e)
        if (e.role === 'person') return <PersonEntry key={e.id} text={e.text} marks={marks} error={e.error} />
        return <AgentBubble key={e.id} text={shown} arriving={limit !== null} settled={settledOf?.(e.turnId, text)} marks={marks} error={e.error} />
      })}
      {/* Lines said while the turn is open: after the words said before the first of them, before those said since. */}
      {open ? <>
        {open.before && <PersonEntry key="live" text={open.before} marks="" live />}
        <AgentBubble key="open-lines" text={open.lines} arriving open />
        {open.after && <PersonEntry key="live-after" text={open.after} marks="" live />}
      </> : live && <PersonEntry key="live" text={live.text} marks="" live />}
    </ol>
  )
}
