/**
 * A reply's steps (walkthrough findings 24 and 25): each model call that asked for tools is one, named by what it
 * looked at or did in a person's words — never a tool's name — and timed from asking the model to its tools being
 * back. Within it, each knowledge call is a line of its own, so none hides another (agent knowledge walkthrough,
 * F11). The screens get them live; the reply's message keeps them with how long the reply worked, so the pill and
 * its steps survive a reload.
 */
import type { LeadToolCall, ToolCallOutcome } from '../contract'
import type { ReplyStepView, ReplyThinking } from '../../shared/conversations/protocol'
import { isKnowledgeTool, knowledgeCallLabel, knowledgeOf } from './knowledgeSteps'
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

/** A board read answers its name under `board`; open_board answers it as `board` itself. */
function boardName(r: Args): string {
  const board = r.board
  const name = typeof board === 'string' ? str(board) : board && typeof board === 'object' ? str((board as Args).name) : null
  return name ? `the ${name} board` : 'a board'
}

/**
 * What a call that only reads looked at, as the object of "Looking at" and "Looked at"; `place` is the project it
 * was about, when that is known.
 */
const LOOKS: Record<string, (a: Args, r: Args, place: string | null) => string> = {
  get_org: () => 'your organisation',
  list_agents: () => 'the agents',
  list_teams: () => 'the teams',
  list_projects: () => 'your projects',
  list_boards: (_a, _r, p) => (p ? `${p}'s boards` : 'the boards'),
  get_board: (_a, r) => boardName(r),
  open_board: (_a, r) => boardName(r),
  list_tasks: (_a, _r, p) => (p ? `${p}'s tasks` : 'the tasks'),
  fetch_my_queued_tasks: () => 'the queued tasks',
  get_task_details: (a, r) => (str(r.title) ? `"${str(r.title)}"` : taskRef(a.taskId, 'a task')),
  list_active_runs: () => "what's running",
  list_products: () => 'the products',
  get_product: (_a, r) => str(r.name) ?? 'a product',
  list_presets: () => 'the agent presets',
  list_workforce_templates: () => 'the team templates',
  get_github_config: () => 'the GitHub settings',
  recall: () => 'what it remembers',
}

const tasksCount = (ids: unknown) => (Array.isArray(ids) ? `${ids.length} task${ids.length === 1 ? '' : 's'}` : 'tasks')

/** The words a refusal's object takes when the look named things ("the boards" → "them"). */
const plural = (look: string) => /^(the|your) .*s$|'s \w+s$/.test(look)

/** What a call that changes something is doing, what it set out to do, and what it did once it worked. */
const CHANGES: Record<string, { doing: (a: Args) => string; ask: (a: Args) => string; done: (a: Args) => string }> = {
  start_work: { doing: a => (str(a.title) ? `Starting work · ${quoted(a.title, '')}` : 'Starting work'), ask: a => `Start ${quoted(a.title, 'work')}`, done: a => `Started ${quoted(a.title, 'work')}` },
  run_task: { doing: a => `Starting ${taskRef(a.taskId, 'a task')}`, ask: a => `Run ${taskRef(a.taskId, 'a task')}`, done: a => `Started ${taskRef(a.taskId, 'a task')}` },
  create_task: { doing: a => (str(a.title) ? `Creating a task · ${quoted(a.title, '')}` : 'Creating a task'), ask: a => `Create ${quoted(a.title, 'a task')}`, done: a => `Created ${quoted(a.title, 'a task')}` },
  update_task: { doing: a => `Updating ${taskRef(a.taskId, 'a task')}`, ask: a => `Update ${taskRef(a.taskId, 'a task')}`, done: a => `Updated ${taskRef(a.taskId, 'a task')}` },
  change_tasks: {
    doing: a => `Changing ${tasksCount(a.taskIds)}`, ask: a => `Change ${tasksCount(a.taskIds)}`, done: a => `Changed ${tasksCount(a.taskIds)}`,
  },
  archive_task: { doing: a => `Archiving ${taskRef(a.taskId, 'a task')}`, ask: a => `Archive ${taskRef(a.taskId, 'a task')}`, done: a => `Archived ${taskRef(a.taskId, 'a task')}` },
  delete_task: { doing: a => `Deleting ${taskRef(a.taskId, 'a task')}`, ask: a => `Delete ${taskRef(a.taskId, 'a task')}`, done: a => `Deleted ${taskRef(a.taskId, 'a task')}` },
  add_comment: { doing: a => `Commenting on ${taskRef(a.taskId, 'a task')}`, ask: a => `Comment on ${taskRef(a.taskId, 'a task')}`, done: a => `Commented on ${taskRef(a.taskId, 'a task')}` },
  remember: { doing: a => `Remembering ${quoted(a.title, 'something')}`, ask: a => `Remember ${quoted(a.title, 'something')}`, done: a => `Remembered ${quoted(a.title, 'something')}` },
  forget: { doing: () => 'Forgetting a memory', ask: () => 'Forget a memory', done: () => 'Forgot a memory' },
}

/** A refusal as the clause after "Couldn't …:", in words a person reads; its own words may name a tool or an id. */
export function whyInWords(reason: string): string {
  if (/not found|no (task|project|board|place)|does not exist|doesn't exist|no project with/i.test(reason)) return 'nothing has that name'
  if (/approval|okay/i.test(reason)) return 'it needs your okay'
  if (/stopped/i.test(reason)) return 'it was stopped'
  if (/arguments do not fit/i.test(reason)) return 'the agent asked for it the wrong way'
  if (/not a member|forbidden|not allowed|outside|may only read|acts for no one|expired/i.test(reason)) return 'the agent may not do that here'
  if (/not available/i.test(reason)) return "it isn't available here"
  return "it didn't work"
}

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1)

