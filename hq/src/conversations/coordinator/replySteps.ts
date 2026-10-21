/**
 * A reply's steps (walkthrough findings 24 and 25): each model call that asked for tools is one, named by what it
 * looked at or did in a person's words — never a tool's name — and timed from asking the model to its tools being
 * back. The screens get them live; the reply's message keeps them with how long the reply worked, so the pill and
 * its steps survive a reload.
 */
import type { LeadToolCall, ToolCallOutcome } from '../contract'
import type { ReplyStepView, ReplyThinking } from '../../shared/conversations/protocol'
import { toolCallTitle } from '../tools/turnTools'
import { USED_MEMORY } from '../memory/usedMemory'
import { madeLabel } from './startedWords'

/** Names a step may show: a project's, by the id or key a call was given. */
export interface StepNames { project(idOrKey: string): Promise<string | null> }

type Args = Record<string, unknown>

const asArgs = (v: unknown): Args => (v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Args) : {})
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)
const quoted = (v: unknown, otherwise: string): string => (str(v) ? `"${str(v)}"` : otherwise)
/** A task as the person named it, when it was by its key ("WAL-2"); an id means nothing to them. */
const taskRef = (v: unknown, otherwise: string): string => {
  const s = str(v)
  return s && /^[A-Za-z][A-Za-z0-9]*-\d+$/.test(s) ? s.toUpperCase() : otherwise
}

/** What a call that only reads looked at; `place` is the project it was about, when that is known. */
const LOOKS: Record<string, (a: Args, r: Args, place: string | null) => string> = {
  get_org: () => 'Your organisation',
  list_agents: () => 'The agents',
  list_teams: () => 'The teams',
  list_projects: () => 'Your projects',
  list_boards: (_a, _r, p) => (p ? `${p}'s boards` : 'The boards'),
  get_board: (_a, r) => (str(r.name) ? `The ${str(r.name)} board` : 'A board'),
  list_tasks: (_a, _r, p) => (p ? `${p}'s tasks` : 'The tasks'),
  fetch_my_queued_tasks: () => 'The queued tasks',
  get_task_details: (a, r) => (str(r.title) ? `"${str(r.title)}"` : taskRef(a.taskId, 'A task')),
  list_active_runs: () => "What's running",
  list_products: () => 'The products',
  get_product: (_a, r) => str(r.name) ?? 'A product',
  list_presets: () => 'The agent presets',
  list_workforce_templates: () => 'The team templates',
  get_github_config: () => 'The GitHub settings',
  recall: () => 'What I remember',
}

/** What a call that changes something set out to do, and what it did once it worked. */
const CHANGES: Record<string, { ask: (a: Args) => string; done: (a: Args) => string }> = {
  start_work: { ask: a => `Start ${quoted(a.title, 'work')}`, done: a => `Started ${quoted(a.title, 'work')}` },
  run_task: { ask: a => `Run ${taskRef(a.taskId, 'a task')}`, done: a => `Started ${taskRef(a.taskId, 'a task')}` },
  create_task: { ask: a => `Create ${quoted(a.title, 'a task')}`, done: a => `Created ${quoted(a.title, 'a task')}` },
  update_task: { ask: a => `Update ${taskRef(a.taskId, 'a task')}`, done: a => `Updated ${taskRef(a.taskId, 'a task')}` },
  archive_task: { ask: a => `Archive ${taskRef(a.taskId, 'a task')}`, done: a => `Archived ${taskRef(a.taskId, 'a task')}` },
  delete_task: { ask: a => `Delete ${taskRef(a.taskId, 'a task')}`, done: a => `Deleted ${taskRef(a.taskId, 'a task')}` },
  add_comment: { ask: a => `Comment on ${taskRef(a.taskId, 'a task')}`, done: a => `Commented on ${taskRef(a.taskId, 'a task')}` },
  remember: { ask: a => `Remember ${quoted(a.title, 'something')}`, done: a => `Remembered ${quoted(a.title, 'something')}` },
  forget: { ask: () => 'Forget a memory', done: () => 'Forgot a memory' },
}

