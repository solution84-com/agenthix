/**
 * The playground's one Log (plan task 4c.2): every entry with its time of day and a badge. DECISION, what the lead
 * decided for a turn (from `decisionRows`) or for a scenario's line; HUM, WORD, INVITE or PHRASE, a sound the voice client played on its own
 * (a listening hum or word, an invitation to go on, the stored phrase), read from the voice runtime's events; CALL, a
 * model call and its tokens, or a scenario run; ERROR; NOTICE, the voice client's notice and the server's own lines.
 */
import type { VoiceEvent } from '../events'
import type { ListeningTier } from '../orchestration/listeningTiers'
import type { PlaygroundEntry, PlaygroundSound, PlaygroundUsage } from '../../../shared/voicePlayground'
import { callWords } from './usePlaygroundFeed'
import type { DecisionRow } from './decisions'

export type LogBadge = 'YOU' | 'AGENT' | 'DECISION' | 'HUM' | 'WORD' | 'INVITE' | 'PHRASE' | 'CALL' | 'ERROR' | 'NOTICE'

export type LogEntry = {
  id: string
  /** Ms since the epoch: what its time of day is shown from, and the order, newest first. */
  at: number
  badge: LogBadge
  title: string
  /** After the time on its second line, such as "+0.80 s" or "pass". */
  after?: string
  /** Also shown under these badges' filters: a turn's line carries its decision and its call. */
  also?: readonly LogBadge[]
}

export type LogFilter = 'all' | 'conversation' | 'decisions' | 'sounds' | 'calls' | 'errors'

export const LOG_FILTERS: { value: LogFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'conversation', label: 'Conversation' },
  { value: 'decisions', label: 'Decisions' },
  { value: 'sounds', label: 'Sounds' },
  { value: 'calls', label: 'Calls' },
  { value: 'errors', label: 'Errors' },
]

const SHOWS: Record<Exclude<LogFilter, 'all'>, readonly LogBadge[]> = { conversation: ['YOU', 'AGENT', 'HUM', 'WORD', 'INVITE', 'PHRASE'], decisions: ['DECISION'], sounds: ['HUM', 'WORD', 'INVITE', 'PHRASE'], calls: ['CALL'], errors: ['ERROR'] }

/** Every list joined, newest first, narrowed to the filter. */
export function logView(lists: readonly (readonly LogEntry[])[], filter: LogFilter): LogEntry[] {
  const all = lists.flat().sort((a, b) => b.at - a.at)
  return filter === 'all' ? all : all.filter(e => SHOWS[filter].includes(e.badge) || e.also?.some(b => SHOWS[filter].includes(b)))
}

export const timeOfDay = (at: number) => new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })

/**
 * The conversation as it went, in the order it happened with the sounds around it: what the person said or typed
 * (words they went on with joined in), and one line for each turn the agent answered, which folds what the agent said
 * (only what was heard of it if it was stopped), what the lead decided and the model call that made it. A held turn, or
 * a reply the person went on from, has no words: its line says what was decided. The agent's hums and words are the
 * sounds' own entries.
 */
export function messageEntries(
  entries: readonly PlaygroundEntry[], rows: readonly DecisionRow[] = [], calls: readonly PlaygroundUsage[] = [],
  labelOf: (model: string) => string = m => m,
): LogEntry[] {
  const out: LogEntry[] = []
  for (const e of entries) {
    if (e.role === 'person') out.push({ id: `you-${e.id}`, at: e.at, badge: 'YOU', title: `“${e.text}”`, after: e.spoken ? 'spoken' : 'typed' })
  }
  for (const row of rows) {
    const agent = entries.find(e => e.role === 'agent' && e.turnId === row.turnId && !e.sound)
    const call = calls.find(c => c.turnId === row.turnId)
    const words = agent?.text && !agent.withdrawn ? agent.text : ''
    const heard = words ? (agent!.interrupted ? 'interrupted, the part heard' : agent!.spoken ? 'spoken' : 'written') : ''
    const decided = words && row.outcome !== 'Plain reply' ? row.outcome : ''
    out.push({
      id: `turn-${row.turnId}`, at: row.at, badge: 'AGENT', also: call ? ['DECISION', 'CALL'] : ['DECISION'],
      title: words ? `“${words}”` : [row.outcome, row.detail && (row.held ? `“${row.detail}”` : row.detail)].filter(Boolean).join(' · '),
      after: [heard, decided, row.gap, call && callWords(labelOf(call.model), call)].filter(Boolean).join(' · ') || undefined,
    })
  }
  return out
}

export function decisionEntries(rows: readonly DecisionRow[]): LogEntry[] {
  return rows.map(r => ({
    id: `decision-${r.turnId}`, at: r.at, badge: 'DECISION',
    title: [r.outcome, r.detail && (r.held ? `“${r.detail}”` : r.detail)].filter(Boolean).join(' · '),
    ...(r.gap && { after: r.gap }),
  }))
}

function soundKind(tiers: readonly ListeningTier[] | null): PlaygroundSound {
  if (!tiers) return 'phrase'
  if (tiers.includes('invitation')) return 'invitation'
  if (tiers.includes('hum')) return 'hum'
  return 'word'
}

const SOUND_BADGE: Record<PlaygroundSound, LogBadge> = { hum: 'HUM', word: 'WORD', invitation: 'INVITE', phrase: 'PHRASE' }

/**
 * Reads the runtime's events into SOUND entries: one each time a stored clip starts to be heard (`phrase.at`), named
 * by what the listening family asked for just before it (`orchestration.phrase`), else the stored phrase; with how
 * far into the person's turn it came, counted from when they began speaking.
 */
export function createSoundReader(now: () => number = Date.now, onPlayed?: (played: { text: string; sound: PlaygroundSound }) => void) {
  let asked: ListeningTier[] | null = null
  let playing: string | null = null
  let turnFrom: number | null = null
  let n = 0
  return (event: VoiceEvent): LogEntry | null => {
    switch (event.kind) {
      case 'orchestration.floor':
        if (event.state === 'person-speaking' && turnFrom === null) turnFrom = event.t
        else if (event.state === 'agent-thinking' || event.state === 'agent-speaking') turnFrom = null
        return null
      case 'orchestration.phrase':
        asked = event.tiers
        return null
      case 'phrase.at': {
        if (!event.playing) { playing = null; return null }
        if (playing === event.text) return null
        playing = event.text
        const sound = soundKind(asked)
        asked = null
        onPlayed?.({ text: event.text, sound })
        const into = turnFrom === null ? undefined : `${Math.round((event.t - turnFrom) / 1000)} s into your turn`
        return { id: `sound-${n++}`, at: now(), badge: SOUND_BADGE[sound], title: `“${event.text}”`, ...(into && { after: into }) }
      }
      default:
        return null
    }
  }
}