/** One call's words: `look` is what a call that only reads looked at, so a step can join several into one sentence. */
type Words = { text: string; look?: string }

async function callWords(call: LeadToolCall, outcome: ToolCallOutcome | null, names?: StepNames, title?: string): Promise<Words> {
  const args = asArgs(call.input)
  const refused = outcome?.status === 'refused' ? whyInWords(outcome.reason) : null
  const knowledge = knowledgeCallLabel(call.name, args, outcome)
  if (knowledge !== null) return { text: refused ? `Couldn't ${lowerFirst(knowledge)}: ${refused}` : knowledge }
  const change = CHANGES[call.name]
  if (change) {
    if (!outcome) return { text: change.doing(args) }
    if (refused) return { text: `Couldn't ${lowerFirst(change.ask(args))}: ${refused}` }
    if (outcome.status === 'waitingApproval') return { text: `${change.ask(args)} — waiting for your okay` }
    if (title && (call.name === 'start_work' || call.name === 'run_task' || outcome.status === 'accepted')) return { text: `Started "${title}"` }
    return { text: change.done(args) }
  }
  const look = LOOKS[call.name]
  if (!look) {
    if (!outcome) return { text: 'Working' }
    if (refused) return { text: `Couldn't ${lowerFirst(toolCallTitle(call.name))}: ${refused}` }
    return { text: title && outcome.status === 'accepted' ? `Started "${title}"` : toolCallTitle(call.name) }
  }
  const worked = outcome?.status === 'done'
  const projectId = str(args.projectId)
  const place = worked && projectId && names ? await names.project(projectId).catch(() => null) : null
  const what = look(args, worked ? asArgs(outcome.result) : {}, place)
  if (!outcome) return { text: `Looking at ${what}` }
  if (refused) return { text: `Couldn't look at ${what}: ${refused.replace(/for it/, plural(what) ? 'for them' : 'for it')}` }
  return { text: `Looked at ${what}`, look: what }
}

/**
 * One call in a person's words. Without an outcome (the call still running) what it is doing, in -ing words:
 * the live line above the message box says it. `title` is the work's own title when the call started work.
 */
export async function callLabel(call: LeadToolCall, outcome: ToolCallOutcome | null, names?: StepNames, title?: string): Promise<string> {
  return (await callWords(call, outcome, names, title)).text
}

/** What a step is doing while its tools run: its first call's words, and how many more it runs ("and 2 more"). */
export async function doingLabel(calls: readonly LeadToolCall[]): Promise<string> {
  const shown = calls.filter(c => c.name !== USED_MEMORY)
  if (shown.length === 0) return 'Working'
  const first = await callLabel(shown[0]!, null)
  return shown.length > 1 ? `${first} and ${shown.length - 1} more` : first
}

function joinWords(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? ''
  return `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`
}

/** A step's calls as one sentence: what it looked at together, where the first look was, then each other call. */
function sentence(words: Words[]): string {
  const looks = words.filter(w => w.look !== undefined).map(w => w.look!)
  const phrases: string[] = []
  let looked = false
  for (const w of words) {
    if (w.look === undefined) phrases.push(w.text)
    else if (!looked) { looked = true; phrases.push(`Looked at ${joinWords(looks)}`) }
  }
  const [first, ...rest] = phrases
  if (!first) return ''
  if (rest.length === 0) return first
  const tail = rest.map(lowerFirst)
  return `${[first, ...tail.slice(0, -1)].join(', ')}, and ${tail.at(-1)}`
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

/** A step's line: its calls in one sentence, a refused one with why; failed when nothing in it worked. */
export async function stepLine(done: StepCall[], names?: StepNames): Promise<{ label: string; failed: boolean }> {
  const shown = done.filter(d => d.call.name !== USED_MEMORY)
  const words = await Promise.all(shown.map(({ call, outcome, title }) => callWords(call, outcome, names, title)))
  return { label: sentence(words), failed: shown.length > 0 && shown.every(d => d.outcome.status === 'refused') }
}

/** Whether a step's calls are a lookup worth a line: a step that only says which memories it used is not. */
export function isLookup(calls: readonly LeadToolCall[]): boolean {
  return calls.some(c => c.name !== USED_MEMORY)
}

/**
 * A step's calls as its lines: each knowledge call alone, since a screen draws one from what it did in place of the
 * words; the rest together, where the first of them was asked.
 */
function linesOf(calls: StepCall[]): StepCall[][] {
  const lines: StepCall[][] = []
  let others: StepCall[] | null = null
  for (const d of calls) {
    if (isKnowledgeTool(d.call.name)) lines.push([d])
    else if (others) others.push(d)
    else lines.push((others = [d]))
  }
  return lines
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
      steps.push({ label: await doingLabel(calls) })
      emit()
    },
    async finish(done) {
      if (!askedAt) return
      const ms = input.now().getTime() - askedAt.getTime()
      steps.pop()
      for (const lines of linesOf(done.filter(d => !d.made && d.call.name !== USED_MEMORY))) {
        const { label, failed } = await stepLine(lines, input.names)
        const knowledge = knowledgeOf(lines.map(d => d.outcome))
        steps.push({ label, ms, ...(failed ? { failed: true } : {}), ...(knowledge.length ? { knowledge } : {}) })
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
