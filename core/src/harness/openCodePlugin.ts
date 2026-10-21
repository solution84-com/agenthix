/**
 * What passes between Agenthix's OpenCode plugin and the site (spec,
 * "Per-call authorization gate" item 3, §2, §3, §6).
 *
 * The plugin runs inside the OpenCode server, in the agent's container, and
 * reaches the site over HTTP at the agent-facing site address — the address
 * the conversation's platform tools already use. Two calls:
 *
 * - **The turn.** Before each model request (`chat.headers`), and whenever it
 *   needs to know a session's conversation, the plugin asks the site for the
 *   OpenCode session's current turn: the conversation's id (its processes' tag),
 *   the conversation's platform token, and the headers that carry the turn's
 *   provider key. Authenticated with the server's own key, which the site gives
 *   the server in its environment at start and never to any command. Between
 *   turns the answer is `turn: null`: the plugin sets no key, and its gate
 *   calls have no token. Nothing here is ever written to disk.
 * - **The gate.** Before every tool call (`tool.execute.before`), the plugin
 *   sends the call and waits for the decision. Authenticated with the
 *   conversation's token, so a decision is only ever the current turn's
 *   (adr-0082). On `refuse` the plugin throws `message` itself, with no prefix;
 *   OpenCode hands it to the model as that call's result. An `allow` may carry
 *   `args`: the call's arguments with each path the gate checked replaced by
 *   where it really leads (spec, gate item 6), which the plugin writes into
 *   the arguments OpenCode then runs the tool with.
 *
 * Both fail closed at the plugin: no answer within its deadline, an error, a
 * malformed answer or no turn is a refusal (`HARNESS_GATE_UNAVAILABLE`).
 *
 * The plugin is its own small package in the agent image and may import this
 * module; it holds types, constants and validators only.
 */

/** The gate call: POST, `Authorization: Bearer <conversation token>`, body `HarnessGateRequest`. */
export const HARNESS_GATE_PATH = '/api/v1/harness/gate'

/** The turn call: POST, `Authorization: Bearer <server key>`, body `HarnessTurnRequest`. */
export const HARNESS_TURN_PATH = '/api/v1/harness/turn'

/** The server's key for the turn call, in the OpenCode server's environment. Blanked for commands. */
export const HARNESS_SERVER_KEY_ENV = 'SITE_HARNESS_KEY'

/** The plugin's configuration (`OpenCodePluginConfig`, as JSON), in the OpenCode server's environment. */
export const OPENCODE_PLUGIN_CONFIG_ENV = 'SITE_PLUGIN_CONFIG'

/** What the model is told when the plugin cannot get a decision. */
export const HARNESS_GATE_UNAVAILABLE = 'The call could not be checked, so it was not run. Try again.'

export type HarnessGateRequest = {
  /** OpenCode's session id, as the hook was given it. */
  sessionId: string
  /** OpenCode's call id, recorded as the audit row's tool-use id. Opaque. */
  callId: string
  /** The tool's own id in OpenCode: `read`, `edit`, a plugin tool, `<connection>_<tool>` for a platform tool. */
  tool: string
  /** The call's full arguments, as the hook's `output.args` held them. */
  args: Record<string, unknown>
}

export type HarnessGateResponse =
  /**
   * Run the call. `args`, when present, replaces the call's arguments whole:
   * the plugin applies it to the object OpenCode will run the tool with. The
   * site sends it only when a checked path led somewhere other than as written.
   */
  | { decision: 'allow'; args?: Record<string, unknown> }
  | { decision: 'refuse'; message: string }

export type HarnessTurnRequest = {
  /** OpenCode's session id. */
  sessionId: string
}

export type HarnessTurn = {
  /** Our AgentSession id: the value the plugin's `shell.env` sets as the process tag. */
  conversationId: string
  /** The conversation's platform token, for the gate call. */
  conversationToken: string
  /**
   * Headers every model request of this turn carries (`chat.headers`): the
   * turn's relay token, which the site's model relay exchanges for the
   * provider's key (spec §6). Never a key.
   */
  modelHeaders: Record<string, string>
}

export type HarnessTurnResponse = { turn: HarnessTurn | null }

export type OpenCodePluginConfig = {
  /** The agent-facing site address, without a trailing slash. */
  siteUrl: string
  /** The plugin's own deadline on a gate decision; OpenCode sets none. Expiry is a refusal. */
  gateTimeoutMs: number
  /** The plugin's deadline on the turn call. */
  turnTimeoutMs: number
  /** Server environment variables given empty values in every command's environment (`shell.env`). */
  secretEnv: string[]
  /** Variables set in every command's environment (`shell.env`), such as `npm_config_offline: 'false'`. */
  commandEnv: Record<string, string>
}

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)
const isText = (v: unknown): v is string => typeof v === 'string' && v.length > 0
const isStringMap = (v: unknown): v is Record<string, string> =>
  isObj(v) && Object.values(v).every(x => typeof x === 'string')
const isDeadline = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v > 0

export function parseHarnessGateRequest(v: unknown): HarnessGateRequest | null {
  if (!isObj(v) || !isText(v.sessionId) || !isText(v.callId) || !isText(v.tool) || !isObj(v.args)) return null
  return { sessionId: v.sessionId, callId: v.callId, tool: v.tool, args: v.args }
}

/** Anything but a well-formed allow is a refusal: a malformed answer never lets a call run. */
export function parseHarnessGateResponse(v: unknown): HarnessGateResponse {
  if (isObj(v) && v.decision === 'allow') {
    if (v.args === undefined) return { decision: 'allow' }
    if (isObj(v.args)) return { decision: 'allow', args: v.args }
  }
  if (isObj(v) && v.decision === 'refuse' && isText(v.message)) return { decision: 'refuse', message: v.message }
  return { decision: 'refuse', message: HARNESS_GATE_UNAVAILABLE }
}

export function parseHarnessTurnRequest(v: unknown): HarnessTurnRequest | null {
  return isObj(v) && isText(v.sessionId) ? { sessionId: v.sessionId } : null
}

/** A malformed answer reads as no turn: the plugin then sets no key and gets no decision allowed. */
export function parseHarnessTurnResponse(v: unknown): HarnessTurnResponse {
  if (!isObj(v) || !isObj(v.turn)) return { turn: null }
  const t = v.turn
  if (!isText(t.conversationId) || !isText(t.conversationToken) || !isStringMap(t.modelHeaders)) return { turn: null }
  return { turn: { conversationId: t.conversationId, conversationToken: t.conversationToken, modelHeaders: t.modelHeaders } }
}

/** The plugin's configuration from its environment variable, or null when it is missing or malformed. */
export function parseOpenCodePluginConfig(json: string | undefined): OpenCodePluginConfig | null {
  if (!json) return null
  let v: unknown
  try { v = JSON.parse(json) } catch { return null }
  if (!isObj(v) || !isText(v.siteUrl) || !/^https?:\/\/[^/]+(\/.*[^/])?$/.test(v.siteUrl)) return null
  if (!isDeadline(v.gateTimeoutMs) || !isDeadline(v.turnTimeoutMs)) return null
  if (!Array.isArray(v.secretEnv) || !v.secretEnv.every(isText) || !isStringMap(v.commandEnv)) return null
  return {
    siteUrl: v.siteUrl,
    gateTimeoutMs: v.gateTimeoutMs,
    turnTimeoutMs: v.turnTimeoutMs,
    secretEnv: [...v.secretEnv],
    commandEnv: { ...v.commandEnv },
  }
}
