/**
 * What a conversation shows, built from its record (every screen reviewed, *What a conversation shows*): the
 * rows hq sends, already in reading order, become the items the screen draws — a person's message, an agent's
 * reply with the run's work behind it, an approval, a marker where the runtime summarised, a change of model.
 */
import { modelsForRuntime, type RunFailedDetail, type RunStoppedDetail } from '@agenthix/core'
import type { TranscriptEntry } from './types'

export type ReplyItem = {
  type: 'reply'
  key: string
  runId: string | null
  /** The run's tool lines, thoughts and the rows that ended it, for its work line. */
  work: TranscriptEntry[]
  assistant: TranscriptEntry | null
  /** The failure or stop that ended the run. */
  ending: TranscriptEntry | null
  /** When the reply was written (or the run ended). */
  at: string | Date
}

export type ConversationItem =
  | { type: 'user'; key: string; entry: TranscriptEntry; waiting: boolean }
  | ReplyItem
  | { type: 'approval'; key: string; entry: TranscriptEntry }
  | { type: 'summarised'; key: string; entry: TranscriptEntry }
  | { type: 'model'; key: string; model: string; at: string | Date }

const isEnding = (e: TranscriptEntry) => e.role === 'SYSTEM' && (e.kind === 'RUN_FAILED' || e.kind === 'RUN_STOPPED')

function replyOf(rows: TranscriptEntry[], key: string): ReplyItem | null {
  const assistant = rows.find(r => r.role === 'ASSISTANT') ?? null
  const ending = rows.find(isEnding) ?? null
  const work = rows.filter(r => r.role === 'TOOL' || (r.role === 'SYSTEM' && r.kind !== 'CONTEXT_SUMMARISED'))
  const doing = work.some(r => r.kind !== 'APPROVAL_REQUESTED')
  if (!assistant && !ending && !doing) return null
  const last = assistant ?? ending ?? rows[rows.length - 1]
  return { type: 'reply', key, runId: rows[0]?.runId ?? null, work, assistant, ending, at: last.createdAt }
}

/** The record as items. `entries` are in reading order (hq has ordered them run by run). */
export function conversationItems(entries: TranscriptEntry[]): ConversationItem[] {
  const items: ConversationItem[] = []
  let group: TranscriptEntry[] = []
  let lastModel: string | null = null
  let lastUser = -1

  const flush = () => {
    if (group.length === 0) return
    const rows = group
    group = []
    const key = `reply-${rows[0].id}`
    const reply = replyOf(rows, key)
    for (const r of rows) if (r.kind === 'CONTEXT_SUMMARISED') items.push({ type: 'summarised', key: r.id, entry: r })
    if (reply) {
      const model = reply.assistant?.model ?? null
      if (model && lastModel && model !== lastModel) {
        // Before the message that began this run, where the change began to show.
        const own = lastUser >= 0 && (items[lastUser] as { entry: TranscriptEntry }).entry.runId === reply.runId
        const at0 = own ? lastUser : items.length
        const user = items[at0]
        items.splice(at0, 0, { type: 'model', key: `model-${reply.key}`, model, at: user?.type === 'user' ? user.entry.createdAt : reply.at })
      }
      if (model) lastModel = model
      items.push(reply)
    }
    for (const r of rows) if (r.kind === 'APPROVAL_REQUESTED') items.push({ type: 'approval', key: r.id, entry: r })
  }

  for (const e of entries) {
    // Answers to an approval were once stored as a message of the person's; the request now holds its answer.
    if (e.role === 'USER' && e.content.startsWith('__MANIFEST_')) continue
    if (e.role === 'USER') {
      flush()
      lastUser = items.length
      items.push({ type: 'user', key: e.id, entry: e, waiting: e.runStatus === 'PENDING' })
      continue
    }
    const prev = group[group.length - 1]
    if (prev && prev.runId && e.runId && prev.runId !== e.runId) flush()
    // A row written before runs were recorded: a reply closes what came before it.
    if (prev && !prev.runId && prev.role === 'ASSISTANT') flush()
    group.push(e)
  }
  flush()
  return items
}

/** The model's name as the pickers give it; an unknown id loses any provider prefix. */
export function modelName(model: string | null | undefined): string {
  if (!model) return ''
  const known = [...modelsForRuntime('claude-sdk'), ...modelsForRuntime('opencode')].find(m => m.value === model)
  return known?.label ?? model.split('/').pop() ?? model
}

const lowerFirst = (s: string) => (s ? s.charAt(0).toLowerCase() + s.slice(1) : s)
const trimStop = (s: string) => s.replace(/\.$/, '')

/** The failure's reason as the folded line says it: "the site lost its connection to the model". */
export function failedReason(entry: TranscriptEntry): string {
  return lowerFirst(trimStop((entry.detail as RunFailedDetail | null)?.reason ?? ''))
}

/** Who or what stopped a run: "by you", "by Avery", "for a newer message". */
export function stoppedBy(entry: TranscriptEntry): string {
  const d = entry.detail as RunStoppedDetail | null
  if (d?.by) return `by ${d.by}`
  switch (d?.cause) {
    case 'person': return 'by you'
    case 'new_message': return 'for a newer message'
    case 'time_limit': return 'at its time limit'
    case 'turn_limit': return 'at its turn limit'
    default: return ''
  }
}

/** The folded line's opening for a stopped run: "Paused for the scheduled upgrade of lab", or "Stopped by you". */
export function stoppedLine(entry: TranscriptEntry): string {
  const d = entry.detail as RunStoppedDetail | null
  if (d?.cause === 'paused') return d.by ? `Paused for ${d.by}` : 'Paused for a scheduled change'
  const by = stoppedBy(entry)
  return by ? `Stopped ${by}` : 'Stopped'
}

export { lowerFirst }

/** The run an item belongs to, when it has one. */
export function itemRunId(item: ConversationItem): string | null {
  switch (item.type) {
    case 'user':
    case 'approval':
      return item.entry.runId ?? null
    case 'reply':
      return item.runId
    default:
      return null
  }
}
