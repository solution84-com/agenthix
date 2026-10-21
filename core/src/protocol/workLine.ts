/**
 * The work line (every screen reviewed, *What the agent did*): one run's steps
 * as plain lines in the order they happened — what it looked at, what it
 * changed, the commands it ran and its thinking, where each happened — and
 * the one folded line that names them ("Looked at 12 tasks and 3
 * conversations, created 3 tasks and changed 1 · thought for 9s").
 *
 * Built from the rows the transcript already has: a run's TOOL rows, its
 * THOUGHT rows and how it ended. Each step's exact input and output stay on
 * the run's page. Pure, so the screen can build the same line from a live
 * run's frames.
 */
import type { TranscriptRow, RunFailedDetail, RunStoppedDetail } from './transcript.js'
import { toolStep, type WorkStepKind, type WorkTarget } from './workSteps.js'

/** What `workLine` reads of each line: a transcript row's fields, or a live call's before its row is written. */
export type WorkLineEntry = Pick<TranscriptRow, 'role' | 'content' | 'toolName' | 'createdAt' | 'toolInput' | 'toolOutput'> &
  Partial<Pick<TranscriptRow, 'kind' | 'toolUseId' | 'thinkingDurationMs' | 'detail'>>

export type WorkStep = {
  kind: WorkStepKind
  verb: string
  /** Read after the verb: "AGX-41", "npm test", "5 files" for steps folded together. */
  text: string
  /** When it happened (the first, for folded steps). */
  at: string
  /** What the folded line counts it as, singular; null when uncounted. */
  noun: string | null
  /** How many of `noun` it covers. */
  count: number
  /** How many steps this line stands for: more than 1 when steps of the same kind in a row were folded. */
  steps: number
  /** Each folded step's own text, in order, for opening the line in place. */
  items: string[]
  /** For a change: what it changed, for its link. */
  target: WorkTarget | null
  toolUseIds: string[]
}

export type WorkLine = {
  steps: WorkStep[]
  /** The folded line; null when the run did nothing worth a line. */
  summary: string | null
  thoughtMs: number
  durationMs: number | null
}

const PLURALS: Record<string, string> = { search: 'searches', memory: 'memories', 'web page': 'web pages' }
export const plural = (noun: string, n: number) => (n === 1 ? noun : PLURALS[noun] ?? `${noun}s`)

function stepOf(e: WorkLineEntry): WorkStep | null {
  const base = { at: e.createdAt, noun: null, count: 1, steps: 1, items: [] as string[], target: null, toolUseIds: [] as string[] }
  if (e.role === 'TOOL' && e.toolName) {
    const s = toolStep(e.toolName, e.toolInput, e.toolOutput)
    return { ...base, ...s, items: [s.text], toolUseIds: e.toolUseId ? [e.toolUseId] : [] }
  }
  if (e.role !== 'SYSTEM') return null
  switch (e.kind) {
    case 'THOUGHT': return { ...base, kind: 'thought', verb: 'Thought', text: e.content }
    case 'APPROVAL_REQUESTED': return { ...base, kind: 'asked', verb: 'Asked', text: 'for approval' }
    case 'RUN_FAILED': return { ...base, kind: 'failed', verb: 'Failed', text: (e.detail as RunFailedDetail | null)?.reason ?? '' }
    case 'RUN_STOPPED': {
      const by = (e.detail as RunStoppedDetail | null)?.by
      return { ...base, kind: 'stopped', verb: 'Stopped', text: by ? `by ${by}` : '' }
    }
    default: return null
  }
}

/** Steps of the same kind in a row fold to one line ("Read 5 files"): only what the agent looked at, and never across a change. */
export function foldSteps(steps: WorkStep[]): WorkStep[] {
  const out: WorkStep[] = []
  for (const step of steps) {
    const last = out[out.length - 1]
    if (last && step.kind === 'looked' && last.kind === 'looked' && last.verb === step.verb && last.noun === step.noun && step.noun) {
      last.count += step.count
      last.steps += 1
      last.items.push(...step.items)
      last.toolUseIds.push(...step.toolUseIds)
      last.target = null
      last.text = `${last.count} ${plural(step.noun, last.count)}`
    } else {
      out.push({ ...step, items: [...step.items], toolUseIds: [...step.toolUseIds] })
    }
  }
  return out
}

type Part = { n: number; noun: string }
type Segment = { verb: string; kind: 'looked' | 'changed' | 'ran'; parts: Part[] }