/** A refusal in a few words a person reads; its own words may name a tool or an id. */
export function whyInWords(reason: string): string {
  if (/not found|no (task|project|board|place)|does not exist|doesn't exist|no project with/i.test(reason)) return 'not found by that name'
  if (/approval|okay/i.test(reason)) return 'needs your okay'
  if (/stopped/i.test(reason)) return 'stopped'
  if (/arguments do not fit/i.test(reason)) return 'asked the wrong way'
  if (/not a member|forbidden|not allowed|outside|may only read|acts for no one|expired/i.test(reason)) return 'not allowed here'
  if (/not available/i.test(reason)) return 'not available here'
  return "didn't work"
}

/**
 * One call in a person's words. Without an outcome — the call still running — what it set out to do. `title` is
 * the work's own title when the call started work.
 */
export async function callLabel(call: LeadToolCall, outcome: ToolCallOutcome | null, names?: StepNames, title?: string): Promise<string> {
  const args = asArgs(call.input)
  const change = CHANGES[call.name]
  if (change) {
    if (!outcome || outcome.status === 'refused') return change.ask(args)
    if (outcome.status === 'waitingApproval') return `${change.ask(args)} — waiting for your okay`
    if (title && (call.name === 'start_work' || call.name === 'run_task' || outcome.status === 'accepted')) return `Started "${title}"`
    return change.done(args)
  }
  const look = LOOKS[call.name]
  if (!look) return title && outcome?.status === 'accepted' ? `Started "${title}"` : toolCallTitle(call.name)
  const worked = outcome?.status === 'done'
  const projectId = str(args.projectId)
  const place = worked && projectId && names ? await names.project(projectId).catch(() => null) : null
  return look(args, worked ? asArgs(outcome.result) : {}, place)
}

function joinWords(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? ''
  return `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`
}

/**
 * A call and what it gave. `title` is its operation's, when it has one. `made`: the call started a piece of work
 * (`started`, with `place`, where it runs) or set a task to start at a time (`set`, with `startsAt`).
 */
export interface StepCall {
  call: LeadToolCall
  outcome: ToolCallOutcome
  title?: string
  made?: 'started' | 'set'
  place?: string
  startsAt?: Date
}

/** A step's line: each call's words, a failed one with why; failed when nothing in it worked. */
export async function stepLine(done: StepCall[], names?: StepNames): Promise<{ label: string; failed: boolean }> {
  const shown = done.filter(d => d.call.name !== USED_MEMORY)
  const parts = await Promise.all(shown.map(async ({ call, outcome, title }) => {
    const label = await callLabel(call, outcome, names, title)
    return outcome.status === 'refused' ? `${label} — ${whyInWords(outcome.reason)}` : label
  }))
  return { label: joinWords(parts), failed: shown.length > 0 && shown.every(d => d.outcome.status === 'refused') }
}

/** Whether a step's calls are a lookup worth a line: a step that only says which memories it used is not. */
export function isLookup(calls: readonly LeadToolCall[]): boolean {
  return calls.some(c => c.name !== USED_MEMORY)
}

export interface StepLog {
  /** A step asked for tools: shown as running, with what it set out to do. */
  begin(calls: readonly LeadToolCall[], askedAt: Date): Promise<void>
  /** Its tools are back. */
  finish(done: StepCall[]): Promise<void>
  /** Model calls that asked for tools to look something up or start work, so far. */
  count(): number
  /** What the reply's message keeps: none for a reply that looked nothing up. */
  thinking(): ReplyThinking | undefined
}

/**
 * `from` is when the reply began to work; `emit` gets the steps so far and how long it has worked; `timezone` is
 * the person's, for when a task set for a time starts. Each piece of work a call started, or task it set for a
 * time, is a step of its own (`made`), so a screen counts them; the rest of the call's tools share one.
 */
export function createStepLog(input: {
  from: Date
  now: () => Date
  names?: StepNames
  timezone?: string | null
  emit: (steps: ReplyStepView[], elapsedMs: number) => void
}): StepLog {
  const steps: ReplyStepView[] = []
  let askedAt: Date | null = null
  let asked = 0
  const elapsed = () => input.now().getTime() - input.from.getTime()
  const emit = () => input.emit(steps.map(s => ({ ...s })), elapsed())

  return {
    async begin(calls, at) {
      askedAt = null
      if (!isLookup(calls)) return
      askedAt = at
      asked++
      const labels = await Promise.all(calls.filter(c => c.name !== USED_MEMORY).map(c => callLabel(c, null)))
      steps.push({ label: joinWords(labels) })
      emit()
    },
    async finish(done) {
      if (!askedAt) return
      const ms = input.now().getTime() - askedAt.getTime()
      steps.pop()
      const rest = done.filter(d => !d.made)
      if (isLookup(rest.map(d => d.call))) {
        const { label, failed } = await stepLine(rest, input.names)
        steps.push({ label, ms, ...(failed ? { failed: true } : {}) })
      }
      // The same call asked twice in one step is one piece of work.
      const made = new Map(done.filter(d => d.made && 'operationId' in d.outcome).map(d => [(d.outcome as { operationId: string }).operationId, d]))
      for (const d of made.values()) steps.push({ label: madeLabel(d, input.timezone ?? null), ms, made: d.made! })
      askedAt = null
      emit()
    },
    count: () => asked,
    thinking() {
      if (steps.length === 0) return undefined
      return { ms: elapsed(), steps: steps.map(s => ({ ...s, ms: s.ms ?? 0 })) }
    },
  }
}
