/**
 * What the voice playground's page and its server side say to each other (voice that stays in the conversation, plan
 * task 4b.2): a development-only page, tied to no agent and no conversation record. It is not part of the client
 * protocol (`@agenthix/core` client): no other app speaks it, and nothing outside a development build answers it.
 *
 * hq's own voice and conversation events pass as they are, each under the playground's prefix (`playgroundEvent`), so
 * the voice client runs unchanged and the app's own voice, on the same socket, never sees them.
 */
import type { SendConversationMessageArgs } from './conversations/protocol'

/** The one conversation each page talks in. */
export const PLAYGROUND_CONVERSATION_ID = 'voice-playground'
/** The one person the playground's voice belongs to: the server names it as the holder and the page speaks as it. */
export const PLAYGROUND_PERSON_ID = 'playground-person'

const PREFIX = 'voicePlayground:'

/** hq's voice or conversation event, as the playground carries it. */
export function playgroundEvent(name: string): string {
  return `${PREFIX}${name}`
}

export const VOICE_PLAYGROUND_SOCKET = {
  /** Page → server, acknowledged with `PlaygroundSendAck`: a message, as hq's message box sends it, and who answers. */
  send: `${PREFIX}send`,
  /** Page → server: forget the conversation; voice ends first. */
  reset: `${PREFIX}reset`,
  /** Server → page: one entry of the conversation, new or changed (matched by `id`). */
  entry: `${PREFIX}entry`,
  /** Server → page: the conversation was cleared. */
  cleared: `${PREFIX}cleared`,
  /** Server → page: what one model call used. Counted as a development call: it is in no usage report. */
  usage: `${PREFIX}usage`,
  /** Server → page: a line for the page's log. */
  log: `${PREFIX}log`,
  /** Server → page: what the lead decided for a turn (it held it, or started work), for the Decisions panel. */
  decision: `${PREFIX}decision`,
  /** Page → server, acknowledged with `ScenarioLibraryAck`: the fixed scenario library, to show and to run. */
  scenarios: `${PREFIX}scenarios`,
  /** Page → server, acknowledged with `ScenarioRunAck`: run every scenario on each model named (`ScenarioRunArgs`). */
  scenarioRun: `${PREFIX}scenarioRun`,
  /** Page → server: a stored clip began to play, so it is recorded as the agent's words (`PlaygroundPhrasePlayed`). */
  phrasePlayed: `${PREFIX}phrasePlayed`,
  /** Page → server: one line of what the page's voice client saw or played, written to the server's log (development only). */
  trace: `${PREFIX}trace`,
  /** Page → server: stop the run in progress, if any, and forget the last run's requests. */
  scenarioClear: `${PREFIX}scenarioClear`,
  /** Server → page: one scenario's result on one model (`ScenarioResult`). */
  scenarioResult: `${PREFIX}scenarioResult`,
  /** Server → page: the run ended (`ScenarioRunDone`). */
  scenarioDone: `${PREFIX}scenarioDone`,
  /** Page → server, acknowledged with `ScenarioSentAck`: exactly what one call of the last run sent. */
  scenarioSent: `${PREFIX}scenarioSent`,
} as const

/** What a page outside a development build, or a socket of nobody signed in, is told. */
export const PLAYGROUND_REFUSED = 'The voice playground exists only in development builds, for someone signed in.'

/** The fake lead's longest wait, so a page cannot leave a turn running for hours. */
export const FAKE_MAX_DELAY_MS = 120_000

/**
 * Who answers: the fake model, `fake` here (a set reply after a delay, for testing waits), or a model the
 * organisation has set up, named as the model picker names it (`<providerId>/<model>`). The server checks every
 * field, since it comes from the browser.
 */
export type PlaygroundLead =
  | { kind: 'fake'; delayMs: number; text?: string }
  | { kind: 'model'; model: string }

export type PlaygroundSendArgs = SendConversationMessageArgs & {
  lead: PlaygroundLead
  /** The playground's own switch for the person's Adaptive voice: passed to the voice turn block. */
  adaptiveVoice: boolean
}