function add(segments: Segment[], kind: Segment['kind'], verb: string, noun: string, n: number) {
  let seg = segments.find(s => s.kind === kind && s.verb === verb)
  if (!seg) segments.push((seg = { verb, kind, parts: [] }))
  const part = seg.parts.find(p => p.noun === noun)
  if (part) part.n += n
  else seg.parts.push({ n, noun })
}

function segmentsOf(steps: WorkStep[]): Segment[] {
  const looked: Segment[] = [], changed: Segment[] = [], ran: Segment[] = []
  for (const s of steps) {
    if (!s.noun) continue
    if (s.kind === 'looked') {
      const verb = s.noun === 'file' ? 'read' : s.noun === 'web page' ? 'fetched' : s.noun === 'search' ? 'ran' : 'looked at'
      add(looked, 'looked', verb, s.noun, s.count)
    } else if (s.kind === 'changed') {
      const verb = s.noun === 'file' ? 'edited' : s.verb.startsWith('Created') ? 'created' : 'changed'
      add(changed, 'changed', verb, s.noun, s.count)
    } else if (s.kind === 'ran' && s.noun === 'command') {
      add(ran, 'ran', 'ran', 'command', s.count)
    }
  }
  return [...looked, ...changed, ...ran]
}

function render(segments: Segment[]): string {
  let text = ''
  let lastNoun: string | null = null
  let lastKind: Segment['kind'] | null = null
  for (const seg of segments) {
    const single = seg.parts.length === 1 ? seg.parts[0] : null
    const elide = single !== null && single.noun === lastNoun
    const body = seg.parts.map(p => (elide ? `${p.n}` : `${p.n} ${plural(p.noun, p.n)}`)).join(' and ')
    const joiner = !text ? '' : elide && seg.kind === 'changed' && lastKind === 'changed' ? ' and ' : ', '
    text += `${joiner}${seg.verb} ${body}`
    lastNoun = seg.parts[seg.parts.length - 1].noun
    lastKind = seg.kind
  }
  return text
}

export function formatWorkDuration(ms: number): string {
  if (ms < 60_000) return `${Math.max(1, Math.round(ms / 1000))}s`
  return `${Math.round(ms / 60_000)} min`
}

/** The folded line's text: what was looked at, then changed, then run, and how long it took or thought. */
export function workSummary(steps: WorkStep[], thoughtMs: number, durationMs: number | null): string | null {
  const counted = render(segmentsOf(steps))
  const time = durationMs !== null && durationMs >= 60_000
    ? formatWorkDuration(durationMs)
    : thoughtMs >= 1000 ? `thought for ${formatWorkDuration(thoughtMs)}` : ''
  const text = counted && time ? `${counted} · ${time}` : counted || time
  if (!text) return steps.length > 0 ? `${steps.length} ${plural('step', steps.length)}` : null
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/**
 * One run's work line. `entries` are the run's rows in any order; `span` is
 * when the run started and ended, when known (else the first and last row).
 */
export function workLine(entries: WorkLineEntry[], span?: { startedAt?: string | null; endedAt?: string | null }): WorkLine {
  const ordered = [...entries].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))
  const raw = ordered.map(stepOf).filter((s): s is WorkStep => s !== null)
  const thoughtMs = ordered.reduce((ms, e) => ms + (e.role === 'ASSISTANT' ? e.thinkingDurationMs ?? 0 : 0), 0)
  const start = span?.startedAt ?? ordered[0]?.createdAt
  const end = span?.endedAt ?? ordered[ordered.length - 1]?.createdAt
  const durationMs = start && end ? Math.max(0, Date.parse(end) - Date.parse(start)) : null
  const counted = raw.filter(s => s.kind !== 'thought' && s.kind !== 'asked' && s.kind !== 'failed' && s.kind !== 'stopped')
  return { steps: foldSteps(raw), summary: workSummary(counted, thoughtMs, durationMs), thoughtMs, durationMs }
}

/** A long line opened: the first and last few steps, and how many are hidden between ("Show all 64 steps"). */
export function abridgeWorkLine(steps: WorkStep[], limit = 20, keep = 6): { head: WorkStep[]; hidden: number; tail: WorkStep[] } {
  if (steps.length <= limit) return { head: steps, hidden: 0, tail: [] }
  return { head: steps.slice(0, keep), hidden: steps.length - keep * 2, tail: steps.slice(-keep) }
}
