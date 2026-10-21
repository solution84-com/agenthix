/**
 * Each conversation's platform-tool connection on a shared OpenCode server,
 * and the session rules that let a conversation see only its own (spec §2,
 * "Keeping the gate whole" item 2).
 *
 * OpenCode names a connection's tools `<connection>_<tool>`, and a rule whose
 * pattern is `*` hides a denied tool from the model. So every connection's
 * name starts with one prefix; each session denies the prefix and then allows
 * its own connection. The last matching rule wins, so the session sees its
 * own tools and no other conversation's, whoever joins the server later — the
 * rules never need changing.
 *
 * A name is the prefix and a hash of the conversation's id: short enough that
 * `<connection>_<tool>` stays within the 64 characters providers allow a tool
 * name, the same after OpenCode's sanitising (`[a-zA-Z0-9_-]` only), and with
 * no `_` of its own, so `agx1…_` can never be the start of another name. Two
 * conversations whose names collide on one server are refused
 * (openCodeServers.ts), never merged.
 */
import { createHash } from 'node:crypto'

export const CONNECTION_PREFIX = 'agx'

export function openCodeConnectionName(conversationId: string): string {
  return CONNECTION_PREFIX + createHash('sha256').update(conversationId).digest('hex').slice(0, 12)
}

export type PermissionRule = { permission: string; pattern: string; action: 'allow' | 'deny' | 'ask' }

/**
 * A session's rules. They begin with Agenthix's whole set, as the server's
 * configuration has it, because OpenCode evaluates a session's rules after
 * every configuration source's: whatever another source says, these are final.
 * They end by denying `hiddenTools` — OpenCode permission keys for the
 * agent's withheld built-ins (openCodeHiddenBuiltins) and tool ids for its
 * withheld platform tools (openCodeHiddenPlatformTools) — so the model is not
 * shown them; the gate refuses them on call regardless.
 */
export function sessionPermissionRules(connectionName: string, hiddenTools: readonly string[] = []): PermissionRule[] {
  return [
    { permission: '*', pattern: '*', action: 'allow' },
    { permission: 'task', pattern: '*', action: 'deny' },
    { permission: 'question', pattern: '*', action: 'deny' },
    { permission: `${CONNECTION_PREFIX}*`, pattern: '*', action: 'deny' },
    { permission: `${connectionName}_*`, pattern: '*', action: 'allow' },
    { permission: 'skill', pattern: '*', action: 'allow' },
    ...hiddenTools.map(permission => ({ permission, pattern: '*', action: 'deny' as const })),
  ]
}

/** A platform tool's own name, from its OpenCode id on this connection; null for any other tool. */
export function platformToolName(openCodeTool: string, connectionName: string): string | null {
  const prefix = `${connectionName}_`
  return openCodeTool.startsWith(prefix) && openCodeTool.length > prefix.length ? openCodeTool.slice(prefix.length) : null
}