export type PlaygroundSendAck = { ok: true; entryId: string } | { ok: false; error: string }

/** What a stored clip was for: a hum, an acknowledging word, an invitation to go on, or a filler phrase. */
export type PlaygroundSound = 'hum' | 'word' | 'invitation' | 'phrase'
export const PLAYGROUND_SOUNDS: readonly PlaygroundSound[] = ['hum', 'word', 'invitation', 'phrase']
export type PlaygroundPhrasePlayed = { conversationId: string; text: string; sound: PlaygroundSound }

export type PlaygroundEntry = {
  id: string
  role: 'person' | 'agent'
  text: string
  /** The person's message came from speech; the agent's reply was spoken while voice was on. */
  spoken?: boolean
  trailedOff?: boolean
  /** The agent's words were a stored clip the person heard, not a reply: what it was for. */
  sound?: PlaygroundSound
  /** The agent's reply's turn; for the person, the turn that answered them, once one has. */
  turnId?: string
  state?: 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED'
  /** The person spoke over it: only what they heard is kept. */
  interrupted?: boolean
  /** The person's next words joined the message this answered, or the lead held it: it was never heard. */
  withdrawn?: boolean
  error?: string
  /** When the entry was made and, for a reply, its first text: ms since the epoch, on the server's clock. */
  at: number
  firstTextAt?: number
}

export type PlaygroundDecision = { turnId: string; kind: 'held' | 'work'; text: string; at: number }
/** What one model call used; `turnId` ties it to the turn it answered. */
export type PlaygroundUsage = { model: string; inputTokens: number; outputTokens: number; turnId?: string }
export type PlaygroundLog = { level: 'info' | 'error'; text: string }

// ── The scenario runner (plan tasks 4c.3, 4c.4) ──

/**
 * What a scenario wants of the lead: `hold` calls keep_listening; `reply` answers in words; `quick` answers in words
 * with no tool; `task` calls start_work.
 */
export type ScenarioWanted = 'hold' | 'reply' | 'quick' | 'task'

/** One fixed scenario: the conversation so far, oldest first, then the person's last words, spoken. */
export type PlaygroundScenario = {
  id: string
  wanted: ScenarioWanted
  conversation: readonly (readonly ['person' | 'agent', string])[]
  last: string
}

export type ScenarioGroup = { id: ScenarioWanted; title: string; scenarios: readonly PlaygroundScenario[] }

export type ScenarioLibrary = {
  groups: readonly ScenarioGroup[]
  /** About how many tokens one model's run of every scenario sends, for the estimate before a run. */
  inputTokensPerRun: number
}

export type ScenarioLibraryAck = { ok: true; library: ScenarioLibrary } | { ok: false; error: string }

/** The most models one run compares, and how many calls run at once. */
export const SCENARIO_MAX_MODELS = 6
export const SCENARIO_CONCURRENCY = 4

export type ScenarioRunArgs = { models: string[]; adaptiveVoice: boolean }
export type ScenarioRunAck = { ok: true; runId: string; calls: number } | { ok: false; error: string }

export type ScenarioResult = {
  runId: string
  scenarioId: string
  model: string
  pass: boolean
  /** What it did, in a short word: held, answered, called start_work, called a tool, said nothing, failed. */
  did: string
  /** It held, and wrote words before the call (hq withdraws them). */
  wroteFirst: boolean
  text: string
  /** The reason a keep_listening call gave; null when it did not hold. */
  reason: string | null
  calls: string[]
  /** From the call to its first text or tool call; null when nothing came. */
  firstOutputMs: number | null
  inputTokens: number
  outputTokens: number
  error?: string
}

export type ScenarioRunDone = { runId: string; cancelled: boolean }

/** One call as it was handed to hq's model adapter, the key left out. */
export type SentRequest = {
  instructions: string[]
  messages: unknown[]
  tools: { name: string; description: string; input: unknown }[]
  settings: Record<string, unknown>
}

export type ScenarioSentArgs = { runId: string; scenarioId: string; model: string }
export type ScenarioSentAck = { ok: true; sent: SentRequest } | { ok: false; error: string }
