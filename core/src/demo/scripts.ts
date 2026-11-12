/**
 * The demo's scripts (live demo spec, *The scripts: one set, keyed by agent*; adr-0186): what each sample agent's
 * conversation lead says and which tools it calls, and what each of its runs streams, writes and ends with. One data
 * set, `demo/` at the repository root, built into the hq and site images and read by both through `loadDemoScripts`.
 *
 * Folder layout (relative to `demoDataDir`):
 *
 *   agents/<handle>.json        a `DemoLeadScript` for the agent with that handle
 *   runs/<handle>/<id>.json     a `DemoRunScript`; `id` is the file's name
 *   voice/<clip>                the recorded clips that intents and voice lines name
 *
 * Nothing here knows hq's or the site's internals: tool names and inputs are opaque, and a run event is shaped as the
 * site's own run event of the same `type`, with a delay before it.
 */

export const DEMO_SCRIPT_FORMAT = 1

/** A recorded clip's file name in `voice/`, such as `writer-hello.mp3`. */
export type DemoVoiceClip = string

/** A tool call the lead makes, carried out by hq's real tool of that name. */
export type DemoLeadToolCall = {
  toolName: string
  /** The tool's input as hq's tool reads it; opaque here, but always a JSON object. */
  input: Record<string, unknown>
}

export type DemoIntent = {
  id: string
  /** Example messages a visitor might write, matched by word overlap (`matchDemoIntent`). */
  phrasings: string[]
  reply: string
  toolCalls: DemoLeadToolCall[]
  voiceClip: DemoVoiceClip | null
}

export type DemoSpokenLine = {
  text: string
  voiceClip: DemoVoiceClip | null
}

/**
 * The lead's own short lines, which close a turn after its tools have done their part, each spoken from its clip in the
 * demo voice. `refused` opens the sentence: the refusal's own words follow it in the thread, and only it is spoken.
 */
export type DemoClosingLines = {
  /** A run this conversation started has come back. */
  workCameBack: DemoSpokenLine
  /** The work the turn started is under way. */
  done: DemoSpokenLine
  /** What the turn tried was refused. */
  refused: DemoSpokenLine
  /** The work waits for a person's okay. */
  waiting: DemoSpokenLine
}

export const DEMO_CLOSING_LINES = ['workCameBack', 'done', 'refused', 'waiting'] as const satisfies readonly (keyof DemoClosingLines)[]

/** A line the visitor taps on the voice screen; the agent answers with the intent it names. */
export type DemoVoiceLine = {
  text: string
  intent: string
}

export type DemoLeadScript = {
  format: typeof DEMO_SCRIPT_FORMAT
  /** The agent's handle, as the seed names it; the same as the file's name. */
  agent: string
  intents: DemoIntent[]
  /** What the lead says to a message that matches no intent: that this is a demo, and what to try. */
  fallback: DemoSpokenLine
  /** The lead's own lines that close a turn (work came back, done, refused, waiting). */
  spoken: DemoClosingLines
  /** Shown above the composer in demo mode, so a visitor knows what the scripts answer. */
  suggestedPrompts: string[]
  voiceLines: DemoVoiceLine[]
  /** The agent's first spoken line in a voice conversation, saying it is a demo voice. */
  firstVoiceLine: DemoSpokenLine
}

/**
 * What a run script is for. A run takes the script of its task first, then of its task's type, then the agent's
 * default (`pickDemoRunScript`). Every agent with run scripts has exactly one default.
 */
export type DemoRunTarget =
  /** The task's key as the seed gives it, such as `WEB-3`. */
  | { task: string }
  /** The task type's name as the seed gives it, such as `Launch step`. */
  | { taskType: string }
  | { default: true }

/** One event of a run, shaped as the site's run event of the same `type`. */
export type DemoRunEventBody =
  | { type: 'text_delta'; textDelta: string }
  | { type: 'thinking'; thinking: string }
  | { type: 'tool_call'; toolUseId: string; toolName: string; toolInput: unknown }
  | { type: 'tool_result'; toolUseId: string; output: string }
  | { type: 'notice'; notice: string }

export const DEMO_RUN_EVENT_TYPES = ['text_delta', 'thinking', 'tool_call', 'tool_result', 'notice'] as const

/** An event and how long the run waits before it, from the event before (or the start). */
export type DemoRunEvent = DemoRunEventBody & { afterMs: number }

/** A file the run writes into its workspace: a relative path with no `..`, and its text. */
export type DemoRunFile = { path: string; content: string }

export type DemoRunEnd =
  | { status: 'completed' }
  | { status: 'failed'; error: string }
  /** Stopped by a run limit; the site records core's `runLimitReason` for it. */
  | { status: 'limit'; limit: 'time' | 'turns' }

export type DemoRunScript = {
  format: typeof DEMO_SCRIPT_FORMAT
  id: string
  for: DemoRunTarget
  events: DemoRunEvent[]
  files: DemoRunFile[]
  end: DemoRunEnd
}

export type DemoAgentScripts = {
  lead: DemoLeadScript
  /** In file-name order. */
  runs: DemoRunScript[]
}

/** The whole data set, by agent handle. */
export type DemoScripts = {
  agents: Record<string, DemoAgentScripts>
}

export const DEMO_SCRIPT_LIMITS = {
  agents: 20,
  intentsPerAgent: 40,
  phrasingsPerIntent: 30,
  toolCallsPerIntent: 5,
  suggestedPrompts: 8,
  voiceLines: 20,
  runsPerAgent: 40,
  eventsPerRun: 200,
  filesPerRun: 20,
  /** The longest wait before one event: a demo run must move. */
  afterMsMax: 10_000,
  idChars: 64,
  lineChars: 300,
  textChars: 8_000,
  fileChars: 64_000,
  pathChars: 200,
} as const

/**
 * The column a scripted task run that completes hands its task over to, as an agent hands work to a person to check:
 * the first column of the task's type whose name has "review" in it. The demo adds one of this name to a visitor's
 * space, whose Task type has none.
 */
export const DEMO_REVIEW_COLUMN = 'In review'
export const DEMO_REVIEW_COLUMN_NAME = /review/i
