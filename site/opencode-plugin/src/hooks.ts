/**
 * The plugin's hooks on every call and every command (spec, "Per-call
 * authorization gate" items 3 and 5, §3, §6).
 *
 * - `tool.execute.before` asks the site about every tool call — built-in,
 *   plugin and platform tools alike — and throws the site's steering text for a
 *   refused one. OpenCode ends only that call and hands the model the message
 *   verbatim. An allow may carry the call's arguments in the site's checked
 *   form, which replace the model's. It fails closed: no turn, no answer within
 *   the plugin's deadline, an error or a malformed answer is a refusal.
 * - `shell.env` gives every command its conversation's tag, blanks the
 *   server's secrets, sets what the configuration says commands get, and lets
 *   them read the conversation's staged skills. A command with no turn to tag
 *   it is refused.
 * - `chat.headers` puts the turn's relay token on each model request of the
 *   session, which the site's model relay exchanges for the provider's key.
 *   Between turns it adds nothing.
 */
import {
  CONVERSATION_PROCESS_TAG,
  HARNESS_GATE_UNAVAILABLE,
  HARNESS_SERVER_KEY_ENV,
  openCodeSkillsContainerDir,
  type OpenCodePluginConfig,
} from '@agenthix/core'
import type { Hooks } from '@opencode-ai/plugin'
import type { SiteClient } from './site'


/** Blanked in every command's environment whatever the configuration lists. */
const ALWAYS_SECRET = ['OPENCODE_SERVER_PASSWORD', HARNESS_SERVER_KEY_ENV]

export const NO_TURN_FOR_COMMAND = 'This command was not run: it has no turn to belong to.'

type GateHook = NonNullable<Hooks['tool.execute.before']>
type ShellEnvHook = NonNullable<Hooks['shell.env']>
type HeadersHook = NonNullable<Hooks['chat.headers']>

/** Replaces the contents of the arguments object in place: OpenCode runs the tool with this same object. */
export function replaceArgs(target: Record<string, unknown>, next: Record<string, unknown>): void {
  for (const key of Object.keys(target)) delete target[key]
  Object.assign(target, next)
}

export function gateHook(site: SiteClient | null): GateHook {
  return async (input, output) => {
    if (!site) throw new Error(HARNESS_GATE_UNAVAILABLE)
    const turn = await site.turn(input.sessionID)
    if (!turn) throw new Error(HARNESS_GATE_UNAVAILABLE)
    const args = isRecord(output.args) ? output.args : {}
    const decision = await site.decide(turn.conversationToken, {
      sessionId: input.sessionID,
      callId: input.callID,
      tool: input.tool,
      args,
    })
    if (decision.decision !== 'allow') throw new Error(decision.message)
    if (decision.args) {
      if (!isRecord(output.args)) throw new Error(HARNESS_GATE_UNAVAILABLE)
      replaceArgs(output.args, decision.args)
    }
  }
}

export function shellEnvHook(site: SiteClient | null, config: OpenCodePluginConfig | null): ShellEnvHook {
  return async (input, output) => {
    const turn = site && input.sessionID ? await site.turn(input.sessionID) : null
    if (!turn || !config) throw new Error(NO_TURN_FOR_COMMAND)
    for (const name of [...ALWAYS_SECRET, ...config.secretEnv]) output.env[name] = ''
    Object.assign(output.env, config.commandEnv)
    // The staged skills are in run staging, outside the harness home, so commands read them without being told.
    if (!openCodeSkillsContainerDir(turn.conversationId)) throw new Error(NO_TURN_FOR_COMMAND)
    output.env[CONVERSATION_PROCESS_TAG] = turn.conversationId
  }
}

export function headersHook(site: SiteClient | null): HeadersHook {
  return async (input, output) => {
    const turn = site ? await site.turn(input.sessionID) : null
    if (turn) Object.assign(output.headers, turn.modelHeaders)
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}
